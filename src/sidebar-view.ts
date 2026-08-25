import { ItemView, WorkspaceLeaf, TFile, MarkdownRenderer, setIcon } from "obsidian";
import type DeskleafPlugin from "./main";
import { toDateStr, addDays, parseDate, weekStart, getWeekNumber } from "./date-utils";
import { openFile } from "./open-file";
import type { CustomerRef, ProjectRef, TodoStatus } from "./types";
import { matchCustomer } from "./brain-vault";
import { parseLogo } from "./note-logo";
import {
  parseTodoLines, resolveTodoDate, completeTodoLine, reopenTodoLine,
  groupForDate, type TodoGroup,
} from "./todo-parser";

function getSectionIconName(section: SectionName): string {
  switch (section) {
    case "calendar": return "calendar-days";
    case "customers": return "building-2";
    case "projects": return "folder-kanban";
    case "todos": return "square-check-big";
  }
}

export const VIEW_TYPE_SIDEBAR = "deskleaf-sidebar";

type SectionName = "calendar" | "customers" | "projects" | "todos";

// Bumped when the section set changes so a stored layout from the pre-Brain
// "topics" era cannot pin the sidebar to sections that no longer exist.
const LAYOUT_STORAGE_KEY = "deskleaf-sidebar-layout-v2";
const SECTIONS: SectionName[] = ["calendar", "customers", "projects", "todos"];
const DEFAULT_SECTION_SIZES: Record<SectionName, number> = { calendar: 170, customers: 180, projects: 140, todos: 240 };
const MIN_SECTION_H: Record<SectionName, number> = { calendar: 66, customers: 56, projects: 56, todos: 56 };

// Mini calendar geometry — must match .dl-minical-* CSS (row height incl. grid gap)
const MINICAL_ROW_H = 19;
const MINICAL_CHROME_H = 46;
const MINICAL_SEP_H = 16; // month-name separator row height incl. grid gap

const MONTHS_FULL = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];
const MONTHS_SHORT = ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"];

/** "Juni 2026", "Jun – Aug 2026" or "Dez 2026 – Feb 2027" */
function monthRangeLabel(a: Date, b: Date): string {
  if (a.getFullYear() === b.getFullYear()) {
    if (a.getMonth() === b.getMonth()) return `${MONTHS_FULL[a.getMonth()]} ${a.getFullYear()}`;
    return `${MONTHS_SHORT[a.getMonth()]} – ${MONTHS_SHORT[b.getMonth()]} ${a.getFullYear()}`;
  }
  return `${MONTHS_SHORT[a.getMonth()]} ${a.getFullYear()} – ${MONTHS_SHORT[b.getMonth()]} ${b.getFullYear()}`;
}

/** One row in the Kunden or Projekte section. */
interface EntityEntry {
  file: TFile;
  title: string;
  /** Raw `logo:` frontmatter of a customer, if the note carries one. */
  logo?: string;
  /** Right-hand chips: upcoming meetings for a customer, todo count for a project. */
  chips: string[];
  /** Customers not "aktiv" and projects marked `done` are dimmed and sorted last. */
  inactive: boolean;
}
type EntityKind = "customers" | "projects";

interface TodoItem {
  text: string; status: TodoStatus; file: TFile;
  lineIndex: number; date: string | null; noteTitle: string;
}

export class DeskleafSidebarView extends ItemView {
  plugin: DeskleafPlugin;
  private refreshTimer: number | null = null;
  private activeFilePath: string | null = null;
  private sectionOrder: SectionName[] = [...SECTIONS];
  private sectionVisibility: Map<string, boolean> = new Map(SECTIONS.map((s) => [s, true]));
  private sectionSizes: Record<SectionName, number> = { ...DEFAULT_SECTION_SIZES };
  private draggedSection: string | null = null;
  private unsubscribeReader: (() => void) | null = null;

  // Mini calendar state
  private miniAnchor: Date = new Date();
  private miniViewDate: Date = new Date();
  private miniVisibleDates: Set<string> = new Set([toDateStr(new Date())]);
  private miniRows = 6;
  private minicalEl: HTMLElement | null = null;
  private miniResizeObs: ResizeObserver | null = null;

  constructor(leaf: WorkspaceLeaf, plugin: DeskleafPlugin) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType() { return VIEW_TYPE_SIDEBAR; }
  getDisplayText() { return "Deskleaf"; }
  getIcon() { return "deskleaf"; }

  async onOpen() {
    this.loadLayout();
    await this.render();
    this.activeFilePath = this.app.workspace.getActiveFile()?.path ?? null;
    this.highlightActiveEntity();

    this.registerEvent(this.app.workspace.on("file-open", (file) => {
      const prev = this.activeFilePath;
      this.activeFilePath = file?.path ?? null;
      this.highlightActiveEntity();
      if (file?.path !== prev) this.debouncedRefresh(200);
    }));
    this.registerEvent(this.app.metadataCache.on("changed", (file) => {
      // Skip while the user is actively editing — refresh fires on every keystroke otherwise
      if (file === this.app.workspace.getActiveFile()) return;
      this.debouncedRefresh();
    }));
    this.registerEvent(this.app.vault.on("create", () => this.debouncedRefresh()));
    this.registerEvent(this.app.vault.on("delete", () => this.debouncedRefresh()));
    this.registerEvent(this.app.vault.on("rename", () => this.debouncedRefresh()));

    // Event dots in the mini calendar need a refresh when calendar data changes
    this.unsubscribeReader = this.plugin.calendarReader.onChange(() => {
      if (this.minicalEl) this.renderMiniCal(this.minicalEl);
    });

    // Follow the calendar view's visible range so the mini calendar mirrors it
    this.registerEvent((this.app.workspace as any).on("deskleaf:anchor-changed", (dateStr: string, visibleDates?: string[]) => {
      if (!dateStr) return;
      const dates = visibleDates && visibleDates.length > 0 ? visibleDates : [dateStr];
      const sameAnchor = toDateStr(this.miniAnchor) === dateStr;
      const sameRange = dates.length === this.miniVisibleDates.size && dates.every((d) => this.miniVisibleDates.has(d));
      if (sameAnchor && sameRange) return;
      this.miniAnchor = parseDate(dateStr);
      this.miniVisibleDates = new Set(dates);
      this.miniViewDate = new Date(this.miniAnchor);
      if (this.minicalEl) this.renderMiniCal(this.minicalEl);
    }));

    // Internal links rendered by MarkdownRenderer need explicit click handling in custom views
    this.registerDomEvent(this.containerEl, "click", (e: MouseEvent) => {
      const anchor = (e.target as HTMLElement).closest("a.internal-link") as HTMLAnchorElement | null;
      if (!anchor) return;
      e.preventDefault();
      e.stopPropagation();
      const href = anchor.getAttribute("data-href") ?? anchor.textContent ?? "";
      this.app.workspace.openLinkText(href, "", e.metaKey || e.ctrlKey);
    });
  }

  async onClose() {
    this.unsubscribeReader?.();
    this.unsubscribeReader = null;
    this.miniResizeObs?.disconnect();
    this.miniResizeObs = null;
  }

  // ── Layout persistence (per device, hence localStorage) ──────────

  private loadLayout() {
    try {
      const raw = window.localStorage.getItem(LAYOUT_STORAGE_KEY);
      if (!raw) return;
      const layout = JSON.parse(raw);
      if (Array.isArray(layout.order) && layout.order.length === SECTIONS.length
          && SECTIONS.every((s) => layout.order.includes(s))) {
        this.sectionOrder = layout.order;
      }
      if (Array.isArray(layout.hidden)) {
        for (const s of SECTIONS) this.sectionVisibility.set(s, !layout.hidden.includes(s));
      }
      if (layout.sizes && typeof layout.sizes === "object") {
        for (const s of SECTIONS) {
          if (typeof layout.sizes[s] === "number") this.sectionSizes[s] = layout.sizes[s];
        }
      }
    } catch {
      // corrupt layout state is non-fatal — fall back to defaults
    }
  }

  private saveLayout() {
    const hidden = SECTIONS.filter((s) => !(this.sectionVisibility.get(s) ?? true));
    window.localStorage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify({
      order: this.sectionOrder,
      hidden,
      sizes: this.sectionSizes,
    }));
  }

  private highlightActiveEntity() {
    const root = this.containerEl.children[1] as HTMLElement;
    root.querySelectorAll<HTMLElement>(".dl-topic-row[data-path]").forEach((row) => {
      row.toggleClass("dl-topic-row--active", row.getAttribute("data-path") === this.activeFilePath);
    });
  }

  private debouncedRefresh(delay = 400) {
    if (this.refreshTimer !== null) window.clearTimeout(this.refreshTimer);
    this.refreshTimer = window.setTimeout(async () => {
      this.refreshTimer = null;
      await this.render();
    }, delay);
  }

  // ── Root render ──────────────────────────────────────────────────

  async render() {
    const root = this.containerEl.children[1] as HTMLElement;
    this.miniResizeObs?.disconnect();
    this.miniResizeObs = null;
    this.minicalEl = null;
    root.empty();
    root.addClass("dl-sidebar-root");

    this.renderToolbar(root);

    const visible = this.sectionOrder.filter((s) => this.sectionVisibility.get(s) ?? true);
    for (let i = 0; i < visible.length; i++) {
      const section = visible[i];
      const isLast = i === visible.length - 1;

      const wrap = root.createDiv("dl-sidebar-section");
      wrap.setAttribute("data-section", section);
      wrap.style.minHeight = `${MIN_SECTION_H[section]}px`;
      if (isLast) {
        wrap.addClass("dl-sidebar-section--flex");
      } else {
        wrap.addClass("dl-sidebar-section--fixed");
        wrap.style.height = `${this.sectionSizes[section]}px`;
      }

      if (section === "calendar") {
        this.minicalEl = wrap.createDiv("dl-sidebar-minical");
        this.renderMiniCal(this.minicalEl);
        this.observeMiniCal(wrap);
      } else if (section === "customers") {
        this.renderEntities(wrap.createDiv("dl-sidebar-topics"), "customers");
      } else if (section === "projects") {
        this.renderEntities(wrap.createDiv("dl-sidebar-topics"), "projects");
      } else if (section === "todos") {
        await this.renderTodos(wrap.createDiv("dl-sidebar-todos"));
      }

      if (!isLast) this.renderResizer(root, section, wrap);
    }

    this.highlightActiveEntity();
  }

  private renderResizer(root: HTMLElement, section: SectionName, wrap: HTMLElement) {
    const resizer = root.createDiv("dl-sidebar-resizer");
    resizer.addEventListener("pointerdown", (e: PointerEvent) => {
      e.preventDefault();
      resizer.setPointerCapture(e.pointerId);
      resizer.addClass("dl-sidebar-resizer--active");
      const startY = e.clientY;
      const startH = wrap.getBoundingClientRect().height;
      const maxH = root.clientHeight - 80;

      const onMove = (ev: PointerEvent) => {
        const h = Math.min(maxH, Math.max(MIN_SECTION_H[section], startH + ev.clientY - startY));
        wrap.style.height = `${h}px`;
      };
      const onUp = (ev: PointerEvent) => {
        resizer.releasePointerCapture(ev.pointerId);
        resizer.removeClass("dl-sidebar-resizer--active");
        resizer.removeEventListener("pointermove", onMove);
        resizer.removeEventListener("pointerup", onUp);
        this.sectionSizes[section] = wrap.getBoundingClientRect().height;
        this.saveLayout();
      };
      resizer.addEventListener("pointermove", onMove);
      resizer.addEventListener("pointerup", onUp);
    });
  }

  private renderToolbar(container: HTMLElement) {
    const header = container.createDiv("dl-sidebar-toolbar");
    const toolbar = header.createDiv("nav-buttons-container");

    for (const section of this.sectionOrder) {
      const isVisible = this.sectionVisibility.get(section) ?? true;
      const btn = toolbar.createDiv({ cls: ["clickable-icon", "nav-action-button"] });

      if (isVisible) {
        btn.addClass("is-active");
      }

      btn.setAttribute("data-section", section);
      btn.setAttribute("aria-label", this.getSectionLabel(section));
      btn.draggable = true;
      setIcon(btn, getSectionIconName(section));

      btn.addEventListener("click", () => {
        this.sectionVisibility.set(section, !isVisible);
        this.saveLayout();
        this.render();
      });

      btn.addEventListener("dragstart", (e) => {
        this.draggedSection = section;
        (e.dataTransfer as DataTransfer).effectAllowed = "move";
      });

      btn.addEventListener("dragover", (e) => {
        e.preventDefault();
        (e.dataTransfer as DataTransfer).dropEffect = "move";
      });

      btn.addEventListener("drop", (e) => {
        e.preventDefault();
        if (!this.draggedSection || this.draggedSection === section) return;
        const fromIdx = this.sectionOrder.indexOf(this.draggedSection as SectionName);
        const toIdx = this.sectionOrder.indexOf(section);
        if (fromIdx !== -1 && toIdx !== -1) {
          this.sectionOrder.splice(fromIdx, 1);
          this.sectionOrder.splice(toIdx, 0, this.draggedSection as SectionName);
          this.saveLayout();
          this.render();
        }
      });

      btn.addEventListener("dragend", () => {
        this.draggedSection = null;
      });
    }
  }

  private getSectionLabel(section: SectionName): string {
    switch (section) {
      case "calendar": return "Kalender ein-/ausblenden";
      case "customers": return "Kunden ein-/ausblenden";
      case "projects": return "Projekte ein-/ausblenden";
      case "todos": return "Todos ein-/ausblenden";
    }
  }


  /**
   * Height-adaptive mini calendar (continuous week strip).
   *  - 1–3 rows: week mode — pages by the number of visible weeks
   *  - 4 rows up to ~1 full month: month mode with alternating per-month tint
   *  - ≥2 full months: month mode with month-name separator rows; pages monthly
   *    (quarterly once 3+ full months fit)
   */
  private renderMiniCal(container: HTMLElement) {
    container.empty();
    const todayStr = toDateStr(new Date());
    const anchorStr = toDateStr(this.miniAnchor);
    const rows = this.miniRows;
    const weekMode = rows <= 3;

    let viewStart: Date;
    let monthFirst = new Date(this.miniViewDate.getFullYear(), this.miniViewDate.getMonth(), 1);
    let label: string;
    let pageMonths = 1;
    let fullMonths = 0;

    if (weekMode) {
      viewStart = weekStart(this.miniViewDate);
      label = monthRangeLabel(viewStart, addDays(viewStart, rows * 7 - 1));
    } else {
      viewStart = weekStart(monthFirst);
      const endExclusive = addDays(viewStart, rows * 7);
      while (new Date(monthFirst.getFullYear(), monthFirst.getMonth() + fullMonths + 1, 0) < endExclusive) {
        fullMonths++;
      }
      fullMonths = Math.max(1, fullMonths);
      const lastFull = new Date(monthFirst.getFullYear(), monthFirst.getMonth() + fullMonths, 0);
      label = monthRangeLabel(monthFirst, lastFull);
      pageMonths = fullMonths >= 3 ? 3 : 1;
    }

    // ≥2 full months: render each month as its own block with a name header.
    // Fewer (≈6 weeks): one continuous strip, tinting each month alternately.
    const showMonthNames = !weekMode && fullMonths >= 2;
    const tintMonths = !weekMode && !showMonthNames;
    const refMonthIdx = monthFirst.getFullYear() * 12 + monthFirst.getMonth();

    const page = (dir: number) => {
      if (weekMode) {
        this.miniViewDate = addDays(weekStart(this.miniViewDate), dir * rows * 7);
      } else {
        this.miniViewDate = new Date(this.miniViewDate.getFullYear(), this.miniViewDate.getMonth() + dir * pageMonths, 1);
      }
      this.renderMiniCal(container);
    };

    const nav = container.createDiv("dl-minical-nav");
    const prevBtn = nav.createDiv({ cls: ["clickable-icon", "dl-minical-navbtn"] });
    prevBtn.setAttribute("aria-label", weekMode ? "Vorherige Wochen" : pageMonths > 1 ? "Vorheriges Quartal" : "Vorheriger Monat");
    setIcon(prevBtn, "chevron-left");
    prevBtn.addEventListener("click", () => page(-1));

    const labelEl = nav.createDiv({ cls: "dl-minical-label", text: label });
    labelEl.setAttribute("aria-label", "Zu heute springen");
    labelEl.addEventListener("click", () => {
      this.miniViewDate = new Date();
      this.renderMiniCal(container);
    });

    const nextBtn = nav.createDiv({ cls: ["clickable-icon", "dl-minical-navbtn"] });
    nextBtn.setAttribute("aria-label", weekMode ? "Nächste Wochen" : pageMonths > 1 ? "Nächstes Quartal" : "Nächster Monat");
    setIcon(nextBtn, "chevron-right");
    nextBtn.addEventListener("click", () => page(1));

    const grid = container.createDiv("dl-minical-grid");
    grid.createDiv({ cls: "dl-minical-dow dl-minical-kw", text: "KW" });
    for (const d of ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"]) {
      grid.createDiv({ cls: "dl-minical-dow", text: d });
    }

    const reader = this.plugin.calendarReader;

    const addKw = (wkStart: Date) =>
      grid.createDiv({ cls: "dl-minical-kw", text: String(getWeekNumber(wkStart)) });

    const addEmptyCell = () => grid.createDiv("dl-minical-cell dl-minical-cell--empty");

    const addDayCell = (date: Date) => {
      const dateStr = toDateStr(date);
      const cell = grid.createDiv({ cls: "dl-minical-cell", text: String(date.getDate()) });

      const hasEvent =
        reader.getEventsForDate(dateStr).length > 0 ||
        reader.getAllDayEventsForDate(dateStr).length > 0;
      if (hasEvent) cell.addClass("dl-minical-cell--has-event");
      // Mute every other month, never the currently shown one (offset 0)
      if (tintMonths && Math.abs((date.getFullYear() * 12 + date.getMonth()) - refMonthIdx) % 2 === 1) {
        cell.addClass("dl-minical-cell--alt");
      }
      if (this.miniVisibleDates.has(dateStr)) {
        cell.addClass("dl-minical-cell--visible");
        // Rounded ends of the visible-range pill (within a week row)
        if (date.getDay() === 1 || !this.miniVisibleDates.has(toDateStr(addDays(date, -1)))) cell.addClass("dl-minical-cell--visible-start");
        if (date.getDay() === 0 || !this.miniVisibleDates.has(toDateStr(addDays(date, 1)))) cell.addClass("dl-minical-cell--visible-end");
      }
      if (dateStr === anchorStr) cell.addClass("dl-minical-cell--anchor");
      if (dateStr === todayStr) cell.addClass("dl-minical-cell--today");

      cell.addEventListener("click", () => {
        this.miniAnchor = new Date(date);
        this.navigateCalendarTo(new Date(date));
        this.renderMiniCal(container);
      });
    };

    // Fill by a fixed pixel budget so separator rows / block gaps don't overflow
    const budget = rows * MINICAL_ROW_H;
    let usedPx = 0;

    if (showMonthNames) {
      // One block per month: leading/trailing days of the grid week stay empty
      for (let m = 0; m < 24; m++) {
        const mStart = new Date(monthFirst.getFullYear(), monthFirst.getMonth() + m, 1);
        const mEnd = new Date(monthFirst.getFullYear(), monthFirst.getMonth() + m + 1, 0);
        if (m > 0 && usedPx + MINICAL_SEP_H + MINICAL_ROW_H > budget) break;

        const name = MONTHS_FULL[mStart.getMonth()]
          + (mStart.getMonth() === 0 ? ` ${mStart.getFullYear()}` : "");
        grid.createDiv({ cls: "dl-minical-monthsep", text: name });
        usedPx += MINICAL_SEP_H;

        let wk = weekStart(mStart);
        while (wk <= mEnd) {
          if (usedPx + MINICAL_ROW_H > budget) return;
          addKw(wk);
          for (let c = 0; c < 7; c++) {
            const d = addDays(wk, c);
            if (d.getMonth() === mStart.getMonth() && d.getFullYear() === mStart.getFullYear()) addDayCell(d);
            else addEmptyCell();
          }
          usedPx += MINICAL_ROW_H;
          wk = addDays(wk, 7);
        }
      }
    } else {
      // Continuous week strip
      for (let r = 0; r < 60; r++) {
        if (r > 0 && usedPx + MINICAL_ROW_H > budget) break;
        const wkStart = addDays(viewStart, r * 7);
        addKw(wkStart);
        for (let c = 0; c < 7; c++) addDayCell(addDays(wkStart, c));
        usedPx += MINICAL_ROW_H;
      }
    }
  }

  private observeMiniCal(wrap: HTMLElement) {
    this.miniResizeObs?.disconnect();
    this.miniResizeObs = new ResizeObserver((entries) => {
      const h = entries[0]?.contentRect.height ?? wrap.clientHeight;
      const rows = Math.min(30, Math.max(1, Math.floor((h - MINICAL_CHROME_H) / MINICAL_ROW_H)));
      if (rows !== this.miniRows) {
        this.miniRows = rows;
        if (this.minicalEl) this.renderMiniCal(this.minicalEl);
      }
    });
    this.miniResizeObs.observe(wrap);
  }

  private navigateCalendarTo(date: Date) {
    const leaves = this.app.workspace.getLeavesOfType("deskleaf-calendar");
    if (leaves.length === 0) return;
    const calView = leaves[0].view as any;
    if (calView && typeof calView.setAnchor === "function") {
      calView.setAnchor(date);
    }
  }

  // ── Kunden & Projekte ────────────────────────────────────────────
  //
  // The vault's anchor is the customer: meetings, people and todos all hang off
  // a customers/ note by wiki-link and #kunde/<slug> tag. These two sections
  // mirror that structure rather than maintaining a second ordering of their own.

  private order(kind: EntityKind): string[] {
    return kind === "customers" ? this.plugin.settings.customersOrder : this.plugin.settings.projectsOrder;
  }

  private async saveOrder(kind: EntityKind, order: string[]) {
    if (kind === "customers") this.plugin.settings.customersOrder = order;
    else this.plugin.settings.projectsOrder = order;
    await this.plugin.saveSettings();
  }

  /**
   * Upcoming meeting titles per customer, as chip labels. Matched in one pass
   * over the calendar rather than once per customer — matchCustomer already
   * scans every customer, so the naive shape is quadratic in a full year of events.
   */
  private upcomingByCustomer(customers: CustomerRef[]): Map<string, string[]> {
    const today = toDateStr(new Date());
    const byName = new Map<string, string[]>(customers.map((customer) => [customer.name, []]));
    const upcoming = this.plugin.calendarReader
      .getEvents()
      .filter((event) => !event.isCancelled && event.start.slice(0, 10) >= today)
      .sort((a, b) => a.start.localeCompare(b.start));

    for (const event of upcoming) {
      const customer = matchCustomer(event, customers);
      if (!customer) continue;
      const titles = byName.get(customer.name);
      if (titles && titles.length < 6) titles.push(event.title);
    }
    return byName;
  }

  private getEntities(kind: EntityKind): EntityEntry[] {
    const customers = kind === "customers" ? this.plugin.noteManager.getCustomers() : [];
    const upcoming = kind === "customers" ? this.upcomingByCustomer(customers) : new Map<string, string[]>();
    const raw = kind === "customers"
      ? customers.map((customer) => ({
          file: this.fileFor(customer.path),
          title: customer.name,
          logo: customer.logo,
          chips: upcoming.get(customer.name) ?? [],
          inactive: customer.status !== "aktiv",
        }))
      : this.plugin.noteManager.getProjects().map((project) => ({
          file: this.fileFor(project.path),
          title: project.name,
          chips: this.openTodoChip(project),
          inactive: project.done,
        }));

    const present = raw.filter((entry): entry is EntityEntry => entry.file != null);
    const byPath = new Map(present.map((entry) => [entry.file.path, entry]));
    const ordered: EntityEntry[] = [];
    for (const path of this.order(kind)) {
      const entry = byPath.get(path);
      if (entry) { ordered.push(entry); byPath.delete(path); }
    }
    ordered.push(...byPath.values());
    // Finished projects and inactive customers keep their relative order but
    // sink below the live ones.
    return [...ordered.filter((entry) => !entry.inactive), ...ordered.filter((entry) => entry.inactive)];
  }

  private fileFor(path: string): TFile {
    return this.app.vault.getAbstractFileByPath(path) as TFile;
  }

  private openTodoChip(project: ProjectRef): string[] {
    const file = this.fileFor(project.path);
    if (!file) return [];
    const items = this.app.metadataCache.getFileCache(file)?.listItems ?? [];
    const open = items.filter((item) => item.task === " ").length;
    return open > 0 ? [`${open} offen`] : [];
  }

  private renderEntities(container: HTMLElement, kind: EntityKind) {
    const entries = this.getEntities(kind);
    const list = container.createDiv("dl-topics-list");
    for (const entry of entries) this.renderEntityRow(list, entry);
    if (entries.length > 0) this.initDragDrop(list, kind, entries);
    this.renderNewEntityRow(list, kind);
  }

  private renderEntityRow(container: HTMLElement, entry: EntityEntry) {
    const row = container.createDiv("dl-topic-row");
    row.setAttribute("draggable", "true");
    row.setAttribute("data-path", entry.file.path);
    if (entry.inactive) row.addClass("dl-topic-row--inactive");

    const content = row.createDiv("dl-topic-content");
    const titleRow = content.createDiv("dl-topic-titlerow");
    this.renderLogo(titleRow, entry);
    const title = titleRow.createEl("span", { cls: "dl-topic-title", text: entry.title });
    title.addEventListener("mousedown", (e: MouseEvent) => {
      if (e.button === 1) { e.preventDefault(); this.openEntity(entry.file, true); }
    });
    title.addEventListener("click", (e: MouseEvent) => this.openEntity(entry.file, e.metaKey || e.ctrlKey));

    if (entry.chips.length > 0) {
      const chips = content.createDiv("dl-topic-chips");
      for (const chip of entry.chips) chips.createSpan({ cls: "dl-chip", text: chip });
    }
  }

  /**
   * The logo in front of the name, when the note carries one. It is decoration:
   * a missing file or an unreachable URL must leave the row looking normal, so
   * a broken image removes itself rather than showing the browser's placeholder.
   */
  private renderLogo(container: HTMLElement, entry: EntityEntry) {
    const logo = parseLogo(entry.logo);
    if (!logo) return;

    if (logo.kind === "text") {
      container.createSpan({ cls: "dl-topic-logo dl-topic-logo--text", text: logo.value });
      return;
    }

    const src = logo.kind === "url"
      ? logo.url
      : this.resolveVaultImage(logo.path, entry.file.path);
    if (!src) return;

    const img = container.createEl("img", { cls: "dl-topic-logo" });
    img.src = src;
    img.alt = "";
    img.addEventListener("error", () => img.remove(), { once: true });
  }

  /** Resolves a vault-relative or link-shaped image path to a displayable URL. */
  private resolveVaultImage(path: string, sourcePath: string): string | null {
    const file = this.app.metadataCache.getFirstLinkpathDest(path, sourcePath)
      ?? this.app.vault.getAbstractFileByPath(path);
    return file instanceof TFile ? this.app.vault.getResourcePath(file) : null;
  }

  private renderNewEntityRow(container: HTMLElement, kind: EntityKind) {
    const row = container.createDiv("dl-topic-new-row");
    const placeholder = kind === "customers" ? "Kundenname …" : "Projektname …";
    const activate = () => {
      row.empty();
      row.addClass("dl-topic-new-row--active");
      const input = row.createEl("input", { type: "text", placeholder, cls: "dl-topic-new-input" });
      const cancel = () => {
        row.removeClass("dl-topic-new-row--active");
        row.empty();
        row.addEventListener("click", activate, { once: true });
      };
      const confirm = async () => {
        const title = input.value.trim();
        if (title) await this.createEntity(kind, title); else cancel();
      };
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") { e.preventDefault(); confirm(); }
        if (e.key === "Escape") cancel();
      });
      input.addEventListener("blur", () => {
        setTimeout(() => { if (document.activeElement !== input) cancel(); }, 150);
      });
      setTimeout(() => input.focus(), 0);
    };
    row.addEventListener("click", activate, { once: true });
  }

  private async openEntity(file: TFile, modifier = false) {
    await openFile(this.app, file, modifier);
  }

  private async createEntity(kind: EntityKind, title: string) {
    const file = kind === "customers"
      ? await this.plugin.noteManager.createCustomerNote(title)
      : await this.plugin.noteManager.createProjectNote(title);
    await this.openEntity(file);
  }

  private initDragDrop(list: HTMLElement, kind: EntityKind, entries: EntityEntry[]) {
    let dragSrcPath: string | null = null;
    const clearIndicators = () => {
      list.querySelectorAll(".dl-dragging").forEach((el) => el.removeClass("dl-dragging"));
      list.querySelectorAll(".dl-drop-before").forEach((el) => el.removeClass("dl-drop-before"));
      list.querySelectorAll(".dl-drop-after").forEach((el) => el.removeClass("dl-drop-after"));
    };
    list.addEventListener("dragstart", (e: DragEvent) => {
      const row = (e.target as HTMLElement).closest<HTMLElement>("[data-path]");
      if (!row) return;
      dragSrcPath = row.getAttribute("data-path");
      e.dataTransfer?.setData("text/plain", dragSrcPath ?? "");
      setTimeout(() => row.addClass("dl-dragging"), 0);
    });
    list.addEventListener("dragend", () => { clearIndicators(); dragSrcPath = null; });
    list.addEventListener("dragover", (e: DragEvent) => {
      e.preventDefault();
      const row = (e.target as HTMLElement).closest<HTMLElement>("[data-path]");
      if (!row) return;
      clearIndicators();
      const rect = row.getBoundingClientRect();
      row.addClass(e.clientY > rect.top + rect.height / 2 ? "dl-drop-after" : "dl-drop-before");
    });
    list.addEventListener("drop", (e: DragEvent) => {
      e.preventDefault();
      const targetRow = (e.target as HTMLElement).closest<HTMLElement>("[data-path]");
      if (!targetRow || !dragSrcPath) return;
      const targetPath = targetRow.getAttribute("data-path");
      if (!targetPath || targetPath === dragSrcPath) return;
      const insertAfter = e.clientY > targetRow.getBoundingClientRect().top + targetRow.getBoundingClientRect().height / 2;
      const order = entries.map((entry) => entry.file.path);
      const si = order.indexOf(dragSrcPath);
      if (si === -1) return;
      order.splice(si, 1);
      const ti = order.indexOf(targetPath);
      if (ti === -1) return;
      order.splice(insertAfter ? ti + 1 : ti, 0, dragSrcPath);

      // Move row in DOM immediately for instant feedback
      const srcRow = list.querySelector<HTMLElement>(`[data-path="${dragSrcPath.replace(/"/g, '\\"')}"]`);
      if (srcRow) {
        if (insertAfter) targetRow.after(srcRow);
        else targetRow.before(srcRow);
      }
      clearIndicators();

      // Persist and re-render in background
      this.saveOrder(kind, order).then(() => this.render());
    });
  }

  // ── Todos ────────────────────────────────────────────────────────

  private async renderTodos(container: HTMLElement) {
    const todos = await this.collectTodos();
    const groups = this.groupTodos(todos);
    const openCount = Object.values(groups).reduce((s, g) => s + g.length, 0);

    const header = container.createDiv("dl-sidebar-todos-header");
    const filterWrap = header.createDiv("dl-todo-filter-wrap");
    setIcon(filterWrap.createSpan("dl-todo-filter-icon"), "search");
    const filterInput = filterWrap.createEl("input", {
      type: "text",
      cls: "dl-todo-filter",
      placeholder: "Filter",
    } as any) as HTMLInputElement;
    const updateFilterVisibility = () => {
      filterWrap.toggleClass("dl-todo-filter-wrap--active", document.activeElement === filterInput || filterInput.value.length > 0);
    };
    filterWrap.addEventListener("click", () => filterInput.focus());
    filterInput.addEventListener("focus", updateFilterVisibility);
    filterInput.addEventListener("blur", updateFilterVisibility);
    header.createSpan({ cls: "dl-sidebar-count", text: String(openCount) });

    const labels: Record<TodoGroup, string> = {
      important: "Wichtig", today: "Heute", week: "Diese Woche", later: "Später", undated: "Ohne Datum", past: "Früher",
    };
    const sections: HTMLElement[] = [];
    for (const key of (["important", "today", "week", "later", "undated", "past"] as TodoGroup[])) {
      const items = groups[key];
      if (items.length === 0) continue;
      const section = container.createDiv("dl-board-section");
      sections.push(section);
      section.createDiv({ cls: "dl-board-group-label", text: labels[key] });
      for (const todo of items) await this.renderTodoItem(section, todo);
    }

    filterInput.addEventListener("input", () => {
      updateFilterVisibility();
      const q = filterInput.value.trim().toLowerCase();
      for (const section of sections) {
        let visible = 0;
        section.querySelectorAll<HTMLElement>(".dl-todo-row").forEach((row) => {
          const match = !q || (row.dataset.filter ?? "").includes(q);
          row.style.display = match ? "" : "none";
          if (match) visible++;
        });
        const lbl = section.querySelector<HTMLElement>(".dl-board-group-label");
        if (lbl) lbl.style.display = visible === 0 ? "none" : "";
      }
    });
  }


  private async renderTodoItem(container: HTMLElement, todo: TodoItem) {
    const row = container.createDiv("dl-todo-row");
    row.dataset.filter = `${todo.text} ${todo.noteTitle}`.toLowerCase();
    const checkbox = row.createEl("input", { type: "checkbox" } as any) as HTMLInputElement;
    checkbox.checked = todo.status === "closed";
    checkbox.addEventListener("change", async () => {
      await this.toggleTodo(todo, checkbox.checked);
      await this.render();
    });
    const content = row.createDiv("dl-todo-content");
    const label = content.createSpan({ cls: "dl-todo-text" });
    await MarkdownRenderer.render(this.app, todo.text, label, todo.file.path, this);
    const chip = content.createEl("span", {
      cls: "dl-todo-chip",
      text: `${todo.noteTitle}${todo.date ? " · " + todo.date : ""}`,
    });
    chip.addEventListener("click", (e) => {
      openFile(this.app, todo.file, e.metaKey || e.ctrlKey);
    });
  }

  private parseTodosFromFile(file: TFile, content: string): TodoItem[] {
    const cache = this.app.metadataCache.getFileCache(file);
    const fm = cache?.frontmatter;
    // Meeting notes carry `date` (MCP shape) or `datum` (older template); it is
    // only the fallback — a line's own `due::` always wins.
    const noteDate: string | null = fm?.date ?? fm?.datum ?? null;
    const noteTitle: string = fm?.title ?? file.basename;
    return parseTodoLines(content).map((todo) => ({
      text: todo.text,
      status: todo.status,
      file,
      lineIndex: todo.lineIndex,
      date: resolveTodoDate(todo, noteDate),
      noteTitle,
    }));
  }

  /**
   * Same source set as the MCP's list_open_todos: the configured folders plus
   * loose notes at the vault root. Kanban boards are excluded — their cards are
   * checkboxes too, and they have their own board.
   */
  private async collectTodos(): Promise<TodoItem[]> {
    const folders = this.plugin.settings.vault.todoFolders;
    const files = this.app.vault.getMarkdownFiles().filter((file) => {
      if (this.app.metadataCache.getFileCache(file)?.frontmatter?.["kanban-plugin"]) return false;
      return folders.some((folder) => file.path.startsWith(folder + "/")) || !file.path.includes("/");
    });
    const todos: TodoItem[] = [];
    for (const file of files) {
      const content = await this.app.vault.cachedRead(file);
      todos.push(...this.parseTodosFromFile(file, content));
    }
    return todos;
  }

  private groupTodos(todos: TodoItem[]): Record<TodoGroup, TodoItem[]> {
    const today = toDateStr(new Date());
    const weekEnd = toDateStr(addDays(new Date(), 7));
    const groups: Record<TodoGroup, TodoItem[]> = { important: [], today: [], week: [], later: [], undated: [], past: [] };
    for (const todo of todos) {
      if (todo.status === "closed") continue;
      groups[groupForDate(todo.status, todo.date, today, weekEnd)].push(todo);
    }
    return groups;
  }

  /** Writes `- [x] … ✅ yyyy-mm-dd`, the shape complete_todo in the MCP expects. */
  private async toggleTodo(todo: TodoItem, checked: boolean) {
    const content = await this.app.vault.read(todo.file);
    const lines = content.split("\n");
    lines[todo.lineIndex] = checked
      ? completeTodoLine(lines[todo.lineIndex], toDateStr(new Date()))
      : reopenTodoLine(lines[todo.lineIndex]);
    await this.app.vault.modify(todo.file, lines.join("\n"));
  }
}
