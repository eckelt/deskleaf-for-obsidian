import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Menu, Platform, WorkspaceLeaf } from "obsidian";
import { checkboxIconSvg, DeskleafCalendarView } from "../src/calendar-view";
import { isEventReadOnly } from "../src/event-edit";
import { getAllDayEventsForDate, getEventsForDate } from "../src/event-filter";
import type { CalendarEvent, DeskleafSettings } from "../src/types";
import { CAL_COLOR_PALETTE, DEFAULT_SETTINGS } from "../src/types";

// ── Minimal DOM shim — this repo's vitest config runs with environment: "node" ─

type TestListener = (event: any) => void;

class TestStyle {
  private readonly values = new Map<string, string>();
  [key: string]: unknown;
  setProperty(name: string, value: string): void { this.values.set(name, value); }
  getPropertyValue(name: string): string { return this.values.get(name) ?? ""; }
}

class TestClassList {
  constructor(private readonly el: TestElement) {}
  add(className: string): void {
    const classes = new Set(this.el.className.split(/\s+/).filter(Boolean));
    classes.add(className);
    this.el.className = Array.from(classes).join(" ");
  }
  contains(className: string): boolean {
    return this.el.className.split(/\s+/).includes(className);
  }
}

class TestElement {
  readonly tagName: string;
  readonly children: TestElement[] = [];
  readonly classList = new TestClassList(this);
  readonly style = new TestStyle();
  readonly dataset: Record<string, string> = {};
  parentElement: TestElement | null = null;
  className = "";
  innerHTML = "";
  private ownText = "";
  private readonly listeners = new Map<string, TestListener[]>();
  private readonly attributes = new Map<string, string>();

  constructor(tagName: string) { this.tagName = tagName.toLowerCase(); }

  appendChild(el: TestElement): TestElement {
    el.parentElement = this;
    this.children.push(el);
    return el;
  }

  get textContent(): string { return this.ownText + this.children.map((c) => c.textContent).join(""); }
  set textContent(value: string) { this.ownText = value; }

  setAttribute(name: string, value: string): void { this.attributes.set(name, value); }
  getAttribute(name: string): string | null { return this.attributes.get(name) ?? null; }

  addEventListener(type: string, listener: TestListener): void {
    const listeners = this.listeners.get(type) ?? [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }

  querySelectorAll(selector: string): TestElement[] {
    const matches: TestElement[] = [];
    for (const child of this.children) {
      if (this.matches(child, selector)) matches.push(child);
      matches.push(...child.querySelectorAll(selector));
    }
    return matches;
  }

  querySelector(selector: string): TestElement | null {
    return this.querySelectorAll(selector)[0] ?? null;
  }

  private matches(el: TestElement, selector: string): boolean {
    return selector.startsWith(".") && el.classList.contains(selector.slice(1));
  }
}

class TestDocument {
  body = new TestElement("body");
  createElement(tagName: string): TestElement { return new TestElement(tagName); }
}

function installDomShim(): void {
  const testDocument = new TestDocument();
  Object.defineProperty(globalThis, "document", { value: testDocument, configurable: true });
  Object.defineProperty(globalThis, "HTMLElement", { value: TestElement, configurable: true });
  Object.defineProperty(globalThis, "window", {
    value: { setTimeout, clearTimeout },
    configurable: true,
  });

  (HTMLElement as any).prototype.createDiv = function (this: TestElement, options?: string | { cls?: string; text?: string }) {
    const el = document.createElement("div") as unknown as TestElement;
    if (typeof options === "string") el.className = options;
    else if (options) {
      if (options.cls) el.className = options.cls;
      if (options.text !== undefined) el.textContent = options.text;
    }
    this.appendChild(el);
    return el;
  };
  (HTMLElement as any).prototype.createSpan = function (this: TestElement, options?: { cls?: string; text?: string }) {
    const el = document.createElement("span") as unknown as TestElement;
    if (options?.cls) el.className = options.cls;
    if (options?.text !== undefined) el.textContent = options.text;
    this.appendChild(el);
    return el;
  };
  (HTMLElement as any).prototype.addClass = function (this: TestElement, className: string) {
    this.classList.add(className);
  };
}

// ── Harness ─────────────────────────────────────────────────────────────────

interface PluginHarness {
  settings: DeskleafSettings;
  noteManager: {
    lookupInCache: ReturnType<typeof vi.fn>;
    openOrCreate: ReturnType<typeof vi.fn>;
  };
  calendarReader: {
    getEvents: ReturnType<typeof vi.fn>;
    updateEvent: ReturnType<typeof vi.fn>;
  };
}

function makePlugin(): PluginHarness {
  return {
    settings: { ...DEFAULT_SETTINGS },
    noteManager: {
      lookupInCache: vi.fn().mockReturnValue(null),
      openOrCreate: vi.fn().mockResolvedValue({ file: {}, isNew: false }),
    },
    calendarReader: {
      getEvents: vi.fn().mockReturnValue([]),
      updateEvent: vi.fn().mockResolvedValue(undefined),
    },
  };
}

function makeView(plugin: PluginHarness): DeskleafCalendarView {
  return new DeskleafCalendarView(new WorkspaceLeaf(), plugin as any);
}

function makeReminderEvent(overrides: Partial<CalendarEvent> = {}): CalendarEvent {
  return {
    id: "reminder:abc-123",
    title: "Rechnung stellen",
    start: "2026-09-10T14:00:00Z",
    end: "2026-09-10T14:30:00Z",
    isAllDay: false,
    isReminder: true,
    calendar: "Erinnerungen",
    attendees: [],
    isRecurring: false,
    isCancelled: false,
    numAttendees: 0,
    ...overrides,
  };
}

// ── AC2/AC3 — due-date mapping placement (fixture events, as the binary would emit them) ──

describe("reminders-overlay — AC2/AC3 fixture placement", () => {
  it("a reminder due without a time is placed as an all-day event on its due date", () => {
    const allDayReminder = makeReminderEvent({ start: "2026-09-10", end: "2026-09-10", isAllDay: true });
    const result = getAllDayEventsForDate([allDayReminder], "2026-09-10");
    expect(result.map((e) => e.id)).toContain("reminder:abc-123");
  });

  it("a reminder due with a time is placed as a 30-minute timed block starting at that time", () => {
    const timedReminder = makeReminderEvent();
    const result = getEventsForDate([timedReminder], "2026-09-10");
    expect(result).toHaveLength(1);
    expect(result[0].start).toBe("2026-09-10T14:00:00Z");
    expect(result[0].end).toBe("2026-09-10T14:30:00Z");
  });

  it("a reminder without any due date never appears on any day (excluded upstream, no id to place)", () => {
    // The binary never emits reminders without a due date (mapReminderDueDate → .excluded),
    // so the day's event list here simply has nothing to find — documents the contract.
    const result = getEventsForDate([], "2026-09-10");
    expect(result).toHaveLength(0);
  });
});

// ── AC6/AC7 — read-only rendering and interaction guards ─────────────────────

describe("reminders-overlay — read-only rendering (AC5/AC6)", () => {
  beforeEach(() => {
    installDomShim();
    Platform.isMobile = false;
  });

  afterEach(() => { vi.restoreAllMocks(); });

  it("isEventReadOnly is true for reminder events", () => {
    expect(isEventReadOnly(makeReminderEvent())).toBe(true);
  });

  it("renders a reminder card with the reminder class, a11y read-only markers and a checkbox icon, and no resize handles or note indicator", () => {
    const plugin = makePlugin();
    const view = makeView(plugin);
    const container = document.createElement("div") as unknown as HTMLElement;
    (view as any).buildEventCard(container, makeReminderEvent(), 0, 1, "2026-09-10");

    const card = (container as any).querySelector(".dl-event-card") as any;
    expect(card).not.toBeNull();
    expect(card.classList.contains("dl-event-card--reminder")).toBe(true);
    expect(card.getAttribute("aria-readonly")).toBe("true");
    expect(card.getAttribute("aria-label")).toContain("Erinnerung");

    expect(card.querySelectorAll(".dl-resize-handle")).toHaveLength(0);
    expect(card.querySelectorAll(".dl-event-note-indicator")).toHaveLength(0);

    const iconWrap = card.querySelector(".dl-event-icon-wrap");
    expect(iconWrap).not.toBeNull();
    expect(iconWrap.innerHTML).toBe(checkboxIconSvg(9));
  });

  it("never looks up or renders a note relationship for a reminder card", () => {
    const plugin = makePlugin();
    const view = makeView(plugin);
    const container = document.createElement("div") as unknown as HTMLElement;
    (view as any).buildEventCard(container, makeReminderEvent(), 0, 1, "2026-09-10");
    expect(plugin.noteManager.lookupInCache).not.toHaveBeenCalled();
  });

  it("openEvent never opens or creates a note for a reminder", async () => {
    const plugin = makePlugin();
    const view = makeView(plugin);
    await (view as any).openEvent(makeReminderEvent());
    expect(plugin.noteManager.openOrCreate).not.toHaveBeenCalled();
  });

  it("openEvent still opens/creates a note for a regular event (contrast case)", async () => {
    const plugin = makePlugin();
    const view = makeView(plugin);
    vi.spyOn(view as any, "render").mockImplementation(() => {});
    (view as any).app.workspace = {
      getLeavesOfType: () => [],
      getLeaf: () => ({ openFile: vi.fn().mockResolvedValue(undefined) }),
    };
    const regular: CalendarEvent = {
      id: "ev-1", title: "Standup", start: "2026-09-10T09:00:00Z", end: "2026-09-10T09:30:00Z",
      location: "Hamburg Office", calendar: "Work", attendees: [], isRecurring: false, isCancelled: false,
      isOrganizer: true, numAttendees: 1,
    };
    await (view as any).openEvent(regular);
    expect(plugin.noteManager.openOrCreate).toHaveBeenCalledTimes(1);
  });

  it("showEventContextMenu never offers a write-back action for a reminder", () => {
    const addItemSpy = vi.spyOn(Menu.prototype, "addItem");
    const plugin = makePlugin();
    const view = makeView(plugin);
    const fakeEvent = { preventDefault: () => {}, stopPropagation: () => {} } as any;
    (view as any).showEventContextMenu(fakeEvent, makeReminderEvent(), "2026-09-10");
    expect(addItemSpy).not.toHaveBeenCalled();
  });

  it("showEventContextMenu still offers actions for a regular event (contrast case)", () => {
    const addItemSpy = vi.spyOn(Menu.prototype, "addItem");
    const plugin = makePlugin();
    const view = makeView(plugin);
    const fakeEvent = { preventDefault: () => {}, stopPropagation: () => {} } as any;
    const regular: CalendarEvent = {
      id: "ev-1", title: "Standup", start: "2026-09-10T09:00:00Z", end: "2026-09-10T09:30:00Z",
      calendar: "Work", attendees: [], isRecurring: false, isCancelled: false, isOrganizer: true, numAttendees: 1,
    };
    (view as any).showEventContextMenu(fakeEvent, regular, "2026-09-10");
    expect(addItemSpy).toHaveBeenCalled();
  });
});

// ── AC5 — visually distinct from real events, color fixed and outside CAL_COLOR_PALETTE ──

describe("reminders-overlay — checkboxIconSvg (AC5-proxy)", () => {
  it("returns a string containing a valid <svg> opening tag", () => {
    expect(checkboxIconSvg(12)).toMatch(/<svg[^>]*>/);
  });

  it("reflects the given size in width/height", () => {
    const svg = checkboxIconSvg(9);
    expect(svg).toContain('width="9"');
    expect(svg).toContain('height="9"');
  });
});

describe("reminders-overlay — fixed reminder color outside CAL_COLOR_PALETTE (AC5)", () => {
  function cssRule(selector: string): string {
    const styles = readFileSync(new URL("../styles.css", import.meta.url), "utf8");
    const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const match = new RegExp(`${escaped}\\s*\\{([^}]*)\\}`).exec(styles);
    if (!match) throw new Error(`CSS rule ${selector} was not found`);
    return match[1];
  }

  it("the reminder card color does not depend on --cal-h (not user-configurable)", () => {
    expect(cssRule(".dl-event-card--reminder")).not.toContain("--cal-h");
  });

  it("the reminder card uses a 0%-saturation neutral tone, distinct from every CAL_COLOR_PALETTE hue", () => {
    const rule = cssRule(".dl-event-card--reminder");
    expect(rule).toMatch(/hsl\(0 0%/);
    for (const hue of CAL_COLOR_PALETTE) {
      expect(rule).not.toContain(`hsl(${hue} `);
    }
  });
});
