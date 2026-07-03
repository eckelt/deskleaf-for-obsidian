import { readFileSync } from "node:fs";
import { describe, it, expect, vi } from "vitest";
import { Platform } from "obsidian";
import { DeskleafCalendarView } from "../src/calendar-view";
import { isEventReadOnly, validateEventEditInput } from "../src/event-edit";
import { parseICalendar } from "../src/ical-parser";
import { minsToISO, minsToTimeStr } from "../src/date-utils";
import {
  assignColumns,
  clampHourPx,
  DEFAULT_HOUR_PX,
  heightFromISO,
  hourPxForPinch,
  scrollTopForZoomAnchor,
  snapMins,
  topFromISO,
} from "../src/event-layout";
import type { CalendarEvent } from "../src/types";

// All tests run with TZ=UTC (set in package.json test script)

function makeEvent(id: string, start: string, end: string): CalendarEvent {
  return { id, title: `Event ${id}`, start, end };
}

class StyleDeclarations {
  private values = new Map<string, string>();

  setProperty(name: string, value: string): void {
    this.values.set(name, value);
  }

  getPropertyValue(name: string): string {
    return this.values.get(name) ?? "";
  }
}

class TestDocument {
  readonly body = new RenderElement("body");
  private readonly listeners = new Map<string, EventListenerOrEventListenerObject[]>();

  querySelector(selector: string): RenderElement | null {
    return this.body.querySelector(selector);
  }

  addEventListener(type: string, listener: EventListenerOrEventListenerObject): void {
    const listeners = this.listeners.get(type) ?? [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }

  removeEventListener(type: string, listener: EventListenerOrEventListenerObject): void {
    const listeners = this.listeners.get(type) ?? [];
    this.listeners.set(type, listeners.filter((registered) => registered !== listener));
  }

  dispatchEvent(event: Event, target: RenderElement): boolean {
    Object.defineProperty(event, "target", { value: target });
    const listeners = this.listeners.get(event.type) ?? [];
    listeners.forEach((listener) => {
      if (typeof listener === "function") listener.call(this, event);
      else listener.handleEvent(event);
    });
    return !event.defaultPrevented;
  }
}

class CalendarElement {
  readonly dataset: Record<string, string | undefined>;
  readonly style = new StyleDeclarations();
  private readonly matchesBySelector = new Map<string, CalendarElement[]>();

  constructor(dataset: Record<string, string> = {}) {
    this.dataset = { ...dataset };
  }

  setSelectorMatches(selector: string, matches: CalendarElement[]): void {
    this.matchesBySelector.set(selector, matches);
  }

  querySelectorAll(selector: string): CalendarElement[] {
    return this.matchesBySelector.get(selector) ?? [];
  }
}

type ClassValue = string | string[];

class RenderElement {
  readonly children: RenderElement[] = [];
  readonly dataset: Record<string, string | undefined> = {};
  readonly style = new StyleDeclarations();
  readonly classList = {
    add: (...classes: string[]): void => {
      classes.forEach((className) => this.classes.add(className));
    },
    contains: (className: string): boolean => this.classes.has(className),
  };
  textContent = "";
  value = "";
  disabled = false;
  step = "";
  scrollTop = 0;
  clientHeight = 720;
  offsetHeight = 20;
  isConnected = true;
  private parent: RenderElement | null = null;
  private readonly classes = new Set<string>();
  private readonly listenerCounts = new Map<string, number>();
  private readonly listeners = new Map<string, EventListenerOrEventListenerObject[]>();

  constructor(private readonly tagName = "div") {}

  empty(): void {
    this.children.forEach((child) => child.disconnect());
    this.children.length = 0;
  }

  createDiv(options?: string | { cls?: ClassValue; text?: string }): RenderElement {
    const child = new RenderElement("div");
    this.applyCreateOptions(child, options);
    this.appendChild(child);
    return child;
  }

  createEl(_tagName: string, options?: { cls?: ClassValue; text?: string }): RenderElement {
    const child = new RenderElement(_tagName);
    this.applyCreateOptions(child, options);
    this.appendChild(child);
    return child;
  }

  createSpan(options?: { cls?: ClassValue; text?: string }): RenderElement {
    const child = new RenderElement("span");
    this.applyCreateOptions(child, options);
    this.appendChild(child);
    return child;
  }

  appendChild(child: RenderElement): RenderElement {
    child.parent = this;
    child.connect();
    this.children.push(child);
    return child;
  }

  remove(): void {
    if (this.parent) {
      const index = this.parent.children.indexOf(this);
      if (index >= 0) this.parent.children.splice(index, 1);
    }
    this.parent = null;
    this.disconnect();
  }

  addClass(className: string): void {
    className.split(/\s+/).filter(Boolean).forEach((name) => this.classes.add(name));
  }

  removeClass(className: string): void {
    className.split(/\s+/).filter(Boolean).forEach((name) => this.classes.delete(name));
  }

  setText(text: string): void {
    this.textContent = text;
  }

  setAttribute(_name: string, _value: string): void {}

  focus(): void {}

  addEventListener(type: string, _listener: EventListenerOrEventListenerObject, _options?: AddEventListenerOptions): void {
    this.listenerCounts.set(type, this.eventListenerCount(type) + 1);
    const listeners = this.listeners.get(type) ?? [];
    listeners.push(_listener);
    this.listeners.set(type, listeners);
  }

  removeEventListener(type: string, listener: EventListenerOrEventListenerObject): void {
    const listeners = this.listeners.get(type) ?? [];
    const nextListeners = listeners.filter((registered) => registered !== listener);
    this.listeners.set(type, nextListeners);
    this.listenerCounts.set(type, nextListeners.length);
  }

  eventListenerCount(type: string): number {
    return this.listenerCounts.get(type) ?? 0;
  }

  dispatchEvent(event: Event): boolean {
    if (event.target === null) {
      Object.defineProperty(event, "target", { value: this });
    }
    const listeners = this.listeners.get(event.type) ?? [];
    listeners.forEach((listener) => {
      if (typeof listener === "function") listener.call(this, event);
      else listener.handleEvent(event);
    });
    return !event.defaultPrevented;
  }

  getBoundingClientRect(): { top: number } {
    return { top: 0 };
  }

  querySelector(selector: string): RenderElement | null {
    return this.querySelectorAll(selector)[0] ?? null;
  }

  querySelectorAll(selector: string): RenderElement[] {
    const result: RenderElement[] = [];
    this.collectMatches(selector, result);
    return result;
  }

  closest(selector: string): RenderElement | null {
    const selectors = selector.split(",").map((value) => value.trim());
    let current: RenderElement | null = this;
    while (current) {
      if (selectors.some((candidate) => current?.matches(candidate))) return current;
      current = current.parent;
    }
    return null;
  }

  contains(node: RenderElement): boolean {
    let current: RenderElement | null = node;
    while (current) {
      if (current === this) return true;
      current = current.parent;
    }
    return false;
  }

  private applyCreateOptions(child: RenderElement, options?: string | { cls?: ClassValue; text?: string }): void {
    if (typeof options === "string") {
      child.addClass(options);
      return;
    }
    const cls = options?.cls;
    if (typeof cls === "string") child.addClass(cls);
    else cls?.forEach((className) => child.addClass(className));
    if (options?.text !== undefined) child.setText(options.text);
  }

  private collectMatches(selector: string, result: RenderElement[]): void {
    for (const child of this.children) {
      if (child.matches(selector)) result.push(child);
      child.collectMatches(selector, result);
    }
  }

  private matches(selector: string): boolean {
    if (selector.startsWith(".")) {
      return selector
        .split(".")
        .filter(Boolean)
        .every((className) => this.classes.has(className));
    }
    if (selector.startsWith("[") && selector.endsWith("]")) {
      const name = selector.slice(1, -1).replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase());
      return this.dataset[name] !== undefined;
    }
    return this.tagName === selector;
  }

  private connect(): void {
    this.isConnected = true;
    this.children.forEach((child) => child.connect());
  }

  private disconnect(): void {
    this.isConnected = false;
    this.children.forEach((child) => child.disconnect());
  }
}

function applyHourPxToGrid(hourPx: number, grid: CalendarElement): void {
  const method = Reflect.get(DeskleafCalendarView.prototype, "applyHourPxToGrid");
  if (typeof method !== "function") {
    throw new Error("applyHourPxToGrid is not available");
  }
  method.call({ hourPx }, grid);
}

function cssValue(element: CalendarElement, property: string): string {
  return element.style.getPropertyValue(property);
}

function renderCssValue(element: RenderElement, property: string): string {
  return element.style.getPropertyValue(property);
}

function cssRule(selector: string): string {
  const styles = readFileSync(new URL("../styles.css", import.meta.url), "utf8");
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = new RegExp(`${escapedSelector}\\s*\\{([^}]*)\\}`).exec(styles);
  if (!match) throw new Error(`CSS rule ${selector} was not found`);
  return match[1];
}

function createCalendarViewHarness(): object {
  const header = new RenderElement();
  const root = new RenderElement();
  const containerEl = new RenderElement();
  containerEl.appendChild(header);
  containerEl.appendChild(root);
  return Object.assign(Object.create(DeskleafCalendarView.prototype), {
    app: {
      workspace: {
        trigger: (): void => {},
      },
    },
    plugin: {
      calendarReader: {
        createEvent: vi.fn(async (): Promise<void> => {}),
        getAllDayEventsForDate: (): CalendarEvent[] => [],
        getEvents: (): CalendarEvent[] => [],
        getEventsForDate: (): CalendarEvent[] => [],
        getLoadError: (): string | null => null,
        getPath: (): string => "/calendar",
      },
      icalFeedManager: {
        getAllEvents: (): CalendarEvent[] => [],
        getWarnFeeds: (): unknown[] => [],
      },
      noteManager: {
        buildNoteCache: (): Map<string, unknown> => new Map(),
      },
      settings: {
        businessHours: {
          enabled: false,
          start: "09:00",
          end: "17:00",
          days: [1, 2, 3, 4, 5],
        },
        caldav: {
          discoveredCalendars: [
            { href: "/work/", displayName: "Work" },
            { href: "/home/", displayName: "Home" },
          ],
          selectedCalendars: [],
        },
        icalSubscriptions: [],
      },
    },
    containerEl,
    anchor: new Date("2026-05-04T12:00:00Z"),
    visibleDays: 3,
    selection: null,
    noteCache: new Map(),
    lastAnchorStr: null,
    lastVisibleDays: 0,
    initialScrollDone: false,
    navLabelEl: null,
    carouselTracks: [],
    slideDir: 0,
    desktopSlideZone: null,
    preserveScrollForNextRender: null,
    dragCreate: null,
    activeTouchCreateCleanup: null,
    hourPx: DEFAULT_HOUR_PX,
  });
}

function createCalendarViewHarnessWithEvents(events: CalendarEvent[]): object {
  const view = createCalendarViewHarness();
  const calendarReader = Reflect.get(Reflect.get(view, "plugin"), "calendarReader");
  calendarReader.getEvents = (): CalendarEvent[] => events;
  calendarReader.getEventsForDate = (date: string): CalendarEvent[] =>
    events.filter((event) => event.start.slice(0, 10) === date);
  return view;
}

function openWritableEditFormForCloseTest(options: { mobile: boolean }): {
  surface: RenderElement;
  testDocument: TestDocument;
  updateEvent: ReturnType<typeof vi.fn>;
  syncEventNote: ReturnType<typeof vi.fn>;
  restorePlatform: () => void;
} {
  vi.useFakeTimers();
  vi.stubGlobal("window", {
    clearTimeout,
    innerHeight: options.mobile ? 720 : 800,
    innerWidth: options.mobile ? 390 : 1200,
    setTimeout,
  });
  const testDocument = new TestDocument();
  vi.stubGlobal("document", testDocument);
  const wasMobile = Platform.isMobile;
  const wasDesktop = Platform.isDesktop;
  Platform.isMobile = options.mobile;
  Platform.isDesktop = !options.mobile;

  const event: CalendarEvent = {
    id: "event-1",
    title: "Planning review",
    start: "2026-05-04T10:15:00Z",
    end: "2026-05-04T11:45:00Z",
    location: "Room 1",
    body: "Review current milestones",
    calendar: "Work",
  };
  const view = createCalendarViewHarnessWithEvents([event]);
  const plugin = Reflect.get(view, "plugin");
  const calendarReader = Reflect.get(plugin, "calendarReader");
  const noteManager = Reflect.get(plugin, "noteManager");
  const updateEvent = vi.fn(async (): Promise<void> => {});
  const syncEventNote = vi.fn(async (): Promise<void> => {});
  Reflect.set(calendarReader, "updateEvent", updateEvent);
  Reflect.set(noteManager, "syncEventNote", syncEventNote);

  const source = options.mobile
    ? makeTouchEvent("touchend", [{ clientX: 120, clientY: 160 }])
    : makeMouseEvent("click");
  callViewMethod(view, "showEventEditPopover", event, "2026-05-04", source, false);
  vi.runOnlyPendingTimers();

  const surface = testDocument.body.querySelector(options.mobile ? ".dl-edit-sheet" : ".dl-edit-dialog");
  if (!surface) throw new Error("edit surface was not rendered");

  return {
    surface,
    testDocument,
    updateEvent,
    syncEventNote,
    restorePlatform: () => {
      Platform.isMobile = wasMobile;
      Platform.isDesktop = wasDesktop;
    },
  };
}

function callViewMethod(view: object, name: string, ...args: unknown[]): void {
  const method = Reflect.get(DeskleafCalendarView.prototype, name);
  if (typeof method !== "function") {
    throw new Error(`${name} is not available`);
  }
  method.call(view, ...args);
}

function renderedGrid(view: object): RenderElement {
  const containerEl = Reflect.get(view, "containerEl");
  if (!(containerEl instanceof RenderElement)) {
    throw new Error("calendar view harness has no container");
  }
  const grid = containerEl.querySelector(".dl-time-grid");
  if (!grid) throw new Error("calendar grid was not rendered");
  return grid;
}

function renderedBodyColumns(view: object): string[][] {
  const bodyInner = renderedGrid(view).querySelector(".dl-grid-body-inner");
  if (!bodyInner) throw new Error("calendar body was not rendered");
  return bodyInner.children
    .filter((child) => child.classList.contains("dl-day-body"))
    .map((child) => {
      if (child.dataset.date) return [child.dataset.date];
      return child.children
        .filter((subChild) => subChild.classList.contains("dl-day-body"))
        .map((subChild) => {
          if (!subChild.dataset.date) throw new Error("day body has no date");
          return subChild.dataset.date;
        });
    });
}

function makeTouchEvent(type: string, touches: { clientX: number; clientY: number }[]): Event {
  const event = new Event(type, { cancelable: true });
  Object.defineProperty(event, "touches", { value: touches });
  Object.defineProperty(event, "changedTouches", { value: touches });
  return event;
}

function makeMouseEvent(type: string): Event {
  const event = new Event(type, { cancelable: true });
  Object.defineProperty(event, "button", { value: 0 });
  Object.defineProperty(event, "bubbles", { value: true });
  Object.defineProperty(event, "ctrlKey", { value: false });
  Object.defineProperty(event, "metaKey", { value: false });
  return event;
}

function makePointerMouseEvent(type: string, clientY: number): Event {
  const event = makeMouseEvent(type);
  Object.defineProperty(event, "clientX", { value: 120 });
  Object.defineProperty(event, "clientY", { value: clientY });
  return event;
}

function makeKeyboardEvent(type: string, key: string): Event {
  const event = new Event(type, { cancelable: true });
  Object.defineProperty(event, "key", { value: key });
  return event;
}

function makeWheelEvent(deltaY: number, clientY: number, ctrlKey: boolean): Event {
  const event = new Event("wheel", { cancelable: true });
  Object.defineProperty(event, "deltaY", { value: deltaY });
  Object.defineProperty(event, "clientY", { value: clientY });
  Object.defineProperty(event, "ctrlKey", { value: ctrlKey });
  return event;
}

function renderText(element: RenderElement): string {
  return [element.textContent, ...element.children.map(renderText)].join("");
}

describe("topFromISO", () => {
  it("midnight = 0px", () => {
    expect(topFromISO("2026-05-04T00:00:00+00:00")).toBe(0);
  });

  it("08:00 = 8 * DEFAULT_HOUR_PX", () => {
    expect(topFromISO("2026-05-04T08:00:00+00:00")).toBe(8 * DEFAULT_HOUR_PX);
  });

  it("12:30 = 12.5 * DEFAULT_HOUR_PX", () => {
    expect(topFromISO("2026-05-04T12:30:00+00:00")).toBe(12.5 * DEFAULT_HOUR_PX);
  });

  it("23:59 is near day end", () => {
    const top = topFromISO("2026-05-04T23:59:00+00:00");
    expect(top).toBeCloseTo((23 + 59 / 60) * DEFAULT_HOUR_PX, 0);
  });

  it("uses the provided hour height", () => {
    expect(topFromISO("2026-05-04T08:30:00+00:00", 40)).toBe(8.5 * 40);
    expect(topFromISO("2026-05-04T08:30:00+00:00", 180)).toBe(8.5 * 180);
  });
});

describe("heightFromISO", () => {
  it("1 hour = DEFAULT_HOUR_PX", () => {
    expect(heightFromISO("2026-05-04T10:00:00+00:00", "2026-05-04T11:00:00+00:00")).toBe(DEFAULT_HOUR_PX);
  });

  it("30 minutes = DEFAULT_HOUR_PX / 2", () => {
    expect(heightFromISO("2026-05-04T10:00:00+00:00", "2026-05-04T10:30:00+00:00")).toBe(DEFAULT_HOUR_PX / 2);
  });

  it("short events have minimum height of 20px", () => {
    // 5 minutes = 5/60 * 64 ≈ 5.3px, but min is 20
    expect(heightFromISO("2026-05-04T10:00:00+00:00", "2026-05-04T10:05:00+00:00")).toBe(20);
  });

  it("2 hours", () => {
    expect(heightFromISO("2026-05-04T10:00:00+00:00", "2026-05-04T12:00:00+00:00")).toBe(2 * DEFAULT_HOUR_PX);
  });

  it("uses the provided hour height", () => {
    expect(heightFromISO("2026-05-04T10:00:00+00:00", "2026-05-04T12:00:00+00:00", 40)).toBe(80);
    expect(heightFromISO("2026-05-04T10:00:00+00:00", "2026-05-04T12:00:00+00:00", 180)).toBe(360);
  });
});

describe("zoom geometry", () => {
  it("clamps the lower bound so the full day fits the viewport", () => {
    expect(clampHourPx(10, 720)).toBe(30);
  });

  it("clamps the upper bound so exactly four hours fill the viewport", () => {
    expect(clampHourPx(250, 720)).toBe(180);
  });

  it("keeps values inside the viewport-derived bounds unchanged", () => {
    expect(clampHourPx(64, 720)).toBe(64);
  });

  it("derives pinch zoom from touch-distance scale and clamps it", () => {
    expect(hourPxForPinch(64, 100, 150, 720)).toBe(96);
    expect(hourPxForPinch(64, 100, 500, 720)).toBe(180);
    expect(hourPxForPinch(64, 100, 10, 720)).toBe(30);
  });

  it("keeps the time under the pinch midpoint anchored while zooming", () => {
    const scrollTop = scrollTopForZoomAnchor({
      oldHourPx: 60,
      newHourPx: 120,
      scrollTop: 300,
      viewportOffsetY: 150,
    });

    expect(scrollTop).toBe(750);
  });

  it("scales every hour-dependent calendar element with the current zoom level", () => {
    const hourLine = new CalendarElement({ hourOffset: "9" });
    const halfHourLine = new CalendarElement({ hourOffset: "9.5" });
    const timeLabel = new CalendarElement({ hourOffset: "8" });
    const nowLine = new CalendarElement({ hourOffset: "10.25" });
    const businessHours = new CalendarElement({
      hourOffset: "9",
      hourDuration: "8",
    });
    const eventCard = new CalendarElement({
      eventTopHours: "10",
      eventHeightHours: "1.5",
      eventTopOffset: "1",
      eventHeightOffset: "-2",
      eventMinHeight: "0",
    });
    const dragGhost = new CalendarElement({
      eventTopHours: "13",
      eventHeightHours: "0.5",
      eventTopOffset: "0",
      eventHeightOffset: "0",
      eventMinHeight: "14",
    });
    const grid = new CalendarElement();
    grid.setSelectorMatches("[data-hour-offset]", [
      hourLine,
      halfHourLine,
      timeLabel,
      nowLine,
      businessHours,
    ]);
    grid.setSelectorMatches("[data-hour-duration]", [businessHours]);
    grid.setSelectorMatches("[data-event-top-hours]", [eventCard, dragGhost]);

    applyHourPxToGrid(40, grid);

    expect(cssValue(grid, "--f-hour-px")).toBe("40px");
    expect(cssValue(grid, "--f-grid-height")).toBe("960px");
    expect(cssValue(hourLine, "--f-hour-top")).toBe("360px");
    expect(cssValue(halfHourLine, "--f-hour-top")).toBe("380px");
    expect(cssValue(timeLabel, "--f-hour-top")).toBe("320px");
    expect(cssValue(nowLine, "--f-hour-top")).toBe("410px");
    expect(cssValue(businessHours, "--f-hour-top")).toBe("360px");
    expect(cssValue(businessHours, "--f-hour-height")).toBe("320px");
    expect(cssValue(eventCard, "--f-event-top")).toBe("401px");
    expect(cssValue(eventCard, "--f-event-height")).toBe("58px");
    expect(cssValue(dragGhost, "--f-event-top")).toBe("520px");
    expect(cssValue(dragGhost, "--f-event-height")).toBe("20px");

    applyHourPxToGrid(100, grid);

    expect(cssValue(grid, "--f-hour-px")).toBe("100px");
    expect(cssValue(grid, "--f-grid-height")).toBe("2400px");
    expect(cssValue(hourLine, "--f-hour-top")).toBe("900px");
    expect(cssValue(halfHourLine, "--f-hour-top")).toBe("950px");
    expect(cssValue(timeLabel, "--f-hour-top")).toBe("800px");
    expect(cssValue(nowLine, "--f-hour-top")).toBe("1025px");
    expect(cssValue(businessHours, "--f-hour-top")).toBe("900px");
    expect(cssValue(businessHours, "--f-hour-height")).toBe("800px");
    expect(cssValue(eventCard, "--f-event-top")).toBe("1001px");
    expect(cssValue(eventCard, "--f-event-height")).toBe("148px");
    expect(cssValue(dragGhost, "--f-event-top")).toBe("1300px");
    expect(cssValue(dragGhost, "--f-event-height")).toBe("50px");
  });

  it("keeps the selected zoom level across re-renders and calendar navigation", () => {
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback): number => {
      callback(0);
      return 1;
    });
    const wasMobile = Platform.isMobile;
    const wasDesktop = Platform.isDesktop;

    try {
      Platform.isMobile = true;
      Platform.isDesktop = false;
      const view = createCalendarViewHarness();

      callViewMethod(view, "render");
      expect(renderCssValue(renderedGrid(view), "--f-hour-px")).toBe(`${DEFAULT_HOUR_PX}px`);

      Reflect.set(view, "hourPx", 112);
      callViewMethod(view, "render");
      expect(renderCssValue(renderedGrid(view), "--f-hour-px")).toBe("112px");

      callViewMethod(view, "navigate", 1);
      expect(renderCssValue(renderedGrid(view), "--f-hour-px")).toBe("112px");

      callViewMethod(view, "navigate", -1);
      expect(renderCssValue(renderedGrid(view), "--f-hour-px")).toBe("112px");
    } finally {
      Platform.isMobile = wasMobile;
      Platform.isDesktop = wasDesktop;
      vi.unstubAllGlobals();
    }
  });

  it("handles a two-finger mobile pinch on the rendered calendar body", () => {
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback): number => {
      callback(0);
      return 1;
    });
    const wasMobile = Platform.isMobile;
    const wasDesktop = Platform.isDesktop;

    try {
      Platform.isMobile = true;
      Platform.isDesktop = false;
      const view = createCalendarViewHarness();

      callViewMethod(view, "render");

      const grid = renderedGrid(view);
      const bodyScroll = grid.querySelector(".dl-grid-body-scroll");
      if (!bodyScroll) throw new Error("calendar body scroll was not rendered");
      bodyScroll.scrollTop = 300;

      const startEvent = makeTouchEvent("touchstart", [
        { clientX: 0, clientY: 100 },
        { clientX: 100, clientY: 100 },
      ]);
      const moveEvent = makeTouchEvent("touchmove", [
        { clientX: 0, clientY: 100 },
        { clientX: 200, clientY: 100 },
      ]);

      bodyScroll.dispatchEvent(startEvent);
      bodyScroll.dispatchEvent(moveEvent);

      expect(startEvent.defaultPrevented).toBe(false);
      expect(moveEvent.defaultPrevented).toBe(true);
      expect(renderCssValue(grid, "--f-hour-px")).toBe("128px");
      expect(renderCssValue(grid, "--f-grid-height")).toBe("3072px");
      expect(bodyScroll.scrollTop).toBe(700);
    } finally {
      Platform.isMobile = wasMobile;
      Platform.isDesktop = wasDesktop;
      vi.unstubAllGlobals();
    }
  });

  it("keeps visible date columns unchanged when the zoom level changes", () => {
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback): number => {
      callback(0);
      return 1;
    });

    try {
      const view = createCalendarViewHarness();
      Reflect.set(view, "anchor", new Date("2026-05-08T12:00:00Z"));
      Reflect.set(view, "visibleDays", 3);

      callViewMethod(view, "render");
      const nDayColumns = renderedBodyColumns(view);

      Reflect.set(view, "hourPx", 140);
      callViewMethod(view, "render");

      expect(renderedBodyColumns(view)).toEqual(nDayColumns);
      expect(nDayColumns).toEqual([
        ["2026-05-08"],
        ["2026-05-09", "2026-05-10"],
        ["2026-05-11"],
      ]);

      Reflect.set(view, "anchor", new Date("2026-05-07T12:00:00Z"));
      Reflect.set(view, "visibleDays", 6);
      Reflect.set(view, "hourPx", DEFAULT_HOUR_PX);
      callViewMethod(view, "render");
      const weekColumns = renderedBodyColumns(view);

      Reflect.set(view, "hourPx", 90);
      callViewMethod(view, "render");

      expect(renderedBodyColumns(view)).toEqual(weekColumns);
      expect(weekColumns).toEqual([
        ["2026-05-04"],
        ["2026-05-05"],
        ["2026-05-06"],
        ["2026-05-07"],
        ["2026-05-08"],
        ["2026-05-09", "2026-05-10"],
      ]);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("does not zoom or navigate for a stable two-finger touch movement", () => {
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback): number => {
      callback(0);
      return 1;
    });
    const wasMobile = Platform.isMobile;
    const wasDesktop = Platform.isDesktop;

    try {
      Platform.isMobile = true;
      Platform.isDesktop = false;
      const view = createCalendarViewHarness();

      callViewMethod(view, "render");

      const grid = renderedGrid(view);
      const bodyScroll = grid.querySelector(".dl-grid-body-scroll");
      if (!bodyScroll) throw new Error("calendar body scroll was not rendered");

      bodyScroll.dispatchEvent(makeTouchEvent("touchstart", [
        { clientX: 0, clientY: 100 },
        { clientX: 100, clientY: 100 },
      ]));
      const stableMoveEvent = makeTouchEvent("touchmove", [
        { clientX: 20, clientY: 120 },
        { clientX: 120, clientY: 120 },
      ]);
      bodyScroll.dispatchEvent(stableMoveEvent);
      bodyScroll.dispatchEvent(makeTouchEvent("touchend", [
        { clientX: 20, clientY: 120 },
        { clientX: 120, clientY: 120 },
      ]));

      expect(stableMoveEvent.defaultPrevented).toBe(false);
      expect(renderCssValue(grid, "--f-hour-px")).toBe(`${DEFAULT_HOUR_PX}px`);
      expect(Reflect.get(view, "anchor")).toEqual(new Date("2026-05-04T12:00:00Z"));
    } finally {
      Platform.isMobile = wasMobile;
      Platform.isDesktop = wasDesktop;
      vi.unstubAllGlobals();
    }
  });

  it("zooms through touchend without starting drag-to-create on an empty day body", () => {
    vi.useFakeTimers();
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback): number => {
      callback(0);
      return 1;
    });
    vi.stubGlobal("window", {
      clearTimeout,
      innerWidth: 390,
      setTimeout,
    });
    vi.stubGlobal("navigator", {});
    const wasMobile = Platform.isMobile;
    const wasDesktop = Platform.isDesktop;

    try {
      Platform.isMobile = true;
      Platform.isDesktop = false;
      const view = createCalendarViewHarness();

      callViewMethod(view, "render");

      const grid = renderedGrid(view);
      const bodyScroll = grid.querySelector(".dl-grid-body-scroll");
      if (!bodyScroll) throw new Error("calendar body scroll was not rendered");
      const dayBody = grid.querySelectorAll(".dl-day-body")
        .find((element) => element.dataset.date);
      if (!dayBody) throw new Error("calendar day body was not rendered");
      const createEvent = Reflect.get(Reflect.get(Reflect.get(view, "plugin"), "calendarReader"), "createEvent");

      const startEvent = makeTouchEvent("touchstart", [
        { clientX: 120, clientY: 160 },
        { clientX: 220, clientY: 160 },
      ]);
      dayBody.dispatchEvent(startEvent);
      bodyScroll.dispatchEvent(makeTouchEvent("touchstart", [
        { clientX: 120, clientY: 160 },
        { clientX: 220, clientY: 160 },
      ]));
      const moveEvent = makeTouchEvent("touchmove", [
        { clientX: 120, clientY: 160 },
        { clientX: 270, clientY: 160 },
      ]);
      bodyScroll.dispatchEvent(moveEvent);
      bodyScroll.dispatchEvent(makeTouchEvent("touchend", []));
      vi.advanceTimersByTime(400);

      expect(startEvent.defaultPrevented).toBe(false);
      expect(moveEvent.defaultPrevented).toBe(true);
      expect(renderCssValue(grid, "--f-hour-px")).toBe("96px");
      expect(dayBody.querySelector(".dl-ghost-event")).toBeNull();
      expect(Reflect.get(view, "activeTouchCreateCleanup")).toBeNull();
      expect(Reflect.get(view, "dragCreate")).toBeNull();
      expect(createEvent).toHaveBeenCalledTimes(0);
    } finally {
      Platform.isMobile = wasMobile;
      Platform.isDesktop = wasDesktop;
      vi.useRealTimers();
      vi.unstubAllGlobals();
    }
  });

  it("cancels pending drag-to-create when a second touch joins on an empty day body", () => {
    vi.useFakeTimers();
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback): number => {
      callback(0);
      return 1;
    });
    vi.stubGlobal("window", {
      clearTimeout,
      innerWidth: 390,
      setTimeout,
    });
    vi.stubGlobal("navigator", {});
    const wasMobile = Platform.isMobile;
    const wasDesktop = Platform.isDesktop;

    try {
      Platform.isMobile = true;
      Platform.isDesktop = false;
      const view = createCalendarViewHarness();

      callViewMethod(view, "render");

      const dayBody = renderedGrid(view).querySelectorAll(".dl-day-body")
        .find((element) => element.dataset.date);
      if (!dayBody) throw new Error("calendar day body was not rendered");

      dayBody.dispatchEvent(makeTouchEvent("touchstart", [{ clientX: 120, clientY: 160 }]));
      dayBody.dispatchEvent(makeTouchEvent("touchstart", [
        { clientX: 120, clientY: 160 },
        { clientX: 220, clientY: 160 },
      ]));
      vi.advanceTimersByTime(400);

      expect(dayBody.querySelector(".dl-ghost-event")).toBeNull();
      expect(Reflect.get(view, "activeTouchCreateCleanup")).toBeNull();
      expect(Reflect.get(view, "dragCreate")).toBeNull();
    } finally {
      Platform.isMobile = wasMobile;
      Platform.isDesktop = wasDesktop;
      vi.useRealTimers();
      vi.unstubAllGlobals();
    }
  });

  it("keeps one-finger mobile swipe navigation working", () => {
    vi.useFakeTimers();
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback): number => {
      callback(0);
      return 1;
    });
    vi.stubGlobal("window", { innerWidth: 390 });
    const wasMobile = Platform.isMobile;
    const wasDesktop = Platform.isDesktop;

    try {
      Platform.isMobile = true;
      Platform.isDesktop = false;
      const view = createCalendarViewHarness();

      callViewMethod(view, "render");

      const grid = renderedGrid(view);
      const bodyScroll = grid.querySelector(".dl-grid-body-scroll");
      if (!bodyScroll) throw new Error("calendar body scroll was not rendered");
      bodyScroll.scrollTop = 240;

      grid.dispatchEvent(makeTouchEvent("touchstart", [{ clientX: 200, clientY: 120 }]));
      const moveEvent = makeTouchEvent("touchmove", [{ clientX: 120, clientY: 130 }]);
      grid.dispatchEvent(moveEvent);
      grid.dispatchEvent(makeTouchEvent("touchend", [{ clientX: 120, clientY: 130 }]));

      expect(moveEvent.defaultPrevented).toBe(true);
      expect(Reflect.get(view, "anchor")).toEqual(new Date("2026-05-04T12:00:00Z"));

      vi.advanceTimersByTime(260);

      expect(Reflect.get(view, "anchor")).toEqual(new Date("2026-05-05T12:00:00Z"));
      expect(renderCssValue(renderedGrid(view), "--f-hour-px")).toBe(`${DEFAULT_HOUR_PX}px`);
    } finally {
      Platform.isMobile = wasMobile;
      Platform.isDesktop = wasDesktop;
      vi.useRealTimers();
      vi.unstubAllGlobals();
    }
  });

  it("leaves vertical one-finger mobile movement to native scrolling", () => {
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback): number => {
      callback(0);
      return 1;
    });
    vi.stubGlobal("window", { innerWidth: 390 });
    const wasMobile = Platform.isMobile;
    const wasDesktop = Platform.isDesktop;

    try {
      Platform.isMobile = true;
      Platform.isDesktop = false;
      const view = createCalendarViewHarness();

      callViewMethod(view, "render");

      const grid = renderedGrid(view);
      grid.dispatchEvent(makeTouchEvent("touchstart", [{ clientX: 200, clientY: 120 }]));
      const moveEvent = makeTouchEvent("touchmove", [{ clientX: 205, clientY: 240 }]);
      grid.dispatchEvent(moveEvent);
      grid.dispatchEvent(makeTouchEvent("touchend", [{ clientX: 205, clientY: 240 }]));

      expect(moveEvent.defaultPrevented).toBe(false);
      expect(Reflect.get(view, "anchor")).toEqual(new Date("2026-05-04T12:00:00Z"));
      expect(renderCssValue(renderedGrid(view), "--f-hour-px")).toBe(`${DEFAULT_HOUR_PX}px`);
    } finally {
      Platform.isMobile = wasMobile;
      Platform.isDesktop = wasDesktop;
      vi.unstubAllGlobals();
    }
  });

  it("leaves one-finger horizontal edge movement to Obsidian edge gestures", () => {
    vi.useFakeTimers();
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback): number => {
      callback(0);
      return 1;
    });
    vi.stubGlobal("window", { innerWidth: 390 });
    const wasMobile = Platform.isMobile;
    const wasDesktop = Platform.isDesktop;

    try {
      Platform.isMobile = true;
      Platform.isDesktop = false;
      const view = createCalendarViewHarness();

      callViewMethod(view, "render");

      const grid = renderedGrid(view);
      grid.dispatchEvent(makeTouchEvent("touchstart", [{ clientX: 40, clientY: 120 }]));
      const moveEvent = makeTouchEvent("touchmove", [{ clientX: 160, clientY: 130 }]);
      grid.dispatchEvent(moveEvent);
      grid.dispatchEvent(makeTouchEvent("touchend", [{ clientX: 160, clientY: 130 }]));
      vi.advanceTimersByTime(300);

      expect(moveEvent.defaultPrevented).toBe(false);
      expect(Reflect.get(view, "anchor")).toEqual(new Date("2026-05-04T12:00:00Z"));
      expect(renderCssValue(renderedGrid(view), "--f-hour-px")).toBe(`${DEFAULT_HOUR_PX}px`);
    } finally {
      Platform.isMobile = wasMobile;
      Platform.isDesktop = wasDesktop;
      vi.useRealTimers();
      vi.unstubAllGlobals();
    }
  });

  it("handles a desktop trackpad pinch as calendar zoom and consumes the app zoom event", () => {
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback): number => {
      callback(0);
      return 1;
    });
    const wasMobile = Platform.isMobile;
    const wasDesktop = Platform.isDesktop;

    try {
      Platform.isMobile = false;
      Platform.isDesktop = true;
      const view = createCalendarViewHarness();

      callViewMethod(view, "render");

      const grid = renderedGrid(view);
      const bodyScroll = grid.querySelector(".dl-grid-body-scroll");
      if (!bodyScroll) throw new Error("calendar body scroll was not rendered");
      bodyScroll.scrollTop = 300;

      expect(renderCssValue(grid, "--f-hour-px")).toBe(`${DEFAULT_HOUR_PX}px`);
      expect(bodyScroll.eventListenerCount("wheel")).toBe(1);
      expect(bodyScroll.eventListenerCount("touchstart")).toBe(0);
      expect(bodyScroll.eventListenerCount("touchmove")).toBe(0);
      expect(bodyScroll.eventListenerCount("touchend")).toBe(0);
      expect(bodyScroll.eventListenerCount("touchcancel")).toBe(0);

      const normalScrollEvent = makeWheelEvent(120, 100, false);
      bodyScroll.dispatchEvent(normalScrollEvent);
      expect(normalScrollEvent.defaultPrevented).toBe(false);
      expect(renderCssValue(grid, "--f-hour-px")).toBe(`${DEFAULT_HOUR_PX}px`);

      const pinchEvent = makeWheelEvent(-100, 100, true);
      bodyScroll.dispatchEvent(pinchEvent);

      expect(pinchEvent.defaultPrevented).toBe(true);
      expect(renderCssValue(grid, "--f-hour-px")).toBe(`${Math.E * DEFAULT_HOUR_PX}px`);
      expect(bodyScroll.scrollTop).toBeCloseTo((400 / DEFAULT_HOUR_PX) * Math.E * DEFAULT_HOUR_PX - 100);

      callViewMethod(view, "render");
      expect(renderCssValue(renderedGrid(view), "--f-hour-px")).toBe(`${Math.E * DEFAULT_HOUR_PX}px`);
    } finally {
      Platform.isMobile = wasMobile;
      Platform.isDesktop = wasDesktop;
      vi.unstubAllGlobals();
    }
  });
});

describe("snapMins", () => {
  it("0 stays 0", () => expect(snapMins(0)).toBe(0));
  it("7 snaps to 0", () => expect(snapMins(7)).toBe(0));
  it("8 snaps to 15", () => expect(snapMins(8)).toBe(15));
  it("22 snaps to 15", () => expect(snapMins(22)).toBe(15));
  it("23 snaps to 30", () => expect(snapMins(23)).toBe(30));
  it("60 stays 60", () => expect(snapMins(60)).toBe(60));
  it("90 stays 90", () => expect(snapMins(90)).toBe(90));
});

describe("minsToTimeStr", () => {
  it("0 → 00:00", () => expect(minsToTimeStr(0)).toBe("00:00"));
  it("90 → 01:30", () => expect(minsToTimeStr(90)).toBe("01:30"));
  it("510 → 08:30", () => expect(minsToTimeStr(510)).toBe("08:30"));
  it("1439 → 23:59", () => expect(minsToTimeStr(1439)).toBe("23:59"));
});

describe("minsToISO", () => {
  it("produces a valid ISO 8601 datetime string", () => {
    const result = minsToISO("2026-05-04", 510); // 08:30
    expect(result).toMatch(/^2026-05-04T08:30:00[+-]\d{2}:\d{2}$/);
  });

  it("encodes the date in the output", () => {
    expect(minsToISO("2026-12-31", 0)).toMatch(/^2026-12-31T00:00:00/);
  });
});

describe("event edit rules", () => {
  it("treats feed, all-day, cancelled and non-organizer events as read-only", () => {
    const editable = makeEvent("editable", "2026-05-04T10:00:00Z", "2026-05-04T11:00:00Z");

    expect(isEventReadOnly(editable)).toBe(false);
    expect(isEventReadOnly({ ...editable, id: "ical:feed:event" })).toBe(true);
    expect(isEventReadOnly({ ...editable, isAllDay: true })).toBe(true);
    expect(isEventReadOnly({ ...editable, isCancelled: true })).toBe(true);
    expect(isEventReadOnly({ ...editable, isOrganizer: false })).toBe(true);
  });

  it("keeps normal CalDAV parsed events writable unless another read-only rule applies", () => {
    const events = parseICalendar([
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "BEGIN:VEVENT",
      "UID:caldav-own-event",
      "SUMMARY:Writable CalDAV Event",
      "DTSTART:20260626T090000Z",
      "DTEND:20260626T100000Z",
      "ORGANIZER;CN=Nils:mailto:nils@example.com",
      "END:VEVENT",
      "END:VCALENDAR",
      "",
    ].join("\r\n"), "Work");

    expect(events).toHaveLength(1);
    expect(events[0].isOrganizer).toBeUndefined();
    expect(isEventReadOnly(events[0])).toBe(false);
  });

  it("builds an update for valid edit input", () => {
    expect(validateEventEditInput({
      title: "  Planning  ",
      startDate: "2026-05-04",
      endDate: "2026-05-04",
      startTime: "10:00",
      endTime: "11:30",
      location: "  Room 1  ",
      notes: "  Agenda  ",
      calendar: "  Work  ",
    })).toEqual({
      title: "Planning",
      start: "2026-05-04T10:00:00+00:00",
      end: "2026-05-04T11:30:00+00:00",
      location: "Room 1",
      notes: "Agenda",
      calendar: "Work",
    });
  });

  it("rejects invalid edit input", () => {
    const validInput = {
      title: "Planning",
      startDate: "2026-05-04",
      endDate: "2026-05-04",
      startTime: "10:00",
      endTime: "11:00",
      location: "",
      notes: "",
      calendar: "Work",
    };

    expect(validateEventEditInput({ ...validInput, title: " " })).toBeNull();
    expect(validateEventEditInput({ ...validInput, startTime: "" })).toBeNull();
    expect(validateEventEditInput({ ...validInput, endTime: "" })).toBeNull();
    expect(validateEventEditInput({ ...validInput, endTime: "10:00" })).toBeNull();
  });
});

describe("event edit interactions", () => {
  it("keeps the create popover writable after the edit form redesign", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("window", {
      clearTimeout,
      innerHeight: 800,
      innerWidth: 1200,
      setTimeout,
    });
    const testDocument = new TestDocument();
    vi.stubGlobal("document", testDocument);
    const wasMobile = Platform.isMobile;
    const wasDesktop = Platform.isDesktop;

    try {
      Platform.isMobile = false;
      Platform.isDesktop = true;
      const view = createCalendarViewHarness();
      const calendarReader = Reflect.get(Reflect.get(view, "plugin"), "calendarReader");
      const createEvent = vi.fn(async (): Promise<void> => {});
      Reflect.set(calendarReader, "createEvent", createEvent);

      callViewMethod(view, "showCreatePopover", "2026-05-04", 600, 660, { clientX: 240, clientY: 180 });
      vi.runOnlyPendingTimers();

      const popover = testDocument.body.querySelector(".dl-create-popover");
      if (!popover) throw new Error("create popover was not rendered");

      const textInputs = popover.querySelectorAll(".dl-create-input");
      const timeInputs = popover.querySelectorAll(".dl-create-time-input");
      const descriptionInput = popover.querySelector(".dl-create-desc");
      const homeCalendar = popover
        .querySelectorAll(".dl-create-cal-chip")
        .find((chip) => renderText(chip) === "Home");
      const createButton = popover
        .querySelectorAll(".dl-create-btn")
        .find((button) => renderText(button) === "Erstellen");

      if (!descriptionInput) throw new Error("create description was not rendered");
      if (!homeCalendar) throw new Error("create calendar chip was not rendered");
      if (!createButton) throw new Error("create button was not rendered");

      textInputs[0].value = "New planning block";
      timeInputs[0].value = "10:30";
      timeInputs[1].value = "11:45";
      textInputs[1].value = "Room 2";
      descriptionInput.value = "Discuss delivery plan";
      homeCalendar.dispatchEvent(new Event("click"));
      createButton.dispatchEvent(new Event("click"));
      await Promise.resolve();

      expect(createEvent).toHaveBeenCalledWith({
        title: "New planning block",
        start: "2026-05-04T10:30:00+00:00",
        end: "2026-05-04T11:45:00+00:00",
        calendar: "Home",
        location: "Room 2",
        notes: "Discuss delivery plan",
      });
      expect(popover.isConnected).toBe(false);
    } finally {
      Platform.isMobile = wasMobile;
      Platform.isDesktop = wasDesktop;
      vi.useRealTimers();
      vi.unstubAllGlobals();
    }
  });

  it("initializes the edit popover with title, time, location, description and calendar", () => {
    vi.useFakeTimers();
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback): number => {
      callback(0);
      return 1;
    });
    vi.stubGlobal("window", {
      clearTimeout,
      innerHeight: 800,
      innerWidth: 1200,
      setTimeout,
    });
    const testDocument = new TestDocument();
    vi.stubGlobal("document", testDocument);
    const wasMobile = Platform.isMobile;
    const wasDesktop = Platform.isDesktop;

    try {
      Platform.isMobile = false;
      Platform.isDesktop = true;
      const event: CalendarEvent = {
        id: "event-1",
        title: "Planning review",
        start: "2026-05-04T10:15:00Z",
        end: "2026-05-04T11:45:00Z",
        location: "Room 1",
        body: "Review current milestones",
        calendar: "Work",
      };
      const view = createCalendarViewHarnessWithEvents([event]);
      Reflect.set(Reflect.get(Reflect.get(view, "plugin"), "settings"), "caldav", {
        discoveredCalendars: [
          { href: "/work/", displayName: "Work" },
          { href: "/private/", displayName: "Private" },
        ],
        selectedCalendars: [],
      });

      callViewMethod(view, "showEventEditPopover", event, "2026-05-04", makeMouseEvent("click"), false);
      vi.runOnlyPendingTimers();

      const popover = testDocument.body.querySelector(".dl-edit-dialog");
      if (!popover) throw new Error("edit popover was not rendered");
      const textInputs = popover.querySelectorAll(".dl-create-input");
      const timeInputs = popover.querySelectorAll(".dl-create-time-input");
      const descriptionInput = popover.querySelector("textarea");

      expect(popover.classList.contains("dl-create-popover")).toBe(false);
      expect(popover.querySelector(".dl-edit-header")).not.toBeNull();
      expect(popover.querySelector(".dl-edit-form-scroll")).not.toBeNull();
      expect(popover.querySelector(".dl-edit-actions")).not.toBeNull();
      expect(textInputs.map((input) => input.value)).toEqual([
        "Planning review",
        "Room 1",
      ]);
      expect(timeInputs.map((input) => input.value)).toEqual(["10:15", "11:45"]);
      expect(descriptionInput?.value).toBe("Review current milestones");

      const calendarButton = popover.querySelector(".dl-edit-cal-btn");
      if (!calendarButton) throw new Error("calendar button was not rendered");
      calendarButton.dispatchEvent(new Event("click", { cancelable: true }));
      const activeCalendar = popover.querySelector(".dl-edit-cal-menu-item--active");
      expect(activeCalendar).not.toBeNull();
      expect(activeCalendar ? renderText(activeCalendar) : "").toBe("Work");
    } finally {
      Platform.isMobile = wasMobile;
      Platform.isDesktop = wasDesktop;
      vi.useRealTimers();
      vi.unstubAllGlobals();
    }
  });

  it("renders writable mobile edits as a bottom sheet with current values and reachable actions", () => {
    vi.useFakeTimers();
    vi.stubGlobal("window", {
      clearTimeout,
      innerHeight: 720,
      innerWidth: 390,
      setTimeout,
    });
    const testDocument = new TestDocument();
    vi.stubGlobal("document", testDocument);
    const wasMobile = Platform.isMobile;
    const wasDesktop = Platform.isDesktop;

    try {
      Platform.isMobile = true;
      Platform.isDesktop = false;
      const event: CalendarEvent = {
        id: "event-1",
        title: "Planning review",
        start: "2026-05-04T10:15:00Z",
        end: "2026-05-04T11:45:00Z",
        location: "Room 1",
        body: "Review current milestones",
        calendar: "Work",
      };
      const view = createCalendarViewHarnessWithEvents([event]);
      Reflect.set(Reflect.get(Reflect.get(view, "plugin"), "settings"), "caldav", {
        discoveredCalendars: [
          { href: "/work/", displayName: "Work" },
          { href: "/private/", displayName: "Private" },
        ],
        selectedCalendars: [],
      });

      callViewMethod(view, "showEventEditPopover", event, "2026-05-04", makeTouchEvent("touchend", [{ clientX: 120, clientY: 160 }]), false);
      vi.runOnlyPendingTimers();

      const sheet = testDocument.body.querySelector(".dl-edit-sheet");
      if (!sheet) throw new Error("mobile edit sheet was not rendered");

      expect(testDocument.body.querySelector(".dl-edit-overlay--mobile")).not.toBeNull();
      expect(sheet.querySelector(".dl-edit-sheet-handle")).not.toBeNull();
      expect(sheet.querySelector(".dl-edit-header")).not.toBeNull();
      expect(sheet.querySelector(".dl-edit-form-scroll")).not.toBeNull();
      expect(sheet.querySelector(".dl-edit-actions")).not.toBeNull();
      expect(sheet.querySelector(".dl-edit-title-input")?.value).toBe("Planning review");
      expect(sheet.querySelector(".dl-edit-start-input")?.value).toBe("10:15");
      expect(sheet.querySelector(".dl-edit-end-input")?.value).toBe("11:45");
      expect(sheet.querySelector(".dl-edit-location-input")?.value).toBe("Room 1");
      expect(sheet.querySelector(".dl-edit-desc-input")?.value).toBe("Review current milestones");
      expect(sheet.querySelector(".dl-edit-save-btn")).not.toBeNull();
      expect(sheet.querySelector(".dl-edit-cancel-btn")).not.toBeNull();
    } finally {
      Platform.isMobile = wasMobile;
      Platform.isDesktop = wasDesktop;
      vi.useRealTimers();
      vi.unstubAllGlobals();
    }
  });

  it("keeps long mobile edit content scrolling inside the sheet instead of the calendar body", () => {
    vi.useFakeTimers();
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback): number => {
      callback(0);
      return 1;
    });
    vi.stubGlobal("window", {
      clearTimeout,
      innerHeight: 640,
      innerWidth: 390,
      setTimeout,
    });
    const testDocument = new TestDocument();
    vi.stubGlobal("document", testDocument);
    const wasMobile = Platform.isMobile;
    const wasDesktop = Platform.isDesktop;

    try {
      Platform.isMobile = true;
      Platform.isDesktop = false;
      const longDescription = Array.from({ length: 32 }, (_, index) => `Agenda item ${index + 1}`).join("\n");
      const event: CalendarEvent = {
        id: "event-1",
        title: "Long planning review",
        start: "2026-05-04T10:15:00Z",
        end: "2026-05-04T11:45:00Z",
        location: "Room 1",
        body: longDescription,
        calendar: "Work",
      };
      const view = createCalendarViewHarnessWithEvents([event]);

      callViewMethod(view, "render");
      const bodyScroll = renderedGrid(view).querySelector(".dl-grid-body-scroll");
      if (!bodyScroll) throw new Error("calendar body scroll was not rendered");

      callViewMethod(view, "showEventEditPopover", event, "2026-05-04", makeTouchEvent("touchend", [{ clientX: 120, clientY: 160 }]), false);
      vi.runOnlyPendingTimers();
      bodyScroll.scrollTop = 240;

      const sheet = testDocument.body.querySelector(".dl-edit-sheet");
      if (!sheet) throw new Error("mobile edit sheet was not rendered");
      const formScroll = sheet.querySelector(".dl-edit-form-scroll");
      if (!formScroll) throw new Error("mobile edit form scroll region was not rendered");

      formScroll.scrollTop = 320;
      formScroll.dispatchEvent(new Event("scroll"));

      expect(sheet.querySelector(".dl-edit-desc-input")?.value).toBe(longDescription);
      expect(sheet.children.indexOf(formScroll)).toBeLessThan(sheet.children.length - 1);
      expect(formScroll.scrollTop).toBe(320);
      expect(bodyScroll.scrollTop).toBe(240);
      expect(cssRule(".dl-edit-form-scroll")).toContain("overflow-y: auto");
      expect(cssRule(".dl-edit-form-scroll")).toContain("overscroll-behavior: contain");
    } finally {
      Platform.isMobile = wasMobile;
      Platform.isDesktop = wasDesktop;
      vi.useRealTimers();
      vi.unstubAllGlobals();
    }
  });

  it("keeps the mobile edit sheet anchored inside the viewport and safe area", () => {
    const mobileOverlayRule = cssRule(".dl-edit-overlay--mobile");
    const mobileSheetRule = cssRule(".dl-edit-sheet");
    const mobileSheetActionsRule = cssRule(".dl-edit-sheet .dl-edit-actions");

    expect(mobileOverlayRule).toContain("align-items: flex-end");
    expect(mobileOverlayRule).toContain("padding: 0 8px");
    expect(mobileSheetRule).toContain("width: calc(100vw - 16px)");
    expect(mobileSheetRule).toContain("max-width: 520px");
    expect(mobileSheetRule).toContain("max-height: min(82vh, 640px)");
    expect(mobileSheetRule).toContain("margin-top: auto");
    expect(mobileSheetRule).toContain("margin-bottom: max(8px, env(safe-area-inset-bottom))");
    expect(mobileSheetActionsRule).toContain("padding-bottom: max(10px, env(safe-area-inset-bottom))");
  });

  it("dismisses the mobile edit sheet only after a clear downward handle drag", () => {
    const { surface, testDocument, updateEvent, syncEventNote, restorePlatform } =
      openWritableEditFormForCloseTest({ mobile: true });
    try {
      const handle = surface.querySelector(".dl-edit-sheet-handle");
      if (!handle) throw new Error("mobile edit sheet handle was not rendered");

      handle.dispatchEvent(makeTouchEvent("touchstart", [{ clientX: 180, clientY: 120 }]));
      testDocument.dispatchEvent(makeTouchEvent("touchmove", [{ clientX: 180, clientY: 148 }]), handle);
      testDocument.dispatchEvent(makeTouchEvent("touchend", [{ clientX: 180, clientY: 148 }]), handle);

      expect(surface.isConnected).toBe(true);
      expect(updateEvent).not.toHaveBeenCalled();
      expect(syncEventNote).not.toHaveBeenCalled();

      handle.dispatchEvent(makeTouchEvent("touchstart", [{ clientX: 180, clientY: 120 }]));
      testDocument.dispatchEvent(makeTouchEvent("touchmove", [{ clientX: 180, clientY: 220 }]), handle);
      testDocument.dispatchEvent(makeTouchEvent("touchend", [{ clientX: 180, clientY: 220 }]), handle);

      expect(surface.isConnected).toBe(false);
      expect(testDocument.body.querySelector(".dl-edit-overlay")).toBeNull();
      expect(updateEvent).not.toHaveBeenCalled();
      expect(syncEventNote).not.toHaveBeenCalled();
    } finally {
      restorePlatform();
      vi.useRealTimers();
      vi.unstubAllGlobals();
    }
  });

  it("keeps the desktop edit dialog stable and viewport-safe", () => {
    vi.useFakeTimers();
    vi.stubGlobal("window", {
      clearTimeout,
      innerHeight: 800,
      innerWidth: 1200,
      setTimeout,
    });
    const testDocument = new TestDocument();
    vi.stubGlobal("document", testDocument);
    const wasMobile = Platform.isMobile;
    const wasDesktop = Platform.isDesktop;

    try {
      Platform.isMobile = false;
      Platform.isDesktop = true;
      const event: CalendarEvent = {
        id: "event-1",
        title: "Planning review",
        start: "2026-05-04T10:15:00Z",
        end: "2026-05-04T11:45:00Z",
        location: "Room 1",
        body: "Review current milestones",
        calendar: "Work",
      };
      const view = createCalendarViewHarnessWithEvents([event]);

      callViewMethod(view, "showEventEditPopover", event, "2026-05-04", makeMouseEvent("click"), false);
      vi.runOnlyPendingTimers();

      const overlay = testDocument.body.querySelector(".dl-edit-overlay--desktop");
      const dialog = testDocument.body.querySelector(".dl-edit-dialog");
      if (!dialog) throw new Error("desktop edit dialog was not rendered");

      expect(overlay).not.toBeNull();
      expect(dialog.classList.contains("dl-create-popover")).toBe(false);
      expect(dialog.querySelector(".dl-edit-section")).not.toBeNull();
      expect(dialog.querySelector(".dl-edit-form-scroll")).not.toBeNull();
      expect(dialog.style.getPropertyValue("left")).toBe("");
      expect(dialog.style.getPropertyValue("top")).toBe("");
      expect(dialog.style.getPropertyValue("transform")).toBe("");

      const overlayRule = cssRule(".dl-edit-overlay");
      const surfaceRule = cssRule(".dl-edit-surface");
      const dialogRule = cssRule(".dl-edit-dialog");
      const createRule = cssRule(".dl-create-popover");

      expect(overlayRule).toContain("inset: 0");
      expect(overlayRule).toContain("align-items: center");
      expect(overlayRule).toContain("justify-content: center");
      expect(surfaceRule).toContain("max-width: calc(100vw - 16px)");
      expect(surfaceRule).toContain("max-height: calc(100vh - 36px)");
      expect(surfaceRule).toContain("overflow-x: hidden");
      expect(dialogRule).toContain("width: min(420px, calc(100vw - 36px))");
      expect(createRule).toContain("max-width: min(360px, calc(100vw - 24px))");
    } finally {
      Platform.isMobile = wasMobile;
      Platform.isDesktop = wasDesktop;
      vi.useRealTimers();
      vi.unstubAllGlobals();
    }
  });

  it("renders read-only details without save and closing does not update the backend", () => {
    vi.useFakeTimers();
    vi.stubGlobal("window", {
      clearTimeout,
      innerHeight: 800,
      innerWidth: 1200,
      setTimeout,
    });
    const testDocument = new TestDocument();
    vi.stubGlobal("document", testDocument);
    const wasMobile = Platform.isMobile;
    const wasDesktop = Platform.isDesktop;

    try {
      Platform.isMobile = false;
      Platform.isDesktop = true;
      const event: CalendarEvent = {
        id: "event-1",
        title: "Planning review",
        start: "2026-05-04T10:15:00Z",
        end: "2026-05-04T11:45:00Z",
        location: "Room 1",
        body: "Review current milestones",
        calendar: "Work",
        isOrganizer: false,
      };
      const view = createCalendarViewHarnessWithEvents([event]);
      const plugin = Reflect.get(view, "plugin");
      const calendarReader = Reflect.get(plugin, "calendarReader");
      const updateEvent = vi.fn(async (): Promise<void> => {});
      Reflect.set(calendarReader, "updateEvent", updateEvent);

      callViewMethod(view, "showEventEditPopover", event, "2026-05-04", makeMouseEvent("click"), true);
      vi.runOnlyPendingTimers();

      const dialog = testDocument.body.querySelector(".dl-edit-dialog");
      if (!dialog) throw new Error("edit dialog was not rendered");

      expect(dialog.querySelector(".dl-edit-readonly-note")).not.toBeNull();
      expect(dialog.querySelector(".dl-edit-save-btn")).toBeNull();
      expect(dialog.querySelector(".dl-edit-title-input")).toBeNull();
      expect(dialog.querySelector("input")).toBeNull();
      const readOnlyTitle = dialog.querySelector(".dl-edit-ro-title");
      expect(readOnlyTitle ? renderText(readOnlyTitle) : "").toBe("Planning review");

      const closeButton = dialog
        .querySelectorAll(".dl-create-btn")
        .find((button) => renderText(button) === "Schliessen");
      if (!closeButton) throw new Error("close button was not rendered");
      closeButton.dispatchEvent(new Event("click", { cancelable: true }));

      expect(updateEvent).not.toHaveBeenCalled();
      expect(dialog.isConnected).toBe(false);
    } finally {
      Platform.isMobile = wasMobile;
      Platform.isDesktop = wasDesktop;
      vi.useRealTimers();
      vi.unstubAllGlobals();
    }
  });

  it("discards changed edit values when the user cancels the edit popover", () => {
    vi.useFakeTimers();
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback): number => {
      callback(0);
      return 1;
    });
    vi.stubGlobal("window", {
      clearTimeout,
      innerHeight: 800,
      innerWidth: 1200,
      setTimeout,
    });
    const testDocument = new TestDocument();
    vi.stubGlobal("document", testDocument);
    const wasMobile = Platform.isMobile;
    const wasDesktop = Platform.isDesktop;

    try {
      Platform.isMobile = false;
      Platform.isDesktop = true;
      const event: CalendarEvent = {
        id: "event-1",
        title: "Planning review",
        start: "2026-05-04T10:15:00Z",
        end: "2026-05-04T11:45:00Z",
        location: "Room 1",
        body: "Review current milestones",
        calendar: "Work",
      };
      const view = createCalendarViewHarnessWithEvents([event]);
      const plugin = Reflect.get(view, "plugin");
      const calendarReader = Reflect.get(plugin, "calendarReader");
      const noteManager = Reflect.get(plugin, "noteManager");
      const updateEvent = vi.fn(async (): Promise<void> => {});
      const syncEventNote = vi.fn(async (): Promise<void> => {});
      Reflect.set(calendarReader, "updateEvent", updateEvent);
      Reflect.set(noteManager, "syncEventNote", syncEventNote);
      Reflect.set(Reflect.get(plugin, "settings"), "caldav", {
        discoveredCalendars: [
          { href: "/work/", displayName: "Work" },
          { href: "/private/", displayName: "Private" },
        ],
        selectedCalendars: [],
      });

      callViewMethod(view, "showEventEditPopover", event, "2026-05-04", makeMouseEvent("click"), false);
      vi.runOnlyPendingTimers();

      const popover = testDocument.body.querySelector(".dl-edit-dialog");
      if (!popover) throw new Error("edit popover was not rendered");
      const textInputs = popover.querySelectorAll(".dl-create-input");
      const timeInputs = popover.querySelectorAll(".dl-create-time-input");
      const descriptionInput = popover.querySelector("textarea");
      if (!descriptionInput) throw new Error("description input was not rendered");

      textInputs[0].value = "Changed title";
      timeInputs[0].value = "09:00";
      timeInputs[1].value = "10:00";
      textInputs[1].value = "Room 2";
      descriptionInput.value = "Changed description";
      const calendarMenuButton = popover.querySelector(".dl-edit-cal-btn");
      if (!calendarMenuButton) throw new Error("calendar button was not rendered");
      calendarMenuButton.dispatchEvent(new Event("click", { cancelable: true }));
      const privateCalendar = popover
        .querySelectorAll(".dl-edit-cal-menu-item")
        .find((item) => renderText(item) === "Private");
      if (!privateCalendar) throw new Error("private calendar menu item was not rendered");
      privateCalendar.dispatchEvent(new Event("click", { cancelable: true }));

      const cancelButton = popover
        .querySelectorAll(".dl-create-btn")
        .find((button) => renderText(button) === "Abbrechen");
      if (!cancelButton) throw new Error("cancel button was not rendered");
      cancelButton.dispatchEvent(new Event("click", { cancelable: true }));

      expect(popover.isConnected).toBe(false);
      expect(updateEvent).not.toHaveBeenCalled();
      expect(syncEventNote).not.toHaveBeenCalled();
      expect(event).toEqual({
        id: "event-1",
        title: "Planning review",
        start: "2026-05-04T10:15:00Z",
        end: "2026-05-04T11:45:00Z",
        location: "Room 1",
        body: "Review current milestones",
        calendar: "Work",
      });

      callViewMethod(view, "showEventEditPopover", event, "2026-05-04", makeMouseEvent("click"), false);
      vi.runOnlyPendingTimers();

      const reopenedPopover = testDocument.body.querySelector(".dl-edit-dialog");
      if (!reopenedPopover) throw new Error("edit popover was not reopened");
      const reopenedTextInputs = reopenedPopover.querySelectorAll(".dl-create-input");
      const reopenedTimeInputs = reopenedPopover.querySelectorAll(".dl-create-time-input");
      const reopenedDescriptionInput = reopenedPopover.querySelector("textarea");

      expect(reopenedTextInputs.map((input) => input.value)).toEqual([
        "Planning review",
        "Room 1",
      ]);
      expect(reopenedTimeInputs.map((input) => input.value)).toEqual(["10:15", "11:45"]);
      expect(reopenedDescriptionInput?.value).toBe("Review current milestones");

      const reopenedCalendarButton = reopenedPopover.querySelector(".dl-edit-cal-btn");
      if (!reopenedCalendarButton) throw new Error("calendar button was not re-rendered");
      reopenedCalendarButton.dispatchEvent(new Event("click", { cancelable: true }));
      const activeCalendar = reopenedPopover.querySelector(".dl-edit-cal-menu-item--active");
      expect(activeCalendar ? renderText(activeCalendar) : "").toBe("Work");
    } finally {
      Platform.isMobile = wasMobile;
      Platform.isDesktop = wasDesktop;
      vi.useRealTimers();
      vi.unstubAllGlobals();
    }
  });

  it("keeps remote event facts when an edit save fails", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback): number => {
      callback(0);
      return 1;
    });
    vi.stubGlobal("window", {
      clearTimeout,
      innerHeight: 800,
      innerWidth: 1200,
      setTimeout,
    });
    const testDocument = new TestDocument();
    vi.stubGlobal("document", testDocument);
    const wasMobile = Platform.isMobile;
    const wasDesktop = Platform.isDesktop;

    try {
      Platform.isMobile = false;
      Platform.isDesktop = true;
      const event: CalendarEvent = {
        id: "event-1",
        title: "Remote planning",
        start: "2026-05-04T10:15:00Z",
        end: "2026-05-04T11:45:00Z",
        location: "Remote room",
        attendees: ["Remote Attendee"],
        body: "Remote description",
        calendar: "Work",
        isRecurring: false,
        isCancelled: false,
        isOrganizer: true,
        organizer: "Remote Organizer",
      };
      const view = createCalendarViewHarnessWithEvents([event]);
      const plugin = Reflect.get(view, "plugin");
      const calendarReader = Reflect.get(plugin, "calendarReader");
      const noteManager = Reflect.get(plugin, "noteManager");
      const updateEvent = vi.fn(async (): Promise<void> => {
        throw new Error("backend rejected edit");
      });
      const syncEventNote = vi.fn(async (): Promise<void> => {});
      const renderFromReader = vi.fn();
      Reflect.set(calendarReader, "updateEvent", updateEvent);
      Reflect.set(noteManager, "syncEventNote", syncEventNote);
      Reflect.set(view, "render", renderFromReader);
      Reflect.set(Reflect.get(plugin, "settings"), "caldav", {
        discoveredCalendars: [
          { href: "/work/", displayName: "Work" },
          { href: "/private/", displayName: "Private" },
        ],
        selectedCalendars: [],
      });

      callViewMethod(view, "showEventEditPopover", event, "2026-05-04", makeMouseEvent("click"), false);
      vi.runOnlyPendingTimers();

      const popover = testDocument.body.querySelector(".dl-edit-dialog");
      if (!popover) throw new Error("edit popover was not rendered");
      const textInputs = popover.querySelectorAll(".dl-create-input");
      const timeInputs = popover.querySelectorAll(".dl-create-time-input");
      const descriptionInput = popover.querySelector("textarea");
      if (!descriptionInput) throw new Error("description input was not rendered");

      textInputs[0].value = "Local edit title";
      timeInputs[0].value = "09:00";
      timeInputs[1].value = "10:00";
      textInputs[1].value = "Local edit room";
      descriptionInput.value = "Local edit description";
      const calendarMenuButton = popover.querySelector(".dl-edit-cal-btn");
      if (!calendarMenuButton) throw new Error("calendar button was not rendered");
      calendarMenuButton.dispatchEvent(new Event("click", { cancelable: true }));
      const privateCalendar = popover
        .querySelectorAll(".dl-edit-cal-menu-item")
        .find((item) => renderText(item) === "Private");
      if (!privateCalendar) throw new Error("private calendar menu item was not rendered");
      privateCalendar.dispatchEvent(new Event("click", { cancelable: true }));

      const saveButton = popover.querySelector(".dl-edit-save-btn");
      if (!saveButton) throw new Error("save button was not rendered");
      saveButton.dispatchEvent(new Event("click", { cancelable: true }));
      await Promise.resolve();
      await Promise.resolve();

      expect(updateEvent).toHaveBeenCalledWith("event-1", {
        title: "Local edit title",
        start: "2026-05-04T09:00:00+00:00",
        end: "2026-05-04T10:00:00+00:00",
        location: "Local edit room",
        notes: "Local edit description",
        calendar: "Private",
      });
      expect(syncEventNote).not.toHaveBeenCalled();
      expect(renderFromReader).toHaveBeenCalledOnce();
      expect(event).toEqual({
        id: "event-1",
        title: "Remote planning",
        start: "2026-05-04T10:15:00Z",
        end: "2026-05-04T11:45:00Z",
        location: "Remote room",
        attendees: ["Remote Attendee"],
        body: "Remote description",
        calendar: "Work",
        isRecurring: false,
        isCancelled: false,
        isOrganizer: true,
        organizer: "Remote Organizer",
      });
    } finally {
      Platform.isMobile = wasMobile;
      Platform.isDesktop = wasDesktop;
      vi.useRealTimers();
      vi.unstubAllGlobals();
    }
  });

  it("closes the edit popover on outside click without backend update or note sync", () => {
    const { surface, testDocument, updateEvent, syncEventNote, restorePlatform } =
      openWritableEditFormForCloseTest({ mobile: false });
    try {
      const titleInput = surface.querySelector(".dl-edit-title-input");
      if (!titleInput) throw new Error("title input was not rendered");
      titleInput.value = "Changed title";

      const outside = testDocument.body.createDiv("outside");
      testDocument.dispatchEvent(makeMouseEvent("mousedown"), outside);

      expect(surface.isConnected).toBe(false);
      expect(updateEvent).not.toHaveBeenCalled();
      expect(syncEventNote).not.toHaveBeenCalled();
      expect(testDocument.body.querySelector(".dl-edit-overlay")).toBeNull();
    } finally {
      restorePlatform();
      vi.useRealTimers();
      vi.unstubAllGlobals();
    }
  });

  it("closes the mobile edit sheet on outside tap without backend update or note sync", () => {
    const { surface, testDocument, updateEvent, syncEventNote, restorePlatform } =
      openWritableEditFormForCloseTest({ mobile: true });
    try {
      const titleInput = surface.querySelector(".dl-edit-title-input");
      if (!titleInput) throw new Error("title input was not rendered");
      titleInput.value = "Changed title";

      // Mobile outside taps always land on the full-screen overlay; document-level
      // outside listeners stay desktop-only to survive iOS synthetic mouse events.
      const overlay = testDocument.body.querySelector(".dl-edit-overlay");
      if (!overlay) throw new Error("edit overlay was not rendered");

      // iOS fires a synthetic click on the overlay ~300ms after the opening tap.
      // It must not dismiss the freshly-opened sheet.
      overlay.dispatchEvent(makeMouseEvent("click"));
      expect(surface.isConnected).toBe(true);

      // A deliberate outside tap later on does dismiss the sheet.
      vi.advanceTimersByTime(600);
      overlay.dispatchEvent(makeMouseEvent("click"));

      expect(surface.isConnected).toBe(false);
      expect(updateEvent).not.toHaveBeenCalled();
      expect(syncEventNote).not.toHaveBeenCalled();
      expect(testDocument.body.querySelector(".dl-edit-overlay")).toBeNull();
    } finally {
      restorePlatform();
      vi.useRealTimers();
      vi.unstubAllGlobals();
    }
  });

  it("closes the edit popover on Escape without backend update or note sync", () => {
    const { surface, testDocument, updateEvent, syncEventNote, restorePlatform } =
      openWritableEditFormForCloseTest({ mobile: false });
    try {
      const descriptionInput = surface.querySelector(".dl-edit-desc-input");
      if (!descriptionInput) throw new Error("description input was not rendered");
      descriptionInput.value = "Changed description";

      testDocument.dispatchEvent(makeKeyboardEvent("keydown", "Escape"), descriptionInput);

      expect(surface.isConnected).toBe(false);
      expect(updateEvent).not.toHaveBeenCalled();
      expect(syncEventNote).not.toHaveBeenCalled();
      expect(testDocument.body.querySelector(".dl-edit-overlay")).toBeNull();
    } finally {
      restorePlatform();
      vi.useRealTimers();
      vi.unstubAllGlobals();
    }
  });

  it("asks for recurring edit scope before saving a recurring event", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback): number => {
      callback(0);
      return 1;
    });
    vi.stubGlobal("window", {
      clearTimeout,
      innerHeight: 800,
      innerWidth: 1200,
      setTimeout,
    });
    const testDocument = new TestDocument();
    vi.stubGlobal("document", testDocument);
    const wasMobile = Platform.isMobile;
    const wasDesktop = Platform.isDesktop;

    try {
      Platform.isMobile = false;
      Platform.isDesktop = true;
      const event: CalendarEvent = {
        id: "event-1|2026-05-04",
        title: "Planning review",
        start: "2026-05-04T10:15:00Z",
        end: "2026-05-04T11:45:00Z",
        location: "Room 1",
        body: "Review current milestones",
        calendar: "Work",
        isRecurring: true,
      };
      const view = createCalendarViewHarnessWithEvents([event]);
      const plugin = Reflect.get(view, "plugin");
      const calendarReader = Reflect.get(plugin, "calendarReader");
      const noteManager = Reflect.get(plugin, "noteManager");
      const updateEvent = vi.fn(async (): Promise<void> => {});
      const syncEventNote = vi.fn(async (): Promise<void> => {});
      Reflect.set(calendarReader, "updateEvent", updateEvent);
      Reflect.set(noteManager, "syncEventNote", syncEventNote);
      Reflect.set(Reflect.get(plugin, "settings"), "caldav", {
        discoveredCalendars: [
          { href: "/work/", displayName: "Work" },
        ],
        selectedCalendars: [],
      });

      callViewMethod(view, "showEventEditPopover", event, "2026-05-04", makeMouseEvent("click"), false);
      vi.runOnlyPendingTimers();

      const popover = testDocument.body.querySelector(".dl-edit-dialog");
      if (!popover) throw new Error("edit popover was not rendered");
      const saveButton = popover
        .querySelectorAll(".dl-create-btn")
        .find((button) => renderText(button) === "Speichern");
      if (!saveButton) throw new Error("save button was not rendered");

      saveButton.dispatchEvent(new Event("click", { cancelable: true }));
      await Promise.resolve();

      const scopePopover = testDocument.body.querySelector(".dl-edit-scope-popover");
      expect(scopePopover).not.toBeNull();
      expect(updateEvent).not.toHaveBeenCalled();
      expect(popover.isConnected).toBe(true);

      const thisInstanceButton = scopePopover
        ?.querySelectorAll(".dl-create-btn")
        .find((button) => renderText(button) === "Nur dieser Termin");
      if (!thisInstanceButton) throw new Error("this-instance scope button was not rendered");

      thisInstanceButton.dispatchEvent(new Event("click", { cancelable: true }));
      await Promise.resolve();
      await Promise.resolve();

      expect(updateEvent).toHaveBeenCalledWith("event-1|2026-05-04", expect.objectContaining({
        title: "Planning review",
        location: "Room 1",
        notes: "Review current milestones",
        calendar: "Work",
        span: "this",
      }));
      expect(syncEventNote).toHaveBeenCalledOnce();
      expect(popover.isConnected).toBe(false);
      expect(scopePopover?.isConnected).toBe(false);
    } finally {
      Platform.isMobile = wasMobile;
      Platform.isDesktop = wasDesktop;
      vi.useRealTimers();
      vi.unstubAllGlobals();
    }
  });

  it("opens the edit popover on desktop single-click and the note on double-click", () => {
    vi.useFakeTimers();
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback): number => {
      callback(0);
      return 1;
    });
    vi.stubGlobal("window", {
      clearTimeout,
      innerHeight: 800,
      innerWidth: 1200,
      setTimeout,
    });
    const wasMobile = Platform.isMobile;
    const wasDesktop = Platform.isDesktop;

    try {
      Platform.isMobile = false;
      Platform.isDesktop = true;
      const event = makeEvent("event-1", "2026-05-04T10:00:00Z", "2026-05-04T11:00:00Z");
      const view = createCalendarViewHarnessWithEvents([event]);
      const showEventEditPopover = vi.fn();
      const openEvent = vi.fn();
      Reflect.set(view, "showEventEditPopover", showEventEditPopover);
      Reflect.set(view, "openEvent", openEvent);

      callViewMethod(view, "render");
      const card = renderedGrid(view).querySelector(".dl-event-card");
      if (!card) throw new Error("event card was not rendered");

      card.dispatchEvent(makeMouseEvent("click"));
      vi.advanceTimersByTime(221);

      expect(showEventEditPopover).toHaveBeenCalledOnce();
      expect(openEvent).not.toHaveBeenCalled();

      showEventEditPopover.mockClear();
      card.dispatchEvent(makeMouseEvent("click"));
      card.dispatchEvent(makeMouseEvent("dblclick"));
      vi.advanceTimersByTime(221);

      expect(showEventEditPopover).not.toHaveBeenCalled();
      expect(openEvent).toHaveBeenCalledWith(event, false);
    } finally {
      Platform.isMobile = wasMobile;
      Platform.isDesktop = wasDesktop;
      vi.useRealTimers();
      vi.unstubAllGlobals();
    }
  });

  it("opens the edit popover on mobile single-tap and the note on double-tap", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-04T12:00:00Z"));
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback): number => {
      callback(0);
      return 1;
    });
    vi.stubGlobal("window", {
      clearTimeout,
      innerWidth: 390,
      setTimeout,
    });
    vi.stubGlobal("navigator", {});
    const wasMobile = Platform.isMobile;
    const wasDesktop = Platform.isDesktop;

    try {
      Platform.isMobile = true;
      Platform.isDesktop = false;
      const event = makeEvent("event-1", "2026-05-04T10:00:00Z", "2026-05-04T11:00:00Z");
      const view = createCalendarViewHarnessWithEvents([event]);
      const showEventEditPopover = vi.fn();
      const openEvent = vi.fn();
      Reflect.set(view, "showEventEditPopover", showEventEditPopover);
      Reflect.set(view, "openEvent", openEvent);

      callViewMethod(view, "render");
      const card = renderedGrid(view).querySelector(".dl-event-card");
      if (!card) throw new Error("event card was not rendered");

      card.dispatchEvent(makeTouchEvent("touchend", [{ clientX: 120, clientY: 160 }]));
      vi.advanceTimersByTime(321);

      expect(showEventEditPopover).toHaveBeenCalledOnce();
      expect(openEvent).not.toHaveBeenCalled();

      showEventEditPopover.mockClear();
      card.dispatchEvent(makeTouchEvent("touchend", [{ clientX: 120, clientY: 160 }]));
      vi.advanceTimersByTime(100);
      card.dispatchEvent(makeTouchEvent("touchend", [{ clientX: 120, clientY: 160 }]));
      vi.advanceTimersByTime(321);

      expect(showEventEditPopover).not.toHaveBeenCalled();
      expect(openEvent).toHaveBeenCalledWith(event, false);
    } finally {
      Platform.isMobile = wasMobile;
      Platform.isDesktop = wasDesktop;
      vi.useRealTimers();
      vi.unstubAllGlobals();
    }
  });

  it("keeps mobile long-press edit handles open until an outside tap", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-04T12:00:00Z"));
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback): number => {
      callback(0);
      return 1;
    });
    vi.stubGlobal("window", {
      clearTimeout,
      innerWidth: 390,
      setTimeout,
    });
    vi.stubGlobal("navigator", {});
    const testDocument = new TestDocument();
    vi.stubGlobal("document", testDocument);
    const wasMobile = Platform.isMobile;
    const wasDesktop = Platform.isDesktop;

    try {
      Platform.isMobile = true;
      Platform.isDesktop = false;
      const event = makeEvent("event-1", "2026-05-04T10:00:00Z", "2026-05-04T11:00:00Z");
      const view = createCalendarViewHarnessWithEvents([event]);
      const showEventEditPopover = vi.fn();
      Reflect.set(view, "showEventEditPopover", showEventEditPopover);

      callViewMethod(view, "render");
      const card = renderedGrid(view).querySelector(".dl-event-card");
      if (!card) throw new Error("event card was not rendered");

      card.dispatchEvent(makeTouchEvent("touchstart", [{ clientX: 120, clientY: 160 }]));
      vi.advanceTimersByTime(350);
      vi.runOnlyPendingTimers();

      expect(showEventEditPopover).not.toHaveBeenCalled();
      expect(card.classList.contains("dl-event-card--editing")).toBe(true);
      expect(card.querySelector(".dl-edit-handle--top")).not.toBeNull();
      expect(card.querySelector(".dl-edit-handle--bottom")).not.toBeNull();
      const editBar = testDocument.body.querySelector(".dl-mobile-edit-bar");
      expect(editBar).not.toBeNull();

      card.dispatchEvent(makeTouchEvent("touchend", [{ clientX: 120, clientY: 160 }]));

      expect(card.classList.contains("dl-event-card--editing")).toBe(true);
      expect(card.querySelectorAll(".dl-edit-handle")).toHaveLength(2);

      const outside = testDocument.body.createDiv("outside");
      testDocument.dispatchEvent(makeTouchEvent("touchstart", [{ clientX: 1, clientY: 1 }]), outside);

      expect(card.classList.contains("dl-event-card--editing")).toBe(false);
      expect(card.querySelectorAll(".dl-edit-handle")).toHaveLength(0);
      expect(editBar?.isConnected).toBe(false);
    } finally {
      Platform.isMobile = wasMobile;
      Platform.isDesktop = wasDesktop;
      vi.useRealTimers();
      vi.unstubAllGlobals();
    }
  });

  it("commits mobile long-press handle time edits through the existing move path", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-04T12:00:00Z"));
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback): number => {
      callback(0);
      return 1;
    });
    vi.stubGlobal("window", {
      clearTimeout,
      innerWidth: 390,
      setTimeout,
    });
    vi.stubGlobal("navigator", {});
    const testDocument = new TestDocument();
    vi.stubGlobal("document", testDocument);
    const wasMobile = Platform.isMobile;
    const wasDesktop = Platform.isDesktop;

    try {
      Platform.isMobile = true;
      Platform.isDesktop = false;
      const event = makeEvent("event-1", "2026-05-04T10:00:00Z", "2026-05-04T11:00:00Z");
      const view = createCalendarViewHarnessWithEvents([event]);
      const calendarReader = Reflect.get(Reflect.get(view, "plugin"), "calendarReader");
      const moveEvent = vi.fn(async (): Promise<void> => {});
      Reflect.set(calendarReader, "moveEvent", moveEvent);

      callViewMethod(view, "render");
      const card = renderedGrid(view).querySelector(".dl-event-card");
      if (!card) throw new Error("event card was not rendered");

      card.dispatchEvent(makeTouchEvent("touchstart", [{ clientX: 120, clientY: 640 }]));
      vi.advanceTimersByTime(350);
      vi.runOnlyPendingTimers();

      const topHandle = card.querySelector(".dl-edit-handle--top");
      const bottomHandle = card.querySelector(".dl-edit-handle--bottom");
      if (!topHandle) throw new Error("top edit handle was not rendered");
      if (!bottomHandle) throw new Error("bottom edit handle was not rendered");

      topHandle.dispatchEvent(makeTouchEvent("touchstart", [{ clientX: 120, clientY: 640 }]));
      topHandle.dispatchEvent(makeTouchEvent("touchmove", [{ clientX: 120, clientY: 608 }]));
      topHandle.dispatchEvent(makeTouchEvent("touchend", [{ clientX: 120, clientY: 608 }]));
      bottomHandle.dispatchEvent(makeTouchEvent("touchstart", [{ clientX: 120, clientY: 704 }]));
      bottomHandle.dispatchEvent(makeTouchEvent("touchmove", [{ clientX: 120, clientY: 736 }]));
      bottomHandle.dispatchEvent(makeTouchEvent("touchend", [{ clientX: 120, clientY: 736 }]));

      const outside = testDocument.body.createDiv("outside");
      testDocument.dispatchEvent(makeTouchEvent("touchstart", [{ clientX: 1, clientY: 1 }]), outside);
      await Promise.resolve();

      expect(moveEvent).toHaveBeenCalledWith(
        "event-1",
        "2026-05-04T09:30:00+00:00",
        "2026-05-04T11:30:00+00:00",
      );
    } finally {
      Platform.isMobile = wasMobile;
      Platform.isDesktop = wasDesktop;
      vi.useRealTimers();
      vi.unstubAllGlobals();
    }
  });

  it("re-renders confirmed reader state when a desktop resize write fails", async () => {
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback): number => {
      callback(0);
      return 1;
    });
    vi.stubGlobal("window", {
      clearTimeout,
      innerHeight: 800,
      innerWidth: 1200,
      setTimeout,
    });
    const testDocument = new TestDocument();
    vi.stubGlobal("document", testDocument);
    const wasMobile = Platform.isMobile;
    const wasDesktop = Platform.isDesktop;

    try {
      Platform.isMobile = false;
      Platform.isDesktop = true;
      const event = makeEvent("event-1", "2026-05-04T10:00:00Z", "2026-05-04T11:00:00Z");
      const view = createCalendarViewHarnessWithEvents([event]);
      const calendarReader = Reflect.get(Reflect.get(view, "plugin"), "calendarReader");
      const moveEvent = vi.fn(async (): Promise<void> => {
        throw new Error("backend rejected resize");
      });
      Reflect.set(calendarReader, "moveEvent", moveEvent);

      callViewMethod(view, "render");
      const renderFromReader = vi.fn();
      Reflect.set(view, "render", renderFromReader);
      const card = renderedGrid(view).querySelector(".dl-event-card");
      if (!card) throw new Error("event card was not rendered");
      const handle = card.querySelector(".dl-resize-handle--bottom");
      if (!handle) throw new Error("resize handle was not rendered");

      handle.dispatchEvent(makePointerMouseEvent("mousedown", 704));
      testDocument.dispatchEvent(makePointerMouseEvent("mousemove", 672), handle);
      testDocument.dispatchEvent(makePointerMouseEvent("mouseup", 672), handle);
      await Promise.resolve();
      await Promise.resolve();

      expect(moveEvent).toHaveBeenCalledWith(
        "event-1",
        "2026-05-04T10:00:00+00:00",
        "2026-05-04T10:30:00+00:00",
      );
      expect(renderFromReader).toHaveBeenCalledOnce();
    } finally {
      Platform.isMobile = wasMobile;
      Platform.isDesktop = wasDesktop;
      vi.unstubAllGlobals();
    }
  });
});

describe("assignColumns", () => {
  it("returns empty array for no events", () => {
    expect(assignColumns([])).toEqual([]);
  });

  it("single event gets col=0, totalCols=1", () => {
    const ev = makeEvent("a", "2026-05-04T10:00:00+00:00", "2026-05-04T11:00:00+00:00");
    const result = assignColumns([ev]);
    expect(result).toHaveLength(1);
    expect(result[0].col).toBe(0);
    expect(result[0].totalCols).toBe(1);
  });

  it("two non-overlapping events each get col=0, totalCols=1", () => {
    const a = makeEvent("a", "2026-05-04T09:00:00+00:00", "2026-05-04T10:00:00+00:00");
    const b = makeEvent("b", "2026-05-04T11:00:00+00:00", "2026-05-04T12:00:00+00:00");
    const result = assignColumns([a, b]);
    expect(result.every((r) => r.totalCols === 1)).toBe(true);
    expect(result.every((r) => r.col === 0)).toBe(true);
  });

  it("two overlapping events get totalCols=2, different cols", () => {
    const a = makeEvent("a", "2026-05-04T10:00:00+00:00", "2026-05-04T11:30:00+00:00");
    const b = makeEvent("b", "2026-05-04T10:30:00+00:00", "2026-05-04T12:00:00+00:00");
    const result = assignColumns([a, b]);
    expect(result).toHaveLength(2);
    expect(result.every((r) => r.totalCols === 2)).toBe(true);
    const cols = result.map((r) => r.col).sort();
    expect(cols).toEqual([0, 1]);
  });

  it("three mutually overlapping events get totalCols=3", () => {
    const a = makeEvent("a", "2026-05-04T10:00:00+00:00", "2026-05-04T13:00:00+00:00");
    const b = makeEvent("b", "2026-05-04T10:30:00+00:00", "2026-05-04T12:00:00+00:00");
    const c = makeEvent("c", "2026-05-04T11:00:00+00:00", "2026-05-04T12:30:00+00:00");
    const result = assignColumns([a, b, c]);
    expect(result.every((r) => r.totalCols === 3)).toBe(true);
    const cols = result.map((r) => r.col).sort();
    expect(cols).toEqual([0, 1, 2]);
  });

  it("adjacent events (end === next start) are in separate clusters", () => {
    const a = makeEvent("a", "2026-05-04T09:00:00+00:00", "2026-05-04T10:00:00+00:00");
    const b = makeEvent("b", "2026-05-04T10:00:00+00:00", "2026-05-04T11:00:00+00:00");
    const result = assignColumns([a, b]);
    expect(result.every((r) => r.totalCols === 1)).toBe(true);
  });

  it("keeps overlap columns stable across vertical zoom levels", () => {
    const events = [
      makeEvent("a", "2026-05-04T09:00:00+00:00", "2026-05-04T11:00:00+00:00"),
      makeEvent("b", "2026-05-04T09:30:00+00:00", "2026-05-04T10:30:00+00:00"),
      makeEvent("c", "2026-05-04T10:45:00+00:00", "2026-05-04T12:00:00+00:00"),
    ];
    const columns = assignColumns(events).map((layout) => ({
      id: layout.event.id,
      col: layout.col,
      totalCols: layout.totalCols,
    }));
    const compactGeometry = events.map((event) => ({
      top: topFromISO(event.start, 40),
      height: heightFromISO(event.start, event.end, 40),
    }));
    const detailedGeometry = events.map((event) => ({
      top: topFromISO(event.start, 160),
      height: heightFromISO(event.start, event.end, 160),
    }));

    expect(assignColumns(events).map((layout) => ({
      id: layout.event.id,
      col: layout.col,
      totalCols: layout.totalCols,
    }))).toEqual(columns);
    expect(detailedGeometry[0].top).toBe(compactGeometry[0].top * 4);
    expect(detailedGeometry[0].height).toBe(compactGeometry[0].height * 4);
  });
});
