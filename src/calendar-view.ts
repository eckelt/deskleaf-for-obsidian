import { ItemView, WorkspaceLeaf, TFile, setIcon, Notice, Platform, MarkdownView } from "obsidian";
import type FocalPlugin from "./main";
import type { CalendarEvent } from "./types";
import {
  toDateStr, toTimeStr, get1DayColumn, getNDayColumns, getWeekColumns,
  weekHeaderLabel, dayHeaderLabel, rangeHeaderLabel, addDays, parseDate, shortDayLabel,
  getWeekNumber
} from "./date-utils";
import type { DayColumn } from "./date-utils";
import { openFile } from "./open-file";

export const VIEW_TYPE_FOCAL = "focal-calendar";

// ── Time grid constants ──────────────────────────────────────────────
const HOUR_PX = 64;
const DAY_START = 0;
const DAY_END = 24;
const TOTAL_HOURS = DAY_END - DAY_START;

// Minimum column width in px — drives how many days fit
const MIN_COL_W = 120;
const GUTTER_W  = 44;

function topFromISO(iso: string): number {
  const d = new Date(iso);
  return ((d.getHours() - DAY_START) * 60 + d.getMinutes()) / 60 * HOUR_PX;
}

function heightFromISO(start: string, end: string): number {
  const mins = (new Date(end).getTime() - new Date(start).getTime()) / 60000;
  return Math.max(20, mins / 60 * HOUR_PX);
}

// ── Drag-to-create helpers ───────────────────────────────────────────
function snapMins(mins: number): number { return Math.round(mins / 15) * 15; }
function minsToTimeStr(mins: number): string {
  return `${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`;
}
function minsToISO(date: string, mins: number): string {
  const offset = -new Date().getTimezoneOffset();
  const sign = offset >= 0 ? "+" : "-";
  const abs = Math.abs(offset);
  const tz = `${sign}${String(Math.floor(abs / 60)).padStart(2, "0")}:${String(abs % 60).padStart(2, "0")}`;
  return `${date}T${minsToTimeStr(mins)}:00${tz}`;
}

interface EventLayout {
  event: CalendarEvent;
  col: number;
  totalCols: number;
}

function assignColumns(events: CalendarEvent[]): EventLayout[] {
  if (events.length === 0) return [];
  const sorted = [...events].sort((a, b) => a.start.localeCompare(b.start));
  const result: EventLayout[] = [];

  let i = 0;
  while (i < sorted.length) {
    const cluster: CalendarEvent[] = [sorted[i]];
    let clusterEnd = sorted[i].end;
    let j = i + 1;
    while (j < sorted.length && sorted[j].start < clusterEnd) {
      cluster.push(sorted[j]);
      if (sorted[j].end > clusterEnd) clusterEnd = sorted[j].end;
      j++;
    }

    const colEnds: string[] = [];
    const layouts: EventLayout[] = [];
    for (const ev of cluster) {
      let col = colEnds.findIndex((end) => end <= ev.start);
      if (col === -1) { col = colEnds.length; colEnds.push(ev.end); }
      else colEnds[col] = ev.end;
      layouts.push({ event: ev, col, totalCols: 0 });
    }
    const totalCols = Math.max(1, colEnds.length);
    for (const l of layouts) { l.totalCols = totalCols; result.push(l); }
    i = j;
  }
  return result;
}

// ── View ─────────────────────────────────────────────────────────────

export class FocalCalendarView extends ItemView {
  plugin: FocalPlugin;
  private anchor: Date = new Date();
  private visibleDays: number = 3;
  private selectedEventId: string | null = null;
  private selectedDate: string | null = null;
  private selectedSeriesTitle: string | null = null;
  private unsubscribeData: (() => void) | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private nowTimer: number | null = null;
  private lastAnchorStr: string | null = null;
  private lastVisibleDays: number = 0;
  private initialScrollDone = false;
  private navLabelEl: HTMLElement | null = null;
  private dragCreate: { ghost: HTMLElement; onMove: (e: MouseEvent) => void; onUp: (e: MouseEvent) => void } | null = null;
  private dragMove: { ghost: HTMLElement; landing: HTMLElement; onMove: (e: MouseEvent) => void; onUp: (e: MouseEvent) => void } | null = null;
  private dragResize: { onMove: (e: MouseEvent) => void; onUp: (e: MouseEvent) => void } | null = null;

  constructor(leaf: WorkspaceLeaf, plugin: FocalPlugin) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType() { return VIEW_TYPE_FOCAL; }
  getDisplayText() { return "Deskleaf"; }
  getIcon() { return "calendar-days"; }

  async onOpen() {
    this.unsubscribeData = this.plugin.calendarReader.onChange(() => this.render());
    this.buildNavBar(this.containerEl.children[0] as HTMLElement);
    this.setupResizeObserver();
    this.setupActiveLeafTracking();
    this.nowTimer = window.setInterval(() => this.tickNowLine(), 60_000);
    this.render();
  }

  async onClose() {
    this.unsubscribeData?.();
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    if (this.nowTimer !== null) { window.clearInterval(this.nowTimer); this.nowTimer = null; }
    this.cancelDrag();
  }

  private initialScrollTop(): number {
    const columns =
      this.visibleDays === 6 ? getWeekColumns(this.anchor) :
      this.visibleDays === 1 ? get1DayColumn(this.anchor) :
      getNDayColumns(this.anchor, this.visibleDays);
    const allDates = columns.flatMap(c => c.dates);
    let earliest: number | null = null;
    for (const date of allDates) {
      for (const ev of this.plugin.calendarReader.getEventsForDate(date)) {
        const d = new Date(ev.start);
        const h = d.getHours() + d.getMinutes() / 60;
        if (earliest === null || h < earliest) earliest = h;
      }
    }
    const targetHour = earliest !== null ? Math.max(0, earliest - 0.5) : 8;
    return targetHour * HOUR_PX;
  }

  private hasEventsInView(): boolean {
    const columns =
      this.visibleDays === 6 ? getWeekColumns(this.anchor) :
      this.visibleDays === 1 ? get1DayColumn(this.anchor) :
      getNDayColumns(this.anchor, this.visibleDays);
    return columns.flatMap(c => c.dates).some(
      d => this.plugin.calendarReader.getEventsForDate(d).length > 0
    );
  }

  private render() {
    const anchorStr = toDateStr(this.anchor);
    const rangeChanged = anchorStr !== this.lastAnchorStr || this.visibleDays !== this.lastVisibleDays;
    if (rangeChanged) {
      this.lastAnchorStr    = anchorStr;
      this.lastVisibleDays  = this.visibleDays;
      this.initialScrollDone = false;
    }

    // Only preserve user scroll position once we've scrolled to the first event
    const shouldPreserveScroll = this.initialScrollDone && !rangeChanged;
    const prevScroll = shouldPreserveScroll
      ? (this.containerEl.querySelector<HTMLElement>(".focal-grid-body-scroll")?.scrollTop ?? null)
      : null;

    this.updateNavLabel();

    const root = this.containerEl.children[1] as HTMLElement;
    root.empty();
    root.addClass("focal-root");
    const wrapper = root.createDiv("focal-calendar-wrapper");
    this.buildStatusBar(wrapper);
    this.buildTimeGrid(wrapper);
    this.buildMiniMonth(wrapper);

    setTimeout(() => {
      const scrollEl = this.containerEl.querySelector<HTMLElement>(".focal-grid-body-scroll");
      if (!scrollEl) return;
      if (prevScroll !== null) {
        scrollEl.scrollTop = prevScroll;
      } else {
        scrollEl.scrollTop = this.initialScrollTop();
        if (this.hasEventsInView()) this.initialScrollDone = true;
      }
    }, 0);
  }

  // ── Responsive width ─────────────────────────────────────────────

  private setupResizeObserver() {
    this.resizeObserver = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width ?? this.containerEl.clientWidth;
      const n = Math.min(6, Math.max(1, Math.floor((width - GUTTER_W) / MIN_COL_W)));
      if (n !== this.visibleDays) {
        this.visibleDays = n;
        this.render();
      }
    });
    this.resizeObserver.observe(this.containerEl);
  }

  // ── Active note tracking ─────────────────────────────────────────

  private setupActiveLeafTracking() {
    // active-leaf-change fires on every tab switch, including already-open tabs
    this.registerEvent(this.app.workspace.on("active-leaf-change", (leaf) => {
      const file = (leaf?.view as any)?.file as TFile | null ?? null;
      this.syncSelectionToFile(file);
    }));
    // Cache fallback: leaf may become active before metadata is indexed
    this.registerEvent(this.app.metadataCache.on("changed", (file) => {
      if (this.app.workspace.getActiveFile() === file) this.syncSelectionToFile(file);
    }));
  }

  private syncSelectionToFile(file: TFile | null) {
    // null = non-file view (file explorer, calendar itself, etc.) — keep existing highlight
    if (!file) return;

    const fm = this.app.metadataCache.getFileCache(file)?.frontmatter;
    const raw = fm?.["event-id"];
    const ids: string[] = Array.isArray(raw) ? raw : (raw ? [String(raw)] : []);

    if (ids.length === 0) {
      this.clearSelection();
      return;
    }

    const date = fm?.date as string | undefined;
    const title = fm?.title as string | undefined;
    const allEvents = this.plugin.calendarReader.getEvents();
    const event = allEvents.find(e => ids.includes(e.id))
      ?? (date && title ? allEvents.find(e => e.title === title && e.start.slice(0, 10) === date) : undefined);
    if (!event) return;

    if (event.id !== this.selectedEventId) {
      this.applySelection(event);
      this.render();
    }
  }

  private applySelection(event: CalendarEvent, date?: string) {
    this.selectedEventId = event.id;
    this.selectedDate = date ?? event.start.slice(0, 10);
    // Detect a series by title — covers modified instances where isRecurring may be false
    const titleCount = this.plugin.calendarReader.getEvents().filter(e => e.title === event.title).length;
    this.selectedSeriesTitle = titleCount > 1 ? event.title : null;
  }

  private clearSelection() {
    if (this.selectedEventId) {
      this.selectedEventId = null;
      this.selectedDate = null;
      this.selectedSeriesTitle = null;
      this.render();
    }
  }

  // ── Nav bar ──────────────────────────────────────────────────────

  private buildNavBar(header: HTMLElement) {
    const navBtns = header.querySelector<HTMLElement>(".view-header-nav-buttons");
    if (navBtns) {
      navBtns.empty();

      const todayBtn = navBtns.createEl("button", { cls: "clickable-icon view-header-nav-button" });
      todayBtn.setAttribute("aria-label", "Heute");
      todayBtn.createEl("span").innerHTML =
        `<svg viewBox="0 0 16 16" fill="none" aria-hidden="true">` +
        `<rect x="1.5" y="1.5" width="13" height="9.5" rx="1.5" stroke="currentColor" stroke-width="1.1"/>` +
        `<line x1="1.5" y1="4.5" x2="14.5" y2="4.5" stroke="currentColor" stroke-width="0.9"/>` +
        `<line x1="5" y1="0" x2="5" y2="3" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>` +
        `<line x1="11" y1="0" x2="11" y2="3" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>` +
        `<circle cx="8" cy="8" r="1.3" fill="currentColor"/>` +
        `<line x1="8" y1="15.5" x2="8" y2="12.5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>` +
        `<path d="M5.5 14 L8 11.5 L10.5 14" stroke="currentColor" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round"/>` +
        `</svg>`;
      todayBtn.addEventListener("click", () => { this.anchor = new Date(); this.render(); });

      const prev = navBtns.createEl("button", { cls: "clickable-icon view-header-nav-button" });
      setIcon(prev, "arrow-left");
      prev.setAttribute("aria-label", "Zurück");
      prev.addEventListener("click", () => this.navigate(-1));

      const next = navBtns.createEl("button", { cls: "clickable-icon view-header-nav-button" });
      setIcon(next, "arrow-right");
      next.setAttribute("aria-label", "Weiter");
      next.addEventListener("click", () => this.navigate(1));
    }

    this.navLabelEl = header.querySelector<HTMLElement>(".view-header-title");
    this.updateNavLabel();
  }

  private updateNavLabel() {
    if (!this.navLabelEl) return;
    this.navLabelEl.textContent = this.visibleDays === 1
      ? dayHeaderLabel(this.anchor)
      : this.visibleDays === 6
      ? weekHeaderLabel(this.anchor)
      : rangeHeaderLabel(this.anchor, addDays(this.anchor, this.visibleDays - 1));
  }

  private buildStatusBar(el: HTMLElement) {
    const error = this.plugin.calendarReader.getLoadError();
    if (error) {
      const isCache = error.includes("Cache vom");
      el.createDiv({
        cls: `focal-status-bar ${isCache ? "focal-status-bar--warn" : "focal-status-bar--error"}`,
        text: isCache ? `⚠ ${error}` : `Fehler: ${error}`,
      });
      return;
    }
    if (this.plugin.calendarReader.getEvents().length === 0) {
      el.createDiv({ cls: "focal-status-bar focal-status-bar--warn",
        text: `Keine Events. Pfad: ${this.plugin.calendarReader.getPath()}` });
    }
  }

  private navigate(dir: number) {
    const step = this.visibleDays === 6 ? 7 : this.visibleDays;
    this.anchor = addDays(this.anchor, dir * step);
    this.render();
  }

  // ── Time grid ────────────────────────────────────────────────────

  private buildTimeGrid(el: HTMLElement) {
    const columns: DayColumn[] =
      this.visibleDays === 6 ? getWeekColumns(this.anchor) :
      this.visibleDays === 1 ? get1DayColumn(this.anchor) :
      getNDayColumns(this.anchor, this.visibleDays);
    const today = toDateStr(new Date());

    const grid = el.createDiv("focal-time-grid");

    // Sticky column headers
    const headerRow = grid.createDiv("focal-grid-header-row");
    headerRow.createDiv("focal-time-gutter");

    for (const col of columns) {
      if (col.dates.length === 2) {
        const group = headerRow.createDiv("focal-day-header focal-day-header--double");
        for (const date of col.dates) {
          const d = parseDate(date);
          let cls = "focal-day-subheader";
          if (date === today) cls += " focal-day-header--today";
          if (date === this.selectedDate) cls += " focal-day-header--selected";
          group.createDiv(cls).setText(shortDayLabel(d));
        }
      } else {
        const date = col.dates[0];
        let cls = "focal-day-header";
        if (date === today) cls += " focal-day-header--today";
        if (date === this.selectedDate) cls += " focal-day-header--selected";
        headerRow.createDiv(cls).setText(col.label);
      }
    }

    // All-day strip with spanning chips
    const allDates = columns.flatMap((c) => c.dates);
    const hasAllDay = allDates.some(
      (d) => this.plugin.calendarReader.getAllDayEventsForDate(d).length > 0
    );
    if (hasAllDay) this.buildAllDayRowSpanning(grid, columns, allDates);

    // Scrollable body
    const bodyScroll = grid.createDiv("focal-grid-body-scroll");

    const bodyInner = bodyScroll.createDiv("focal-grid-body-inner");
    const gridHeight = TOTAL_HOURS * HOUR_PX;

    // Time gutter
    const gutter = bodyInner.createDiv("focal-time-gutter focal-time-gutter--labels");
    gutter.style.height = `${gridHeight}px`;
    for (let h = DAY_START; h <= DAY_END; h++) {
      const lbl = gutter.createDiv("focal-time-label");
      lbl.style.top = `${(h - DAY_START) * HOUR_PX}px`;
      lbl.setText(`${String(h).padStart(2, "0")}:00`);
    }

    for (const col of columns) {
      if (col.dates.length === 2) {
        const doubleCol = bodyInner.createDiv("focal-day-body focal-day-body--double");
        for (const date of col.dates) {
          this.buildDayBody(doubleCol.createDiv("focal-day-body focal-day-body--sub"),
            date, gridHeight, today);
        }
      } else {
        this.buildDayBody(bodyInner.createDiv("focal-day-body"), col.dates[0], gridHeight, today);
      }
    }
  }

  private buildAllDayRowSpanning(grid: HTMLElement, columns: DayColumn[], allDates: string[]) {
    const ROW_H = 24;
    const totalCols = columns.length;

    // date → column index mapping
    const dateToCol = new Map<string, number>();
    columns.forEach((col, i) => col.dates.forEach(d => dateToCol.set(d, i)));

    // Collect unique all-day events with their visible column spans
    const seen = new Set<string>();
    const items: Array<{ ev: CalendarEvent; startCol: number; endCol: number }> = [];

    for (const date of allDates) {
      for (const ev of this.plugin.calendarReader.getAllDayEventsForDate(date)) {
        if (seen.has(ev.id)) continue;
        seen.add(ev.id);
        const evStart = ev.start.slice(0, 10);
        const evEnd   = ev.end.slice(0, 10);

        let sc = totalCols, ec = -1;
        for (const [d, colIdx] of dateToCol) {
          if (d >= evStart && d <= evEnd) {
            sc = Math.min(sc, colIdx);
            ec = Math.max(ec, colIdx);
          }
        }
        if (sc <= ec) items.push({ ev, startCol: sc, endCol: ec });
      }
    }

    // Sort: earlier start first, longer span first within same start
    items.sort((a, b) => a.startCol - b.startCol || (b.endCol - b.startCol) - (a.endCol - a.startCol));

    // Greedy row assignment (non-overlapping spans share a row)
    const rowEnds: number[] = [];
    const rowOf = items.map(({ startCol, endCol }) => {
      let row = rowEnds.findIndex(end => end < startCol);
      if (row === -1) { row = rowEnds.length; rowEnds.push(endCol); }
      else rowEnds[row] = endCol;
      return row;
    });

    const areaH = rowEnds.length * ROW_H + 4;

    const allDayRow = grid.createDiv("focal-allday-row");
    allDayRow.createDiv("focal-time-gutter focal-allday-label").setText("ganztägig");
    const area = allDayRow.createDiv("focal-allday-area");
    area.style.height = `${areaH}px`;

    // Column separator guides
    for (let i = 0; i < totalCols; i++) {
      const sep = area.createDiv("focal-allday-col-sep");
      sep.style.left = `${(i / totalCols) * 100}%`;
    }

    // Render spanning chips
    for (let i = 0; i < items.length; i++) {
      const { ev, startCol, endCol } = items[i];
      const row = rowOf[i];
      const chip = area.createDiv("focal-allday-chip");
      chip.setAttribute("title", ev.title);
      if (ev.id === this.selectedEventId) chip.addClass("focal-allday-chip--selected");
      else if (this.selectedSeriesTitle && ev.title === this.selectedSeriesTitle) chip.addClass("focal-allday-chip--series");
      if (ev.isRecurring) chip.addClass("focal-allday-chip--recurring");
      if (ev.isCancelled) chip.addClass("focal-allday-chip--cancelled");

      chip.style.left  = `calc(${(startCol / totalCols) * 100}% + 3px)`;
      chip.style.top   = `${row * ROW_H + 2}px`;
      chip.style.width = `calc(${((endCol - startCol + 1) / totalCols) * 100}% - 6px)`;
      chip.setText(ev.title);
      chip.addEventListener("click", (e) => this.openEvent(ev, ev.start.slice(0, 10), e.metaKey || e.ctrlKey));
    }
  }

  private buildDayBody(el: HTMLElement, date: string, gridHeight: number, today: string) {
    el.dataset.date = date;
    if (date === today) el.addClass("focal-day-body--today");
    if (date === this.selectedDate) el.addClass("focal-day-body--selected");
    el.style.height = `${gridHeight}px`;

    for (let h = 0; h < TOTAL_HOURS; h++) {
      const line = el.createDiv("focal-hour-line");
      line.style.top = `${h * HOUR_PX}px`;
      const half = el.createDiv("focal-hour-line focal-hour-line--half");
      half.style.top = `${h * HOUR_PX + HOUR_PX / 2}px`;
    }

    if (date === today) {
      const now = new Date();
      const topPx = ((now.getHours() - DAY_START) * 60 + now.getMinutes()) / 60 * HOUR_PX;
      if (topPx >= 0 && topPx <= gridHeight) {
        const nowLine = el.createDiv("focal-now-line");
        nowLine.style.top = `${topPx}px`;
        nowLine.createDiv("focal-now-dot");
      }
    }

    for (const layout of assignColumns(this.plugin.calendarReader.getEventsForDate(date))) {
      this.buildEventCard(el, layout.event, layout.col, layout.totalCols, date);
    }

    if (!Platform.isMobile)
      el.addEventListener("mousedown", (e) => this.onDayMouseDown(e, el, date));
  }

  private buildEventCard(container: HTMLElement, event: CalendarEvent, col: number, totalCols: number, date: string) {
    const gridBottom = TOTAL_HOURS * HOUR_PX;
    const rawTop = topFromISO(event.start);
    const rawBottom = rawTop + heightFromISO(event.start, event.end);

    if (rawBottom <= 0 || rawTop >= gridBottom) return;

    const topPx = Math.max(0, rawTop) + 1;
    const heightPx = Math.min(gridBottom, rawBottom) - topPx - 1;

    const card = container.createDiv("focal-event-card");
    card.setAttribute("title", event.title);
    if (event.id === this.selectedEventId) card.addClass("focal-event-card--selected");
    else if (this.selectedSeriesTitle && event.title === this.selectedSeriesTitle) card.addClass("focal-event-card--series");
    const noteFile = this.plugin.noteManager.noteExists(event);
    if (noteFile) card.addClass("focal-event-card--has-note");
    if (event.isRecurring)  card.addClass("focal-event-card--recurring");
    if (event.isCancelled)  card.addClass("focal-event-card--cancelled");
    if ((event as any)._continuesBefore) card.addClass("focal-event-card--continues-before");
    if ((event as any)._continuesAfter)  card.addClass("focal-event-card--continues-after");

    const pct = (n: number) => `${(n * 100).toFixed(2)}%`;
    card.style.top = `${topPx}px`;
    card.style.height = `${heightPx}px`;
    card.style.left = `calc(${pct(col / totalCols)} + 1px)`;
    card.style.width = `calc(${pct(1 / totalCols)} - 3px)`;

    const timeRow = card.createDiv("focal-event-time-row");
    timeRow.createSpan({ cls: "focal-event-time", text: toTimeStr(event.start) });
    if (event.isRecurring) timeRow.createSpan({ cls: "focal-event-recurring-icon", text: "↻" });

    card.createDiv({ cls: "focal-event-title", text: event.title });
    if (event.location && heightPx > 42)
      card.createDiv({ cls: "focal-event-location", text: event.location });

    if (noteFile) {
      const fm = this.app.metadataCache.getFileCache(noteFile)?.frontmatter;
      if (fm?.toBeRemoved)
        card.createDiv({ cls: "focal-event-removal-hint", text: `⏱ ${fm.removalDate ?? ""}` });
    }

    const canEdit = event.isOrganizer && !event.isCancelled && !Platform.isMobile;

    if (canEdit) {
      // Resize handle at bottom edge
      const resizeHandle = card.createDiv("focal-resize-handle");
      resizeHandle.addEventListener("mousedown", (e) => {
        e.stopPropagation();
        this.onResizeMouseDown(e, event, date, card);
      });

      // Drag-to-move: track drag vs click
      let wasDrag = false;
      card.addEventListener("mousedown", (e) => {
        if (e.button !== 0) return;
        if ((e.target as HTMLElement).closest(".focal-resize-handle")) return;
        e.stopPropagation();
        wasDrag = false;
        this.onEventMoveMouseDown(e, event, date, card, () => { wasDrag = true; });
      });
      card.addEventListener("click", (e) => {
        e.stopPropagation();
        if (wasDrag) { wasDrag = false; return; }
        this.openEvent(event, date, e.metaKey || e.ctrlKey);
      });
    } else {
      card.addEventListener("click", (e) => { e.stopPropagation(); this.openEvent(event, date, e.metaKey || e.ctrlKey); });
    }
  }

  // ── Drag-to-create ───────────────────────────────────────────────

  private onDayMouseDown(e: MouseEvent, dayEl: HTMLElement, date: string) {
    if (e.button !== 0) return;
    if ((e.target as HTMLElement).closest(".focal-event-card")) return;
    e.preventDefault();

    const rect = dayEl.getBoundingClientRect();
    const startMin = Math.max(0, Math.min(23 * 60, snapMins((e.clientY - rect.top) / HOUR_PX * 60)));
    let endMin = Math.min(24 * 60, startMin + 30);

    const ghost = dayEl.createDiv("focal-ghost-event");
    this.refreshGhost(ghost, startMin, endMin);

    const onMove = (ev: MouseEvent) => {
      const rawMins = snapMins((ev.clientY - dayEl.getBoundingClientRect().top) / HOUR_PX * 60);
      endMin = Math.max(startMin + 15, Math.min(24 * 60, rawMins));
      this.refreshGhost(ghost, startMin, endMin);
    };

    const onUp = (ev: MouseEvent) => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      document.body.style.userSelect = "";
      ghost.remove();
      this.dragCreate = null;
      this.showCreatePopover(date, startMin, endMin, ev);
    };

    this.dragCreate = { ghost, onMove, onUp };
    document.body.style.userSelect = "none";
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }

  private refreshGhost(ghost: HTMLElement, startMin: number, endMin: number) {
    ghost.style.top    = `${(startMin / 60) * HOUR_PX}px`;
    ghost.style.height = `${Math.max(14, ((endMin - startMin) / 60) * HOUR_PX)}px`;
    ghost.textContent  = `${minsToTimeStr(startMin)} – ${minsToTimeStr(endMin)}`;
  }

  private cancelDrag() {
    if (this.dragCreate) {
      document.removeEventListener("mousemove", this.dragCreate.onMove);
      document.removeEventListener("mouseup", this.dragCreate.onUp);
      this.dragCreate.ghost.remove();
      this.dragCreate = null;
    }
    if (this.dragMove) {
      document.removeEventListener("mousemove", this.dragMove.onMove);
      document.removeEventListener("mouseup", this.dragMove.onUp);
      this.dragMove.ghost.remove();
      this.dragMove.landing.remove();
      this.dragMove = null;
    }
    if (this.dragResize) {
      document.removeEventListener("mousemove", this.dragResize.onMove);
      document.removeEventListener("mouseup", this.dragResize.onUp);
      this.dragResize = null;
    }
    document.body.style.userSelect = "";
  }

  private showCreatePopover(date: string, startMin: number, endMin: number, e: MouseEvent) {
    this.containerEl.querySelector(".focal-create-popover")?.remove();

    const popover = document.body.createDiv("focal-create-popover");

    popover.createDiv({ cls: "focal-create-time", text: `${minsToTimeStr(startMin)} – ${minsToTimeStr(endMin)}` });

    const input = popover.createEl("input", {
      type: "text",
      cls: "focal-create-input",
      placeholder: "Titel eingeben…",
    } as any) as HTMLInputElement;

    const actions = popover.createDiv("focal-create-actions");

    const confirm = async () => {
      const title = input.value.trim();
      if (!title) { input.focus(); return; }
      popover.remove();
      try {
        await this.plugin.calendarReader.createEvent({
          title,
          start: minsToISO(date, startMin),
          end:   minsToISO(date, endMin),
        });
      } catch (err: any) {
        new Notice(`Fehler beim Erstellen: ${err?.message ?? err}`);
      }
    };
    const cancel = () => popover.remove();

    const createBtn = actions.createEl("button", { cls: "focal-create-btn focal-create-btn--primary", text: "Erstellen" });
    const cancelBtn = actions.createEl("button", { cls: "focal-create-btn", text: "Abbrechen" });

    // Prevent input blur when clicking buttons
    createBtn.addEventListener("mousedown", (ev) => ev.preventDefault());
    cancelBtn.addEventListener("mousedown", (ev) => ev.preventDefault());
    createBtn.addEventListener("click", confirm);
    cancelBtn.addEventListener("click", cancel);

    input.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter")  { ev.preventDefault(); confirm(); }
      if (ev.key === "Escape") cancel();
    });

    // Dismiss when clicking outside
    const onOutside = (ev: MouseEvent) => {
      if (!popover.contains(ev.target as Node)) {
        popover.remove();
        document.removeEventListener("mousedown", onOutside);
      }
    };
    setTimeout(() => document.addEventListener("mousedown", onOutside), 0);

    // Position: right of cursor, clamped to viewport
    popover.style.left = `${e.clientX + 12}px`;
    popover.style.top  = `${e.clientY - 24}px`;
    setTimeout(() => {
      const r = popover.getBoundingClientRect();
      if (r.right  > window.innerWidth  - 8) popover.style.left = `${e.clientX - r.width - 12}px`;
      if (r.bottom > window.innerHeight - 8) popover.style.top  = `${window.innerHeight - r.height - 8}px`;
      input.focus();
    }, 0);
  }

  // ── Drag-to-move / Drag-to-resize ───────────────────────────────

  private findDayBodyAt(x: number, y: number): { el: HTMLElement; date: string } | null {
    for (const el of document.elementsFromPoint(x, y)) {
      const h = el as HTMLElement;
      if (h.dataset?.date && h.classList.contains("focal-day-body")) return { el: h, date: h.dataset.date };
    }
    return null;
  }

  private onEventMoveMouseDown(
    e: MouseEvent, event: CalendarEvent, date: string, cardEl: HTMLElement, onDragStart: () => void
  ) {
    const startX = e.clientX, startY = e.clientY;
    const cardRect = cardEl.getBoundingClientRect();
    const clickOffsetMins = Math.round((e.clientY - cardRect.top) / HOUR_PX * 60);
    const durationMins = Math.round((new Date(event.end).getTime() - new Date(event.start).getTime()) / 60000);

    const ghost = document.body.createDiv("focal-drag-ghost");
    ghost.style.cssText = `width:${cardRect.width}px;height:${cardRect.height}px;left:${cardRect.left}px;top:${cardRect.top}px;display:none`;
    ghost.createDiv({ cls: "focal-event-title", text: event.title });

    const landing = document.createElement("div");
    landing.className = "focal-landing-ghost";
    landing.style.height = `${Math.max(20, (durationMins / 60) * HOUR_PX)}px`;

    let dragging = false;
    let targetDate: string | null = null;
    let targetStartMins = 0;

    const onMove = (ev: MouseEvent) => {
      if (!dragging) {
        const dx = ev.clientX - startX, dy = ev.clientY - startY;
        if (dx * dx + dy * dy < 25) return;
        dragging = true;
        document.body.style.userSelect = "none";
        ghost.style.display = "block";
        onDragStart();
      }
      ghost.style.left = `${ev.clientX - cardRect.width / 2}px`;
      ghost.style.top  = `${ev.clientY - (clickOffsetMins / 60) * HOUR_PX}px`;

      const hit = this.findDayBodyAt(ev.clientX, ev.clientY);
      if (hit) {
        const dayRect = hit.el.getBoundingClientRect();
        const rawMins = (ev.clientY - dayRect.top) / HOUR_PX * 60 - clickOffsetMins;
        targetStartMins = Math.max(0, Math.min(23 * 60, snapMins(rawMins)));
        targetDate = hit.date;
        landing.textContent = `${minsToTimeStr(targetStartMins)} – ${minsToTimeStr(Math.min(24 * 60, targetStartMins + durationMins))}`;
        landing.style.top = `${(targetStartMins / 60) * HOUR_PX}px`;
        if (landing.parentElement !== hit.el) hit.el.appendChild(landing);
      } else {
        landing.remove();
        targetDate = null;
      }
    };

    const onUp = async () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      document.body.style.userSelect = "";
      ghost.remove();
      landing.remove();
      this.dragMove = null;
      if (!dragging || !targetDate) return;

      const origDate = event.start.slice(0, 10);
      const origStartMins = new Date(event.start).getHours() * 60 + new Date(event.start).getMinutes();
      if (targetDate === origDate && targetStartMins === origStartMins) return;

      try {
        await this.plugin.calendarReader.moveEvent(
          event.id,
          minsToISO(targetDate, targetStartMins),
          minsToISO(targetDate, targetStartMins + durationMins)
        );
      } catch (err: any) {
        new Notice(`Fehler beim Verschieben: ${err?.message ?? err}`);
      }
    };

    this.dragMove = { ghost, landing, onMove, onUp };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }

  private onResizeMouseDown(e: MouseEvent, event: CalendarEvent, date: string, cardEl: HTMLElement) {
    if (e.button !== 0) return;
    e.preventDefault();

    const startMins = new Date(event.start).getHours() * 60 + new Date(event.start).getMinutes();
    let endMins = new Date(event.end).getHours() * 60 + new Date(event.end).getMinutes();
    const dayBody = cardEl.closest<HTMLElement>(".focal-day-body");
    const origH = cardEl.offsetHeight;

    const onMove = (ev: MouseEvent) => {
      if (!dayBody) return;
      const dayRect = dayBody.getBoundingClientRect();
      const rawMins = (ev.clientY - dayRect.top) / HOUR_PX * 60;
      endMins = Math.max(startMins + 15, Math.min(24 * 60, snapMins(rawMins)));
      const newH = Math.max(20, ((endMins - startMins) / 60) * HOUR_PX) - 2;
      cardEl.style.height = `${newH}px`;
    };

    const onUp = async () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      document.body.style.userSelect = "";
      cardEl.style.height = `${origH}px`;
      this.dragResize = null;

      const origEndMins = new Date(event.end).getHours() * 60 + new Date(event.end).getMinutes();
      if (endMins === origEndMins) return;

      try {
        await this.plugin.calendarReader.moveEvent(
          event.id,
          minsToISO(date, startMins),
          minsToISO(date, endMins)
        );
      } catch (err: any) {
        new Notice(`Fehler beim Ändern: ${err?.message ?? err}`);
      }
    };

    this.dragResize = { onMove, onUp };
    document.body.style.userSelect = "none";
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }

  // ── Mini month ───────────────────────────────────────────────────

  private buildMiniMonth(container: HTMLElement) {
    const year  = this.anchor.getFullYear();
    const month = this.anchor.getMonth();
    const monthNames = ["Jan","Feb","Mär","Apr","Mai","Jun","Jul","Aug","Sep","Okt","Nov","Dez"];

    const mini = container.createDiv("focal-mini-month");
    mini.createDiv({ cls: "focal-mini-month-header", text: `${monthNames[month]} ${year}` });

    const grid = mini.createDiv("focal-mini-month-grid");

    // Header row: KW label + day-of-week labels
    grid.createDiv({ cls: "focal-mini-dow focal-mini-kw-header", text: "KW" });
    for (const d of ["Mo","Di","Mi","Do","Fr","Sa","So"])
      grid.createDiv({ cls: "focal-mini-dow", text: d });

    const firstDow   = new Date(year, month, 1).getDay();
    const leadingEmpty = firstDow === 0 ? 6 : firstDow - 1;
    const totalDays  = new Date(year, month + 1, 0).getDate();
    const totalRows  = Math.ceil((leadingEmpty + totalDays) / 7);
    const today      = toDateStr(new Date());
    const anchorStr  = toDateStr(this.anchor);

    for (let row = 0; row < totalRows; row++) {
      // KW: use the first real day in this row
      let kwDate: Date | null = null;
      for (let col = 0; col < 7; col++) {
        const dayNum = row * 7 + col - leadingEmpty + 1;
        if (dayNum >= 1 && dayNum <= totalDays) { kwDate = new Date(year, month, dayNum); break; }
      }
      const kwCell = grid.createDiv("focal-mini-kw");
      if (kwDate) kwCell.setText(String(getWeekNumber(kwDate)));

      for (let col = 0; col < 7; col++) {
        const dayNum = row * 7 + col - leadingEmpty + 1;
        if (dayNum < 1 || dayNum > totalDays) { grid.createDiv("focal-mini-day--empty"); continue; }

        const date    = new Date(year, month, dayNum);
        const dateStr = toDateStr(date);
        const cell    = grid.createDiv("focal-mini-day");
        cell.setText(String(dayNum));

        const hasEvent =
          this.plugin.calendarReader.getEventsForDate(dateStr).length > 0 ||
          this.plugin.calendarReader.getAllDayEventsForDate(dateStr).length > 0;

        if (hasEvent)              cell.addClass("focal-mini-day--has-event");
        if (dateStr === anchorStr) cell.addClass("focal-mini-day--anchor");
        if (dateStr === today)     cell.addClass("focal-mini-day--today");

        cell.addEventListener("click", () => { this.anchor = date; this.render(); });
      }
    }
  }

  // ── Now-line tick ────────────────────────────────────────────────

  private tickNowLine() {
    const now = new Date();
    const topPx = ((now.getHours() - DAY_START) * 60 + now.getMinutes()) / 60 * HOUR_PX;
    const root = this.containerEl.children[1] as HTMLElement;
    root.querySelectorAll<HTMLElement>(".focal-now-line").forEach((el) => {
      el.style.top = `${topPx}px`;
    });
  }

  // ── Note opening ────────────────────────────────────────────────

  private async openEvent(event: CalendarEvent, date?: string, modifier = false) {
    this.applySelection(event, date);
    this.render();
    const { file, isNew } = await this.plugin.noteManager.openOrCreate(event);
    await openFile(this.app, file, modifier);
    if (isNew) setTimeout(() => {
      this.app.workspace.getActiveViewOfType(MarkdownView)?.editor.fold({ line: 0, ch: 0 });
    }, 100);
  }
}
