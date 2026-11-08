import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Platform, WorkspaceLeaf } from "obsidian";
import { CARD_EMOJI, DeskleafCalendarView } from "../src/calendar-view";
import type { CalendarEvent, DeskleafSettings } from "../src/types";
import { DEFAULT_SETTINGS } from "../src/types";

// ── Minimal DOM shim — this repo's vitest config runs with environment: "node" ─
// (mirrors the shim in tests/reminders-overlay.test.ts)

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
  getAttributeNames(): string[] { return Array.from(this.attributes.keys()); }

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

function makeEvent(overrides: Partial<CalendarEvent> = {}): CalendarEvent {
  return {
    id: "ev-1",
    title: "Standup",
    start: "2026-09-10T09:00:00Z",
    end: "2026-09-10T09:30:00Z",
    calendar: "Work",
    attendees: [],
    isRecurring: false,
    isCancelled: false,
    isOrganizer: true,
    numAttendees: 1,
    ...overrides,
  };
}

describe("timed event card title emoji", () => {
  beforeEach(() => {
    installDomShim();
    Platform.isMobile = false;
  });

  afterEach(() => { vi.restoreAllMocks(); });

  it("prepends CARD_EMOJI to the rendered title text", () => {
    const plugin = makePlugin();
    const view = makeView(plugin);
    const container = document.createElement("div") as unknown as HTMLElement;
    (view as any).buildEventCard(container, makeEvent({ title: "Standup" }), 0, 1, "2026-09-10");

    const titleEl = (container as any).querySelector(".dl-event-title");
    expect(titleEl).not.toBeNull();
    expect(titleEl.textContent).toBe(`${CARD_EMOJI} Standup`);
  });

  it("keeps the platform icon in addition to the emoji (does not replace it)", () => {
    const plugin = makePlugin();
    const view = makeView(plugin);
    const container = document.createElement("div") as unknown as HTMLElement;
    (view as any).buildEventCard(
      container,
      makeEvent({ title: "Sync", meetingPlatform: "Teams" }),
      0,
      1,
      "2026-09-10",
    );

    const card = (container as any).querySelector(".dl-event-card");
    expect(card.querySelectorAll(".dl-event-icon-wrap").length).toBeGreaterThanOrEqual(1);
    const titleEl = card.querySelector(".dl-event-title");
    expect(titleEl.textContent).toBe(`${CARD_EMOJI} Sync`);
  });
});
