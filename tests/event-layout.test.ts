import { describe, it, expect, vi } from "vitest";
import { Platform } from "obsidian";
import { DeskleafCalendarView } from "../src/calendar-view";
import {
  assignColumns,
  clampHourPx,
  DEFAULT_HOUR_PX,
  heightFromISO,
  hourPxForPinch,
  scrollTopForZoomAnchor,
  snapMins,
  minsToTimeStr,
  minsToISO,
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

  setText(text: string): void {
    this.textContent = text;
  }

  setAttribute(_name: string, _value: string): void {}

  addEventListener(type: string, _listener: EventListenerOrEventListenerObject, _options?: AddEventListenerOptions): void {
    this.listenerCounts.set(type, this.eventListenerCount(type) + 1);
    const listeners = this.listeners.get(type) ?? [];
    listeners.push(_listener);
    this.listeners.set(type, listeners);
  }

  eventListenerCount(type: string): number {
    return this.listenerCounts.get(type) ?? 0;
  }

  dispatchEvent(event: Event): boolean {
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
    if (selector.startsWith(".")) return this.classes.has(selector.slice(1));
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
        caldav: {},
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
    hourPx: DEFAULT_HOUR_PX,
  });
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

function makeWheelEvent(deltaY: number, clientY: number, ctrlKey: boolean): Event {
  const event = new Event("wheel", { cancelable: true });
  Object.defineProperty(event, "deltaY", { value: deltaY });
  Object.defineProperty(event, "clientY", { value: clientY });
  Object.defineProperty(event, "ctrlKey", { value: ctrlKey });
  return event;
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
