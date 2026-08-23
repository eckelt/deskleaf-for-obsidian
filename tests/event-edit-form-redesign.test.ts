import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Platform, WorkspaceLeaf } from "obsidian";
import { DeskleafCalendarView } from "../src/calendar-view";
import type { CalendarEvent, DeskleafSettings, EventUpdate } from "../src/types";
import { DEFAULT_SETTINGS, type RsvpResponse } from "../src/types";

class TestStyle {
  borderColor = "";
  private readonly values = new Map<string, string>();

  setProperty(name: string, value: string): void {
    this.values.set(name, value);
  }

  getPropertyValue(name: string): string {
    return this.values.get(name) ?? "";
  }
}

class TestClassList {
  constructor(private readonly el: TestElement) {}

  add(className: string): void {
    const classes = new Set(this.el.className.split(/\s+/).filter(Boolean));
    classes.add(className);
    this.el.className = Array.from(classes).join(" ");
  }

  remove(className: string): void {
    const classes = this.el.className.split(/\s+/).filter((cls) => cls && cls !== className);
    this.el.className = classes.join(" ");
  }

  contains(className: string): boolean {
    return this.el.className.split(/\s+/).includes(className);
  }
}

class TestEvent {
  readonly type: string;
  readonly key: string | undefined;
  readonly bubbles: boolean;
  target: TestElement | null = null;
  defaultPrevented = false;

  constructor(type: string, init: { key?: string; bubbles?: boolean } = {}) {
    this.type = type;
    this.key = init.key;
    this.bubbles = init.bubbles ?? false;
  }

  preventDefault(): void {
    this.defaultPrevented = true;
  }

  stopPropagation(): void {}
}

class TestTouchEvent extends TestEvent {
  readonly touches: Array<{ clientY: number }>;
  readonly changedTouches: Array<{ clientY: number }>;

  constructor(type: string, init: { clientY: number; bubbles?: boolean }) {
    super(type, { bubbles: init.bubbles });
    const touch = { clientY: init.clientY };
    this.touches = type === "touchend" || type === "touchcancel" ? [] : [touch];
    this.changedTouches = [touch];
  }
}

type TestListener = (event: TestEvent) => void;

class TestElement {
  readonly tagName: string;
  readonly children: TestElement[] = [];
  readonly classList = new TestClassList(this);
  readonly style = new TestStyle();
  parentElement: TestElement | null = null;
  className = "";
  value = "";
  disabled = false;
  step = "";
  placeholder = "";
  private ownText = "";
  private readonly listeners = new Map<string, TestListener[]>();
  private readonly attributes = new Map<string, string>();

  constructor(tagName: string) {
    this.tagName = tagName.toLowerCase();
  }

  appendChild(el: TestElement): TestElement {
    el.parentElement = this;
    this.children.push(el);
    return el;
  }

  get textContent(): string {
    return this.ownText + this.children.map((child) => child.textContent).join("");
  }

  set textContent(value: string) {
    this.ownText = value;
  }

  remove(): void {
    if (!this.parentElement) return;
    const index = this.parentElement.children.indexOf(this);
    if (index >= 0) this.parentElement.children.splice(index, 1);
    this.parentElement = null;
  }

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
    if (name === "type") this.attributes.set("type", value);
    if (name === "placeholder") this.placeholder = value;
    if (name === "value") this.value = value;
  }

  getAttribute(name: string): string | null {
    return this.attributes.get(name) ?? null;
  }

  addEventListener(type: string, listener: TestListener): void {
    const listeners = this.listeners.get(type) ?? [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }

  removeEventListener(type: string, listener: TestListener): void {
    const listeners = this.listeners.get(type) ?? [];
    this.listeners.set(type, listeners.filter((item) => item !== listener));
  }

  dispatchEvent(event: TestEvent): boolean {
    event.target ??= this;
    for (const listener of this.listeners.get(event.type) ?? []) listener(event);
    if (event.bubbles && this.parentElement) this.parentElement.dispatchEvent(event);
    return !event.defaultPrevented;
  }

  click(): void {
    this.dispatchEvent(new TestEvent("click", { bubbles: true }));
  }

  focus(): void {}

  contains(node: TestElement): boolean {
    if (node === this) return true;
    return this.children.some((child) => child.contains(node));
  }

  closest(selector: string): TestElement | null {
    let current: TestElement | null = this;
    while (current) {
      if (current.matches(selector)) return current;
      current = current.parentElement;
    }
    return null;
  }

  querySelector(selector: string): TestElement | null {
    return this.querySelectorAll(selector)[0] ?? null;
  }

  querySelectorAll(selector: string): TestElement[] {
    const parts = selector.trim().split(/\s+/);
    if (parts.length > 1) {
      const [ancestorSelector, ...rest] = parts;
      return this.querySelectorAll(ancestorSelector).flatMap((el) => el.querySelectorAll(rest.join(" ")));
    }
    const matches: TestElement[] = [];
    for (const child of this.children) {
      if (child.matches(selector)) matches.push(child);
      matches.push(...child.querySelectorAll(selector));
    }
    return matches;
  }

  matches(selector: string): boolean {
    if (selector.startsWith(".")) return this.classList.contains(selector.slice(1));
    const attrMatch = selector.match(/^([a-z]+)\[placeholder="(.+)"\]$/);
    if (attrMatch) return this.tagName === attrMatch[1] && this.placeholder === attrMatch[2];
    return this.tagName === selector.toLowerCase();
  }

  getBoundingClientRect(): DOMRect {
    return {
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: 320,
      bottom: 240,
      width: 320,
      height: 240,
      toJSON: () => ({}),
    };
  }
}

class TestDocument {
  body = new TestElement("body");

  createElement(tagName: string): TestElement {
    return new TestElement(tagName);
  }

  querySelector(selector: string): TestElement | null {
    return this.body.querySelector(selector);
  }

  querySelectorAll(selector: string): TestElement[] {
    return this.body.querySelectorAll(selector);
  }

  addEventListener(type: string, listener: TestListener): void {
    this.body.addEventListener(type, listener);
  }

  removeEventListener(type: string, listener: TestListener): void {
    this.body.removeEventListener(type, listener);
  }
}

interface CalendarReaderHarness {
  updateEvent: ReturnType<typeof vi.fn<[string, EventUpdate], Promise<void>>>;
  cancelEvent: ReturnType<typeof vi.fn<[string, string?], Promise<void>>>;
  createEvent: ReturnType<typeof vi.fn<[EventUpdate], Promise<void>>>;
  updateRsvp: ReturnType<typeof vi.fn<[string, RsvpResponse], Promise<void>>>;
}

interface NoteManagerHarness {
  syncEventNote: ReturnType<typeof vi.fn<[CalendarEvent, CalendarEvent], Promise<void>>>;
}

interface PluginHarness {
  settings: DeskleafSettings;
  calendarReader: CalendarReaderHarness;
  noteManager: NoteManagerHarness;
}

function installObsidianDomHelpers(): void {
  const testDocument = new TestDocument();
  Object.defineProperty(globalThis, "document", { value: testDocument, configurable: true });
  Object.defineProperty(globalThis, "HTMLElement", { value: TestElement, configurable: true });
  Object.defineProperty(globalThis, "MouseEvent", { value: TestEvent, configurable: true });
  Object.defineProperty(globalThis, "KeyboardEvent", { value: TestEvent, configurable: true });
  Object.defineProperty(globalThis, "TouchEvent", { value: TestTouchEvent, configurable: true });
  Object.defineProperty(globalThis, "requestAnimationFrame", {
    value: (callback: FrameRequestCallback) => window.setTimeout(() => callback(0), 0),
    configurable: true,
  });
  Object.defineProperty(globalThis, "window", {
    value: {
      innerWidth: 1024,
      innerHeight: 768,
      setTimeout,
      clearTimeout,
    },
    configurable: true,
  });

  HTMLElement.prototype.createDiv = function createDiv(
    this: HTMLElement,
    options?: string | { cls?: string; text?: string },
  ): HTMLDivElement {
    const el = document.createElement("div");
    if (typeof options === "string") el.className = options;
    else if (options) {
      if (options.cls) el.className = options.cls;
      if (options.text !== undefined) el.textContent = options.text;
    }
    this.appendChild(el);
    return el;
  };
  HTMLElement.prototype.createEl = function createEl<K extends keyof HTMLElementTagNameMap>(
    this: HTMLElement,
    tagName: K,
    options?: { type?: string; cls?: string; text?: string; placeholder?: string },
  ): HTMLElementTagNameMap[K] {
    const el = document.createElement(tagName);
    if (options?.type) el.setAttribute("type", options.type);
    if (options?.cls) el.className = options.cls;
    if (options?.text !== undefined) el.textContent = options.text;
    if (options?.placeholder !== undefined && "placeholder" in el) el.placeholder = options.placeholder;
    this.appendChild(el);
    return el;
  };
  HTMLElement.prototype.createSpan = function createSpan(
    this: HTMLElement,
    options?: { cls?: string; text?: string },
  ): HTMLSpanElement {
    const el = document.createElement("span");
    if (options?.cls) el.className = options.cls;
    if (options?.text !== undefined) el.textContent = options.text;
    this.appendChild(el);
    return el;
  };
  HTMLElement.prototype.addClass = function addClass(this: HTMLElement, className: string): void {
    this.classList.add(className);
  };
  HTMLElement.prototype.removeClass = function removeClass(this: HTMLElement, className: string): void {
    this.classList.remove(className);
  };
}

function makePlugin(): PluginHarness {
  return {
    settings: {
      ...DEFAULT_SETTINGS,
      caldav: {
        ...DEFAULT_SETTINGS.caldav,
        discoveredCalendars: [
          { href: "/work/", displayName: "Work" },
          { href: "/private/", displayName: "Private" },
        ],
      },
    },
    calendarReader: {
      updateEvent: vi.fn<[string, EventUpdate], Promise<void>>().mockResolvedValue(),
      cancelEvent: vi.fn<[string, string?], Promise<void>>().mockResolvedValue(),
      createEvent: vi.fn<[EventUpdate], Promise<void>>().mockResolvedValue(),
      updateRsvp: vi.fn<[string, RsvpResponse], Promise<void>>().mockResolvedValue(),
    },
    noteManager: {
      syncEventNote: vi.fn<[CalendarEvent, CalendarEvent], Promise<void>>().mockResolvedValue(),
    },
  };
}

function makeView(plugin: PluginHarness): DeskleafCalendarView {
  return new DeskleafCalendarView(new WorkspaceLeaf(), plugin);
}

function makeEvent(overrides: Partial<CalendarEvent> = {}): CalendarEvent {
  return {
    id: "event-1",
    title: "Design Review",
    start: "2026-06-26T09:00:00.000Z",
    end: "2026-06-26T10:00:00.000Z",
    location: "Hamburg Office",
    body: "Discuss the redesigned edit form.",
    calendar: "Work",
    isOrganizer: true,
    ...overrides,
  };
}

function openEditor(view: DeskleafCalendarView, event: CalendarEvent, readOnly = false): HTMLElement {
  view.showEventEditPopover(
    event,
    "2026-06-26",
    new MouseEvent("click", { clientX: 120, clientY: 180 }),
    readOnly,
  );
  const editor = document.querySelector<HTMLElement>(".dl-edit-surface");
  expect(editor).not.toBeNull();
  return editor;
}

/** The editor commits when it closes; clicking outside is that gesture. */
async function commitByOutsideClick(): Promise<void> {
  // The outside listener is armed one tick after opening, to survive the
  // synthetic click iOS fires after the opening tap.
  await vi.runAllTimersAsync();
  document.body.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
  await vi.runAllTimersAsync();
}

function cssRule(selector: string): string {
  const styles = readFileSync(new URL("../styles.css", import.meta.url), "utf8");
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = new RegExp(`${escapedSelector}\\s*\\{([^}]*)\\}`).exec(styles);
  if (!match) throw new Error(`CSS rule ${selector} was not found`);
  return match[1];
}

describe("event edit form redesign", () => {
  beforeEach(() => {
    installObsidianDomHelpers();
    Platform.isMobile = false;
    Platform.isDesktop = true;
    vi.useFakeTimers();
  });

  afterEach(() => {
    document.body.innerHTML = "";
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("opens writable mobile events as a bottom sheet with current values and reachable actions", () => {
    Platform.isMobile = true;
    Platform.isDesktop = false;
    const plugin = makePlugin();
    const view = makeView(plugin);

    const editor = openEditor(view, makeEvent());

    expect(editor.classList.contains("dl-edit-sheet")).toBe(true);
    expect(editor.querySelector(".dl-edit-sheet-handle")).not.toBeNull();
    expect(editor.querySelector(".dl-edit-header")).not.toBeNull();
    expect(editor.querySelector(".dl-edit-form-scroll")).not.toBeNull();
    const actions = editor.querySelector(".dl-edit-actions");
    expect(actions).not.toBeNull();
    expect(editor.querySelector<HTMLInputElement>('input[placeholder="Titel..."]')?.value).toBe("Design Review");
    expect(editor.querySelector<HTMLInputElement>('input[placeholder="Ort"]')?.value).toBe("Hamburg Office");
    expect(editor.querySelector<HTMLTextAreaElement>("textarea")?.value).toBe("Discuss the redesigned edit form.");
    expect(editor.querySelector(".dl-edit-cal-btn")?.getAttribute("aria-label")).toContain("Work");
    // Committing happens on close, so only the destructive action needs a button.
    expect(actions?.textContent).toBe("Löschen");
    expect(editor.querySelector(".dl-edit-cancel-btn")).toBeNull();
    expect(editor.querySelector(".dl-edit-save-btn")).toBeNull();
  });

  it("moves the event to another calendar through the header calendar menu", async () => {
    const plugin = makePlugin();
    const view = makeView(plugin);

    const editor = openEditor(view, makeEvent());
    const calBtn = editor.querySelector<HTMLButtonElement>(".dl-edit-cal-btn");
    expect(calBtn).not.toBeNull();
    expect(calBtn?.getAttribute("aria-label")).toContain("Work");

    calBtn?.click();
    const menuItems = Array.from(editor.querySelectorAll<HTMLButtonElement>(".dl-edit-cal-menu-item"));
    expect(menuItems.map((item) => item.textContent)).toEqual(["Work", "Private"]);

    menuItems.find((item) => item.textContent === "Private")?.click();
    expect(editor.querySelector(".dl-edit-cal-menu")).toBeNull();
    expect(calBtn?.getAttribute("aria-label")).toContain("Private");

    await commitByOutsideClick();

    expect(plugin.calendarReader.updateEvent).toHaveBeenCalledWith(
      "event-1",
      expect.objectContaining({ calendar: "Private" }),
    );
  });

  it("keeps long mobile content inside a dedicated scrollable form body", () => {
    Platform.isMobile = true;
    Platform.isDesktop = false;
    const plugin = makePlugin();
    const view = makeView(plugin);
    const longBody = Array.from({ length: 40 }, (_, i) => `Line ${i + 1}`).join("\n");

    const editor = openEditor(view, makeEvent({ body: longBody }));

    const body = editor.querySelector(".dl-edit-form-scroll");
    expect(body).not.toBeNull();
    expect(body?.contains(editor.querySelector("textarea"))).toBe(true);
    expect(editor.querySelector(".dl-edit-actions")).not.toBeNull();
  });

  it("dismisses the mobile sheet only after a clear downward handle drag", async () => {
    Platform.isMobile = true;
    Platform.isDesktop = false;
    const plugin = makePlugin();
    const view = makeView(plugin);

    let editor = openEditor(view, makeEvent());
    const handle = editor.querySelector(".dl-edit-sheet-handle");
    expect(handle).not.toBeNull();

    handle?.dispatchEvent(new TouchEvent("touchstart", { clientY: 100, bubbles: true }));
    document.body.dispatchEvent(new TouchEvent("touchmove", { clientY: 190, bubbles: true }));
    document.body.dispatchEvent(new TouchEvent("touchend", { clientY: 190, bubbles: true }));
    await vi.runAllTimersAsync();

    expect(document.querySelector(".dl-edit-surface")).toBeNull();
    expect(plugin.calendarReader.updateEvent).not.toHaveBeenCalled();
    expect(plugin.noteManager.syncEventNote).not.toHaveBeenCalled();

    editor = openEditor(view, makeEvent());
    const newHandle = editor.querySelector(".dl-edit-sheet-handle");
    expect(newHandle).not.toBeNull();

    newHandle?.dispatchEvent(new TouchEvent("touchstart", { clientY: 100, bubbles: true }));
    document.body.dispatchEvent(new TouchEvent("touchmove", { clientY: 135, bubbles: true }));
    document.body.dispatchEvent(new TouchEvent("touchend", { clientY: 135, bubbles: true }));
    await vi.runAllTimersAsync();

    expect(document.querySelector(".dl-edit-surface")).not.toBeNull();
    expect(plugin.calendarReader.updateEvent).not.toHaveBeenCalled();
    expect(plugin.noteManager.syncEventNote).not.toHaveBeenCalled();
  });

  it("dismisses mobile sheets from non-interactive chrome while preserving field and action interaction", async () => {
    Platform.isMobile = true;
    Platform.isDesktop = false;
    const plugin = makePlugin();
    const view = makeView(plugin);

    let editor = openEditor(view, makeEvent());
    const header = editor.querySelector(".dl-edit-header");
    expect(header).not.toBeNull();

    header?.dispatchEvent(new TouchEvent("touchstart", { clientY: 100, bubbles: true }));
    document.body.dispatchEvent(new TouchEvent("touchmove", { clientY: 190, bubbles: true }));
    document.body.dispatchEvent(new TouchEvent("touchend", { clientY: 190, bubbles: true }));
    await vi.runAllTimersAsync();

    expect(document.querySelector(".dl-edit-surface")).toBeNull();
    expect(plugin.calendarReader.updateEvent).not.toHaveBeenCalled();
    expect(plugin.noteManager.syncEventNote).not.toHaveBeenCalled();

    editor = openEditor(view, makeEvent());
    const titleInput = editor.querySelector<HTMLInputElement>('input[placeholder="Titel..."]');
    expect(titleInput).not.toBeNull();
    titleInput?.dispatchEvent(new TouchEvent("touchstart", { clientY: 100, bubbles: true }));
    document.body.dispatchEvent(new TouchEvent("touchmove", { clientY: 190, bubbles: true }));
    document.body.dispatchEvent(new TouchEvent("touchend", { clientY: 190, bubbles: true }));
    await vi.runAllTimersAsync();
    expect(document.querySelector(".dl-edit-surface")).not.toBeNull();

    const formBody = editor.querySelector(".dl-edit-form-scroll");
    expect(formBody).not.toBeNull();
    formBody?.dispatchEvent(new TouchEvent("touchstart", { clientY: 100, bubbles: true }));
    document.body.dispatchEvent(new TouchEvent("touchmove", { clientY: 190, bubbles: true }));
    document.body.dispatchEvent(new TouchEvent("touchend", { clientY: 190, bubbles: true }));
    await vi.runAllTimersAsync();
    expect(document.querySelector(".dl-edit-surface")).not.toBeNull();

    const deleteButton = editor.querySelector<HTMLButtonElement>(".dl-edit-delete-btn");
    expect(deleteButton).not.toBeNull();
    deleteButton?.dispatchEvent(new TouchEvent("touchstart", { clientY: 100, bubbles: true }));
    document.body.dispatchEvent(new TouchEvent("touchmove", { clientY: 190, bubbles: true }));
    document.body.dispatchEvent(new TouchEvent("touchend", { clientY: 190, bubbles: true }));
    await vi.runAllTimersAsync();

    expect(document.querySelector(".dl-edit-surface")).not.toBeNull();
    expect(plugin.calendarReader.updateEvent).not.toHaveBeenCalled();
    expect(plugin.noteManager.syncEventNote).not.toHaveBeenCalled();
  });

  it("opens writable desktop events as a distinct edit dialog with grouped fields", () => {
    const plugin = makePlugin();
    const view = makeView(plugin);

    const editor = openEditor(view, makeEvent());

    expect(editor.classList.contains("dl-edit-dialog")).toBe(true);
    expect(editor.classList.contains("dl-create-popover--mobile")).toBe(false);
    expect(editor.querySelector(".dl-edit-section")).not.toBeNull();
    expect(editor.querySelector(".dl-edit-form-scroll")).not.toBeNull();
    expect(editor.querySelector(".dl-edit-actions")).not.toBeNull();
    expect(editor.querySelector<HTMLInputElement>('input[placeholder="Titel..."]')?.value).toBe("Design Review");
  });

  it("keeps the rendered edit surface on Obsidian theme variables and Deskleaf edit styling", () => {
    const plugin = makePlugin();
    const view = makeView(plugin);

    const editor = openEditor(view, makeEvent());

    expect(editor.classList.contains("dl-edit-surface")).toBe(true);
    expect(editor.classList.contains("dl-create-popover")).toBe(false);
    expect(editor.querySelector(".dl-edit-header")).not.toBeNull();
    expect(editor.querySelector(".dl-edit-heading")).not.toBeNull();
    expect(editor.querySelector(".dl-edit-label")).not.toBeNull();
    expect(editor.querySelector(".dl-edit-actions")).not.toBeNull();

    const surfaceRule = cssRule(".dl-edit-surface");
    expect(surfaceRule).toContain("background: var(--background-primary)");
    expect(surfaceRule).toContain("border: 1px solid var(--background-modifier-border)");
    expect(surfaceRule).toContain("border-radius: 8px");

    const headerRule = cssRule(".dl-edit-header");
    expect(headerRule).toContain("border-bottom: 1px solid var(--background-modifier-border)");

    const headingRule = cssRule(".dl-edit-heading");
    expect(headingRule).toContain("color: var(--text-normal)");

    const labelRule = cssRule(".dl-edit-label");
    expect(labelRule).toContain("color: var(--text-muted)");

    const actionsRule = cssRule(".dl-edit-actions");
    expect(actionsRule).toContain("border-top: 1px solid var(--background-modifier-border)");
    expect(actionsRule).toContain("background: var(--background-secondary)");
  });

  it("keeps edit form and sidebar roots horizontally contained", () => {
    const surfaceRule = cssRule(".dl-edit-surface");
    expect(surfaceRule).toContain("overflow-x: hidden");
    expect(surfaceRule).toContain("max-width: calc(100vw - 16px)");

    const formRule = cssRule(".dl-edit-form-scroll");
    expect(formRule).toContain("overflow-x: hidden");

    const actionsRule = cssRule(".dl-edit-actions");
    expect(actionsRule).toContain("flex-wrap: wrap");
    expect(actionsRule).toContain("min-width: 0");

    const sidebarRootRule = cssRule(".dl-sidebar-root");
    expect(sidebarRootRule).toContain("overflow-x: hidden");

    const sidebarToolbarRule = cssRule(".dl-sidebar-toolbar");
    expect(sidebarToolbarRule).toContain("max-width: 100%");
    expect(sidebarToolbarRule).toContain("overflow: hidden");

    const minicalGridRule = cssRule(".dl-minical-grid");
    expect(minicalGridRule).toContain("min-width: 0");
  });

  it("renders read-only event details without actions and without backend updates on close", async () => {
    const plugin = makePlugin();
    const view = makeView(plugin);
    const editor = openEditor(view, makeEvent({ isOrganizer: false }), true);

    expect(editor.textContent).toContain("Dieses Event ist in Deskleaf schreibgeschuetzt.");
    expect(editor.textContent).not.toContain("Speichern");
    expect(editor.querySelector("input")).toBeNull();
    expect(editor.querySelector("textarea")).toBeNull();
    expect(editor.querySelector(".dl-edit-ro-title")?.textContent).toBe("Design Review");
    expect(editor.querySelector(".dl-edit-ro-location")?.textContent).toBe("Hamburg Office");
    expect(editor.querySelector(".dl-edit-ro-text")?.textContent).toBe("Discuss the redesigned edit form.");
    expect(editor.querySelector(".dl-edit-actions")).toBeNull();

    await commitByOutsideClick();

    expect(document.querySelector(".dl-edit-surface")).toBeNull();
    expect(plugin.calendarReader.updateEvent).not.toHaveBeenCalled();
    expect(plugin.noteManager.syncEventNote).not.toHaveBeenCalled();
  });

  it("commits on outside click, discards on escape and skips untouched edits", async () => {
    const plugin = makePlugin();
    const view = makeView(plugin);

    // Escape discards — it is the abort gesture now that the button is gone.
    let editor = openEditor(view, makeEvent());
    const discardedTitle = editor.querySelector<HTMLInputElement>('input[placeholder="Titel..."]');
    expect(discardedTitle).not.toBeNull();
    if (discardedTitle) discardedTitle.value = "Changed then discarded";
    editor.querySelector<HTMLInputElement>('input[placeholder="Titel..."]')?.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    );
    await vi.runAllTimersAsync();
    expect(document.querySelector(".dl-edit-surface")).toBeNull();
    expect(plugin.calendarReader.updateEvent).not.toHaveBeenCalled();
    expect(plugin.noteManager.syncEventNote).not.toHaveBeenCalled();

    // An untouched editor closes without touching the backend at all.
    editor = openEditor(view, makeEvent());
    await commitByOutsideClick();
    expect(document.querySelector(".dl-edit-surface")).toBeNull();
    expect(plugin.calendarReader.updateEvent).not.toHaveBeenCalled();

    // A changed value is written when the editor closes.
    editor = openEditor(view, makeEvent());
    const savedTitle = editor.querySelector<HTMLInputElement>('input[placeholder="Titel..."]');
    expect(savedTitle).not.toBeNull();
    if (savedTitle) savedTitle.value = "Saved title";
    await commitByOutsideClick();

    expect(plugin.calendarReader.updateEvent).toHaveBeenCalledWith(
      "event-1",
      expect.objectContaining({ title: "Saved title" }),
    );
    expect(plugin.noteManager.syncEventNote).toHaveBeenCalledTimes(1);
  });

  it("renders editable values as quiet fields that only take on chrome on interaction", () => {
    const plugin = makePlugin();
    const view = makeView(plugin);
    const editor = openEditor(view, makeEvent());

    // Every editable control opts into the quiet treatment.
    const fields = Array.from(editor.querySelectorAll(".dl-edit-field"));
    expect(fields.map((field) => field.className.split(" ").find((c) => c.startsWith("dl-edit-") && c.endsWith("-input")))).toEqual([
      "dl-edit-title-input",
      "dl-edit-date-input",
      "dl-edit-start-input",
      "dl-edit-end-input",
      "dl-edit-location-input",
      "dl-edit-desc-input",
    ]);

    const restRule = cssRule(".dl-edit-surface .dl-edit-field");
    expect(restRule).toContain("border-color: transparent");
    expect(restRule).toContain("background: transparent");

    expect(cssRule(".dl-edit-surface .dl-edit-field:hover")).toContain("background: var(--background-modifier-hover)");

    const focusRule = cssRule(".dl-edit-surface .dl-edit-field:focus");
    expect(focusRule).toContain("border-color: var(--interactive-accent)");
    expect(focusRule).toContain("background: var(--background-primary)");

    // A rejected value must stay visible through hover and focus.
    const invalidRule = cssRule(".dl-edit-surface .dl-edit-field.dl-create-input--invalid");
    expect(invalidRule).toContain("border-color: var(--color-red)");
  });

  it("leaves the create popover fields fully framed", () => {
    // The create form starts empty — there is nothing to read, so every field
    // still has to announce itself.
    const plugin = makePlugin();
    const view = makeView(plugin);
    view.showCreatePopover("2026-06-26", 600, 660, { clientX: 100, clientY: 100 });
    const popover = document.querySelector<HTMLElement>(".dl-create-popover");
    expect(popover).not.toBeNull();
    expect(popover?.querySelector(".dl-edit-field")).toBeNull();
  });

  it("keeps the editor open when a close would write an invalid event", async () => {
    const plugin = makePlugin();
    const view = makeView(plugin);
    const editor = openEditor(view, makeEvent());
    const titleInput = editor.querySelector<HTMLInputElement>('input[placeholder="Titel..."]');
    expect(titleInput).not.toBeNull();
    if (titleInput) titleInput.value = "   ";

    await commitByOutsideClick();

    expect(document.querySelector(".dl-edit-surface")).not.toBeNull();
    expect(titleInput?.classList.contains("dl-create-input--invalid")).toBe(true);
    expect(plugin.calendarReader.updateEvent).not.toHaveBeenCalled();

    // Escape is the way out of an input too broken to save.
    titleInput?.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    await vi.runAllTimersAsync();
    expect(document.querySelector(".dl-edit-surface")).toBeNull();
    expect(plugin.calendarReader.updateEvent).not.toHaveBeenCalled();
  });

  it("keeps the writable edit delete action on the existing cancelEvent path", async () => {
    const plugin = makePlugin();
    const view = makeView(plugin);
    const editor = openEditor(view, makeEvent());
    const actions = editor.querySelector(".dl-edit-actions");

    expect(actions?.textContent).toContain("Löschen");

    actions?.querySelectorAll<HTMLButtonElement>("button").forEach((button) => {
      if (button.textContent === "Löschen") button.click();
    });
    await vi.runAllTimersAsync();

    expect(plugin.calendarReader.cancelEvent).toHaveBeenCalledWith("event-1", "this");
    expect(plugin.calendarReader.updateEvent).not.toHaveBeenCalled();
    expect(plugin.noteManager.syncEventNote).not.toHaveBeenCalled();
  });

  it("keeps the writable edit decline action on the existing cancelEvent path", async () => {
    const plugin = makePlugin();
    const view = makeView(plugin);
    const editor = openEditor(view, makeEvent({ isOrganizer: false }), false);
    const actions = editor.querySelector(".dl-edit-actions");

    expect(actions?.textContent).toContain("Ablehnen");

    actions?.querySelectorAll<HTMLButtonElement>("button").forEach((button) => {
      if (button.textContent === "Ablehnen") button.click();
    });
    await vi.runAllTimersAsync();

    expect(plugin.calendarReader.cancelEvent).toHaveBeenCalledWith("event-1", "this");
    expect(plugin.calendarReader.updateEvent).not.toHaveBeenCalled();
    expect(plugin.noteManager.syncEventNote).not.toHaveBeenCalled();
  });

  it("opens location URLs externally without event update or note sync", async () => {
    const plugin = makePlugin();
    const view = makeView(plugin);
    const openExternal = vi.fn();
    window.open = openExternal;

    const editor = openEditor(view, makeEvent({ location: "Join https://meet.example.test/room" }));
    const openButton = editor.querySelector<HTMLButtonElement>(".dl-edit-location-open-btn");
    expect(openButton).not.toBeNull();
    expect(openButton?.getAttribute("aria-label")).toBe("URL öffnen");
    expect(editor.querySelector(".dl-edit-location-row")?.contains(openButton!)).toBe(true);

    openButton?.click();
    await vi.runAllTimersAsync();

    expect(openExternal).toHaveBeenCalledWith("https://meet.example.test/room", "_blank", "noopener");
    expect(plugin.calendarReader.updateEvent).not.toHaveBeenCalled();
    expect(plugin.noteManager.syncEventNote).not.toHaveBeenCalled();
  });

  it("shows RSVP actions only for supported invitee events", async () => {
    const plugin = makePlugin();
    const view = makeView(plugin);

    const editor = openEditor(view, makeEvent({
      isOrganizer: false,
      rsvp: { attendeeEmail: "user@example.test", status: null },
    }), true);
    const rsvpGroup = editor.querySelector(".dl-edit-rsvp-actions");
    expect(rsvpGroup).not.toBeNull();
    const rsvpButtons = Array.from(rsvpGroup?.querySelectorAll<HTMLButtonElement>("button") ?? []);
    expect(rsvpButtons.map((button) => button.textContent)).toEqual(["Zusagen", "Mit Vorbehalt", "Absagen"]);

    rsvpButtons.forEach((button) => {
      if (button.textContent === "Mit Vorbehalt") button.click();
    });
    await vi.runAllTimersAsync();

    expect(plugin.calendarReader.updateRsvp).toHaveBeenCalledWith("event-1", "tentative");
    expect(document.querySelector(".dl-edit-surface")).not.toBeNull();
    expect(Array.from(
      editor.querySelectorAll<HTMLButtonElement>(".dl-edit-rsvp-btn--active"),
      (button) => button.textContent,
    )).toEqual(["Mit Vorbehalt"]);
    expect(plugin.calendarReader.updateEvent).not.toHaveBeenCalled();
    expect(plugin.noteManager.syncEventNote).not.toHaveBeenCalled();

    const unsupportedPlugin = makePlugin();
    Reflect.deleteProperty(unsupportedPlugin.calendarReader, "updateRsvp");
    const unsupportedView = makeView(unsupportedPlugin);
    const unsupportedEditor = openEditor(unsupportedView, makeEvent({
      isOrganizer: false,
      rsvp: { attendeeEmail: "user@example.test", status: null },
    }), true);
    expect(unsupportedEditor.querySelector(".dl-edit-rsvp-actions")).toBeNull();
  });

  it("keeps the editor open and visible RSVP state unchanged when RSVP fails", async () => {
    const plugin = makePlugin();
    plugin.calendarReader.updateRsvp.mockRejectedValueOnce(new Error("CalDAV rejected RSVP"));
    const view = makeView(plugin);

    const editor = openEditor(view, makeEvent({
      isOrganizer: false,
      rsvp: { attendeeEmail: "user@example.test", status: "accepted" },
    }), true);
    const activeRsvpButtons = () => Array.from(
      editor.querySelectorAll<HTMLButtonElement>(".dl-edit-rsvp-btn--active"),
      (button) => button.textContent,
    );

    expect(activeRsvpButtons()).toEqual(["Zusagen"]);
    editor.querySelectorAll<HTMLButtonElement>(".dl-edit-rsvp-actions button").forEach((button) => {
      if (button.textContent === "Absagen") button.click();
    });
    await vi.runAllTimersAsync();

    expect(document.querySelector(".dl-edit-surface")).not.toBeNull();
    expect(activeRsvpButtons()).toEqual(["Zusagen"]);
    expect(editor.querySelector(".dl-edit-rsvp-error")?.textContent).toContain("CalDAV rejected RSVP");
    expect(plugin.calendarReader.updateEvent).not.toHaveBeenCalled();
    expect(plugin.noteManager.syncEventNote).not.toHaveBeenCalled();
  });

  it("keeps the recurring save flow behind the scope choice", async () => {
    const plugin = makePlugin();
    const view = makeView(plugin);
    const editor = openEditor(view, makeEvent({ isRecurring: true }));
    const savedTitle = editor.querySelector<HTMLInputElement>('input[placeholder="Titel..."]');
    expect(savedTitle).not.toBeNull();
    if (savedTitle) savedTitle.value = "Recurring title";

    await vi.runAllTimersAsync();
    document.body.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    await Promise.resolve();

    const scopePopover = document.querySelector<HTMLElement>(".dl-edit-scope-popover");
    expect(scopePopover).not.toBeNull();
    expect(plugin.calendarReader.updateEvent).not.toHaveBeenCalled();

    scopePopover?.querySelectorAll<HTMLButtonElement>("button").forEach((button) => {
      if (button.textContent === "Serie") button.click();
    });
    await vi.runAllTimersAsync();

    expect(plugin.calendarReader.updateEvent).toHaveBeenCalledWith(
      "event-1",
      expect.objectContaining({ title: "Recurring title", span: "series" }),
    );
    expect(plugin.noteManager.syncEventNote).toHaveBeenCalledTimes(1);
  });

  it("leaves create popover creation functional and visually distinct", async () => {
    const plugin = makePlugin();
    const view = makeView(plugin);

    view.showCreatePopover("2026-06-26", 9 * 60, 10 * 60, { clientX: 100, clientY: 140 });
    const popover = document.querySelector<HTMLElement>(".dl-create-popover");
    expect(popover).not.toBeNull();
    expect(popover?.classList.contains("dl-edit-surface")).toBe(false);
    expect(popover?.classList.contains("dl-edit-dialog")).toBe(false);

    popover?.querySelector<HTMLInputElement>('input[placeholder="Titel…"]')?.setAttribute("value", "New Event");
    const titleInput = popover?.querySelector<HTMLInputElement>('input[placeholder="Titel…"]');
    if (titleInput) titleInput.value = "New Event";
    popover?.querySelectorAll<HTMLButtonElement>("button").forEach((button) => {
      if (button.textContent === "Erstellen") button.click();
    });
    await vi.runAllTimersAsync();

    expect(plugin.calendarReader.createEvent).toHaveBeenCalledWith(
      expect.objectContaining({ title: "New Event" }),
    );
  });
});
