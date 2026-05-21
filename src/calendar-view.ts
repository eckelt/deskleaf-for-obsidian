import {
  ItemView,
  WorkspaceLeaf,
  TFile,
  setIcon,
  Notice,
  Platform,
  MarkdownView,
  Menu,
} from "obsidian";
import type DeskleafPlugin from "./main";
import type { CalendarEvent } from "./types";
import {
  toDateStr,
  toTimeStr,
  get1DayColumn,
  getNDayColumns,
  getWeekColumns,
  weekHeaderLabel,
  dayHeaderLabel,
  rangeHeaderLabel,
  addDays,
  parseDate,
  shortDayLabel,
  getWeekNumber,
} from "./date-utils";
import type { DayColumn } from "./date-utils";
import { openFile } from "./open-file";

export const VIEW_TYPE_CALENDAR = "deskleaf-calendar";

const DAILY_NOTES_FOLDER = "Journal";
const DAILY_NOTE_RE = /^Journal\/(\d{4}-\d{2}-\d{2})\.md$/;

type Selection =
  | { kind: "event"; id: string; seriesTitle: string | null }
  | { kind: "date"; date: string }
  | null;

const DESKLEAF_SVG_PATH =
  "M11.945,40.638C15.831,40.266 28.662,30.675 29.528,29.942C30.947,28.741 32.043,27.809 32.97,26.959" +
  "C34.372,25.676 35.389,24.584 36.556,23.045C37.214,22.177 37.92,21.167 38.771,19.9" +
  "C37.735,21.006 36.661,22.067 35.55,23.086C34.973,23.615 34.387,24.133 33.791,24.639" +
  "C31.029,26.987 28.061,29.099 24.92,31.012C23.203,32.057 21.435,33.043 19.619,33.974" +
  "C13.698,33 9.175,27.859 9.175,21.672C9.175,14.791 14.77,9.204 21.661,9.204L49.052,9.204" +
  "L49.052,35.513C49.052,42.395 43.457,47.982 36.566,47.982C30.155,47.982 24.866,43.146 24.16,36.931" +
  "L24.08,37.048C24.08,37.048 17.148,42.54 13.712,43.8C13.077,44.032 11.683,42.31 11.945,40.638Z";

function deskleafIconSvg(size: number): string {
  return (
    `<svg width="${size}" height="${size}" viewBox="0 0 60 60" style="display:inline-block;vertical-align:middle;flex-shrink:0;fill-rule:evenodd;clip-rule:evenodd">` +
    `<g transform="translate(0.414023,0.934705)">` +
    `<path fill="currentColor" d="${DESKLEAF_SVG_PATH}"/>` +
    `</g></svg>`
  );
}

function todayIconSvg(size: number): string {
  return (
    `<svg width="${size}" height="${size}" viewBox="0 0 60 60" style="display:inline-block;vertical-align:middle;flex-shrink:0;fill-rule:evenodd;clip-rule:evenodd;stroke-linecap:round;stroke-linejoin:round;stroke-miterlimit:1.5">` +
    `<g transform="matrix(0.815869,0,0,0.826332,4.41553,6.00109)">` +
    `<path fill="currentColor" d="M26.074,49.855C26.074,50.244 25.918,50.616 25.64,50.891C25.361,51.165 24.984,51.32 24.591,51.32C21.014,51.32 12.204,51.32 12.204,51.32C8.277,51.32 5.089,48.171 5.089,44.294L5.089,12.049C5.089,8.172 8.277,5.024 12.204,5.024L49.125,5.024C53.052,5.024 56.241,8.172 56.241,12.049L56.241,44.294C56.241,48.171 53.052,51.32 49.125,51.32L36.885,51.32C36.492,51.32 36.115,51.165 35.836,50.891C35.558,50.616 35.402,50.244 35.402,49.855C35.402,49.854 35.402,49.853 35.402,49.852C35.402,49.464 35.558,49.091 35.836,48.817C36.115,48.542 36.492,48.388 36.885,48.388C40.434,48.388 49.125,48.388 49.125,48.388C51.413,48.388 53.271,46.553 53.271,44.294L53.271,14.765L8.058,14.765L8.058,44.294C8.058,46.553 9.916,48.388 12.204,48.388L24.591,48.388C24.984,48.388 25.361,48.542 25.64,48.817C25.918,49.091 26.074,49.464 26.074,49.852C26.074,49.853 26.074,49.854 26.074,49.855Z"/>` +
    `</g>` +
    `<g transform="matrix(1,0,0,1,-0.67791,1.41425)">` +
    `<circle cx="30.205" cy="23.227" r="2.717" fill="currentColor"/>` +
    `</g>` +
    `<g transform="matrix(0.999993,-0.00148916,-0.00148916,0.662649,0.0704775,15.9659)">` +
    `<path d="M29.528,47.197L29.434,25.944" fill="none" stroke="currentColor" stroke-width="2.86"/>` +
    `</g>` +
    `<g transform="matrix(1,0,0,1,0.242592,5.91298)">` +
    `<path d="M23.617,31.69L29.434,25.944L34.817,31.857" fill="none" stroke="currentColor" stroke-width="2.42"/>` +
    `</g>` +
    `</svg>`
  );
}

const TEAMS_SVG_PATH =
  "M36.559,19.452C36.51,19.138 36.484,18.816 36.484,18.488C36.484,15.107 39.229,12.361 42.61,12.361C45.5,12.361 47.926,14.367 48.57,17.061C48.679,17.519 48.737,17.997 48.737,18.488C48.737,21.869 45.992,24.615 42.61,24.615C39.919,24.615 37.63,22.875 36.809,20.46C36.698,20.135 36.614,19.798 36.559,19.452Z" +
  "M14.549,39.964C14.545,39.892 14.543,39.82 14.543,39.747L14.543,31.141C14.543,28.767 16.471,26.839 18.846,26.839L28.977,26.839C31.352,26.839 33.28,28.767 33.28,31.141L33.28,39.305C33.28,44.229 36.985,48.295 41.758,48.864C41.401,48.909 41.038,48.932 40.669,48.932L23.202,48.932C18.423,48.932 14.543,45.052 14.543,40.273C14.543,40.17 14.545,40.067 14.549,39.964Z" +
  "M34.727,31.614C35.162,30.516 36.234,29.739 37.485,29.739L46.363,29.739C47.999,29.739 49.327,31.067 49.327,32.704L49.327,38.633C49.327,38.84 49.306,39.042 49.266,39.236C49.307,39.576 49.327,39.922 49.327,40.273C49.327,44.473 46.331,47.978 42.361,48.766C37.9,47.928 34.521,44.008 34.521,39.305L34.521,32.704C34.521,32.319 34.594,31.952 34.727,31.614Z" +
  "M23.523,7.194C27.955,7.194 31.553,10.792 31.553,15.224C31.553,19.656 27.955,23.255 23.523,23.255C19.091,23.255 15.492,19.656 15.492,15.224C15.492,10.792 19.091,7.194 23.523,7.194Z";

function teamsIconSvg(size: number): string {
  return (
    `<svg width="${size}" height="${size}" viewBox="0 0 60 60" style="display:inline-block;vertical-align:middle;flex-shrink:0;fill-rule:evenodd;clip-rule:evenodd">` +
    `<g transform="translate(-2.4078,0.458041)">` +
    `<path fill="currentColor" d="${TEAMS_SVG_PATH}"/>` +
    `</g></svg>`
  );
}

// ── Time grid constants ──────────────────────────────────────────────
const HOUR_PX = 64;
const DAY_START = 0;
const DAY_END = 24;
const TOTAL_HOURS = DAY_END - DAY_START;

// Minimum column width in px — drives how many days fit
const MIN_COL_W = 120;
const GUTTER_W = 44;

// All-day row: max visible height (≈1.5 event rows), then scroll
const ALLDAY_MAX_H = 30;

function topFromISO(iso: string): number {
  const d = new Date(iso);
  return (((d.getHours() - DAY_START) * 60 + d.getMinutes()) / 60) * HOUR_PX;
}

function heightFromISO(start: string, end: string): number {
  const mins = (new Date(end).getTime() - new Date(start).getTime()) / 60000;
  return Math.max(20, (mins / 60) * HOUR_PX);
}

// ── Drag-to-create helpers ───────────────────────────────────────────
function snapMins(mins: number): number {
  return Math.round(mins / 15) * 15;
}
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
      if (col === -1) {
        col = colEnds.length;
        colEnds.push(ev.end);
      } else colEnds[col] = ev.end;
      layouts.push({ event: ev, col, totalCols: 0 });
    }
    const totalCols = Math.max(1, colEnds.length);
    for (const l of layouts) {
      l.totalCols = totalCols;
      result.push(l);
    }
    i = j;
  }
  return result;
}

// ── View ─────────────────────────────────────────────────────────────

export class DeskleafCalendarView extends ItemView {
  plugin: DeskleafPlugin;
  private anchor: Date = new Date();
  private visibleDays: number = 3;
  private selection: Selection = null;
  private get selectedEventId() { return this.selection?.kind === "event" ? this.selection.id : null; }
  private get selectedDate() { return this.selection?.kind === "date" ? this.selection.date : null; }
  private get selectedSeriesTitle() { return this.selection?.kind === "event" ? this.selection.seriesTitle : null; }
  private noteCache: Map<string, TFile> = new Map();
  private unsubscribeData: (() => void) | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private nowTimer: number | null = null;
  private lastAnchorStr: string | null = null;
  private lastVisibleDays: number = 0;
  private initialScrollDone = false;
  private navLabelEl: HTMLElement | null = null;
  private dragCreate: {
    ghost: HTMLElement;
    onMove: (e: MouseEvent) => void;
    onUp: (e: MouseEvent) => void;
  } | null = null;
  private dragMove: {
    ghost: HTMLElement;
    landing: HTMLElement;
    onMove: (e: MouseEvent) => void;
    onUp: (e: MouseEvent) => void;
  } | null = null;
  private dragResize: {
    onMove: (e: MouseEvent) => void;
    onUp: (e: MouseEvent) => void;
  } | null = null;
  private hoverEl: HTMLElement | null = null;
  private hoverTimer: number | null = null;
  private carouselTracks: HTMLElement[] = [];
  private slideDir: number = 0;
  private desktopSlideZone: HTMLElement | null = null;

  constructor(leaf: WorkspaceLeaf, plugin: DeskleafPlugin) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType() {
    return VIEW_TYPE_CALENDAR;
  }
  getDisplayText() {
    return "Deskleaf";
  }
  getIcon() {
    return "deskleaf-calendar";
  }

  async onOpen() {
    this.unsubscribeData = this.plugin.calendarReader.onChange(() =>
      this.render(),
    );
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
    if (this.nowTimer !== null) {
      window.clearInterval(this.nowTimer);
      this.nowTimer = null;
    }
    this.cancelDrag();
    this.hideHoverPopover();
  }

  private computeInitialScroll(): { top: number; hasEvents: boolean } {
    const allDates = this.getColumnsForOffset(0).flatMap((c) => c.dates);
    let earliest: number | null = null;
    for (const date of allDates) {
      for (const ev of this.plugin.calendarReader.getEventsForDate(date)) {
        const d = new Date(ev.start);
        const h = d.getHours() + d.getMinutes() / 60;
        if (earliest === null || h < earliest) earliest = h;
      }
    }
    const top = (earliest !== null ? Math.max(0, earliest - 0.5) : 8) * HOUR_PX;
    return { top, hasEvents: earliest !== null };
  }

  private render() {
    const anchorStr = toDateStr(this.anchor);
    const rangeChanged =
      anchorStr !== this.lastAnchorStr ||
      this.visibleDays !== this.lastVisibleDays;
    if (rangeChanged) {
      this.lastAnchorStr = anchorStr;
      this.lastVisibleDays = this.visibleDays;
      this.initialScrollDone = false;
    }

    // Only preserve user scroll position once we've scrolled to the first event
    const shouldPreserveScroll = this.initialScrollDone && !rangeChanged;
    const prevScroll = shouldPreserveScroll
      ? (this.containerEl.querySelector<HTMLElement>(".dl-grid-body-scroll")
          ?.scrollTop ?? null)
      : null;

    this.noteCache = this.plugin.noteManager.buildNoteCache();
    this.updateNavLabel();

    const root = this.containerEl.children[1] as HTMLElement;
    root.empty();
    root.addClass("dl-root");
    const wrapper = root.createDiv("dl-calendar-wrapper");
    this.buildStatusBar(wrapper);
    this.buildTimeGrid(wrapper);
    // Apply slide animation to the slide zone only (gutter stays fixed)
    const zone = this.desktopSlideZone;
    if (this.slideDir !== 0 && !Platform.isMobile && zone) {
      zone.classList.add(this.slideDir > 0 ? "dl-slide-in-right" : "dl-slide-in-left");
    }
    this.buildMiniMonth(root); // outside wrapper so it doesn't slide

    setTimeout(() => {
      const scrollEl = this.containerEl.querySelector<HTMLElement>(
        ".dl-grid-body-scroll",
      );
      if (!scrollEl) return;
      if (prevScroll !== null) {
        scrollEl.scrollTop = prevScroll;
      } else {
        const { top, hasEvents } = this.computeInitialScroll();
        scrollEl.scrollTop = top;
        if (hasEvents) this.initialScrollDone = true;
      }
    }, 0);
  }

  // ── Responsive width ─────────────────────────────────────────────

  private setupResizeObserver() {
    this.resizeObserver = new ResizeObserver((entries) => {
      const width =
        entries[0]?.contentRect.width ?? this.containerEl.clientWidth;
      const n = Math.min(
        6,
        Math.max(1, Math.floor((width - GUTTER_W) / MIN_COL_W)),
      );
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
    this.registerEvent(
      this.app.workspace.on("active-leaf-change", (leaf) => {
        const file = ((leaf?.view as any)?.file as TFile | null) ?? null;
        this.syncSelectionToFile(file);
      }),
    );
    // Cache fallback: leaf may become active before metadata is indexed
    this.registerEvent(
      this.app.metadataCache.on("changed", (file) => {
        if (this.app.workspace.getActiveFile() === file)
          this.syncSelectionToFile(file);
      }),
    );
  }

  private syncSelectionToFile(file: TFile | null) {
    // null = non-file view (file explorer, calendar itself, etc.) — keep existing highlight
    if (!file) return;

    const dailyMatch = DAILY_NOTE_RE.exec(file.path);
    if (dailyMatch) {
      const date = dailyMatch[1];
      if (this.selection?.kind !== "date" || this.selection.date !== date) {
        this.selection = { kind: "date", date };
        this.render();
      }
      return;
    }

    const fm = this.app.metadataCache.getFileCache(file)?.frontmatter;
    const raw = fm?.["event-id"];
    const ids: string[] = Array.isArray(raw) ? raw : raw ? [String(raw)] : [];

    if (ids.length === 0) {
      this.clearSelection();
      return;
    }

    const date = fm?.date as string | undefined;
    const title = fm?.title as string | undefined;
    const allEvents = this.plugin.calendarReader.getEvents();
    const event =
      allEvents.find((e) => ids.includes(e.id)) ??
      (date && title
        ? allEvents.find((e) => e.title === title && e.start.slice(0, 10) === date)
        : undefined);
    if (!event) return;

    if (event.id !== this.selectedEventId) {
      this.applySelection(event);
      this.render();
    }
  }

  private applySelection(event: CalendarEvent) {
    const titleCount = this.plugin.calendarReader.getEvents()
      .filter((e) => e.title === event.title).length;
    this.selection = {
      kind: "event",
      id: event.id,
      seriesTitle: titleCount > 1 ? event.title : null,
    };
  }

  private clearSelection() {
    if (this.selection !== null) {
      this.selection = null;
      this.render();
    }
  }

  // ── Nav bar ──────────────────────────────────────────────────────

  private buildNavBar(header: HTMLElement) {
    const navBtns = header.querySelector<HTMLElement>(
      ".view-header-nav-buttons",
    );
    if (navBtns) {
      navBtns.empty();

      const todayBtn = navBtns.createEl("button", {
        cls: "clickable-icon view-header-nav-button",
      });
      todayBtn.setAttribute("aria-label", "Heute");
      todayBtn.createEl("span").innerHTML = todayIconSvg(16);
      todayBtn.addEventListener("click", () => {
        const today = new Date();
        const dir = toDateStr(today) === toDateStr(this.anchor) ? 0
          : today > this.anchor ? 1 : -1;
        this.anchor = today;
        this.animatedRender(dir);
      });

      const prev = navBtns.createEl("button", {
        cls: "clickable-icon view-header-nav-button",
      });
      setIcon(prev, "arrow-left");
      prev.setAttribute("aria-label", "Zurück");
      prev.addEventListener("click", () => this.navigate(-1));

      const next = navBtns.createEl("button", {
        cls: "clickable-icon view-header-nav-button",
      });
      setIcon(next, "arrow-right");
      next.setAttribute("aria-label", "Weiter");
      next.addEventListener("click", () => this.navigate(1));
    }

    this.navLabelEl = header.querySelector<HTMLElement>(".view-header-title");
    this.updateNavLabel();
  }

  private updateNavLabel() {
    if (!this.navLabelEl) return;
    this.navLabelEl.textContent =
      this.visibleDays === 1
        ? dayHeaderLabel(this.anchor)
        : this.visibleDays === 6
          ? weekHeaderLabel(this.anchor)
          : rangeHeaderLabel(
              this.anchor,
              addDays(this.anchor, this.visibleDays - 1),
            );
  }

  private buildStatusBar(el: HTMLElement) {
    const error = this.plugin.calendarReader.getLoadError();
    if (error) {
      const isCache = error.includes("Cache vom");
      el.createDiv({
        cls: `dl-status-bar ${isCache ? "dl-status-bar--warn" : "dl-status-bar--error"}`,
        text: isCache ? `⚠ ${error}` : `Fehler: ${error}`,
      });
      return;
    }
    if (this.plugin.calendarReader.getEvents().length === 0) {
      el.createDiv({
        cls: "dl-status-bar dl-status-bar--warn",
        text: `Keine Events. Pfad: ${this.plugin.calendarReader.getPath()}`,
      });
    }
  }

  private navigate(dir: number) {
    const step = this.visibleDays === 6 ? 7 : this.visibleDays;
    this.anchor = addDays(this.anchor, dir * step);
    this.animatedRender(dir);
  }

  private animatedRender(dir: number) {
    if (Platform.isMobile || dir === 0) {
      this.render();
      return;
    }

    // Detach old slide zone before render() clears the DOM
    const oldSlideZone = this.containerEl
      .querySelector<HTMLElement>(".dl-slide-zone");
    if (oldSlideZone) oldSlideZone.remove();

    this.slideDir = dir;
    this.render();
    this.slideDir = 0;

    if (oldSlideZone) {
      const grid = this.containerEl.querySelector<HTMLElement>(".dl-time-grid--desktop");
      if (grid) {
        // Overlay old slide zone for exit animation — positioned over the slide column
        oldSlideZone.style.cssText +=
          `;position:absolute;top:0;left:${GUTTER_W}px;right:0;bottom:0;z-index:4;pointer-events:none;`;
        oldSlideZone.classList.add(dir > 0 ? "dl-slide-out-left" : "dl-slide-out-right");
        grid.appendChild(oldSlideZone);
        setTimeout(() => oldSlideZone.remove(), 260);
      }
    }
  }

  // ── Time grid ────────────────────────────────────────────────────

  private getColumnsForOffset(offset: number): DayColumn[] {
    const step = this.visibleDays === 6 ? 7 : this.visibleDays;
    const shifted = addDays(this.anchor, offset * step);
    return this.visibleDays === 6
      ? getWeekColumns(shifted)
      : this.visibleDays === 1
        ? get1DayColumn(shifted)
        : getNDayColumns(shifted, this.visibleDays);
  }

  private buildHeadersInto(container: HTMLElement, columns: DayColumn[], today: string) {
    for (const col of columns) {
      if (col.dates.length === 2) {
        const group = container.createDiv("dl-day-header dl-day-header--double");
        for (const date of col.dates) {
          let cls = "dl-day-subheader";
          if (date === today) cls += " dl-day-header--today";
          if (date === this.selectedDate) cls += " dl-day-header--selected";
          const cell = group.createDiv(cls);
          cell.setText(shortDayLabel(parseDate(date)));
          cell.addEventListener("click", () => this.openDailyNote(date));
        }
      } else {
        const date = col.dates[0];
        let cls = "dl-day-header";
        if (date === today) cls += " dl-day-header--today";
        if (date === this.selectedDate) cls += " dl-day-header--selected";
        const cell = container.createDiv(cls);
        cell.setText(col.label);
        cell.addEventListener("click", () => this.openDailyNote(date));
      }
    }
  }

  private async openDailyNote(date: string) {
    const path = `${DAILY_NOTES_FOLDER}/${date}.md`;
    let file = this.app.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile)) {
      if (!this.app.vault.getAbstractFileByPath(DAILY_NOTES_FOLDER))
        await this.app.vault.createFolder(DAILY_NOTES_FOLDER);
      file = await this.app.vault.create(path, `# ${date}\n`);
    }
    await openFile(this.app, file as TFile, false);
  }

  private buildBodiesInto(container: HTMLElement, columns: DayColumn[], gridHeight: number, today: string) {
    for (const col of columns) {
      if (col.dates.length === 2) {
        const doubleCol = container.createDiv("dl-day-body dl-day-body--double");
        for (const date of col.dates)
          this.buildDayBody(doubleCol.createDiv("dl-day-body dl-day-body--sub"), date, gridHeight, today);
      } else {
        this.buildDayBody(container.createDiv("dl-day-body"), col.dates[0], gridHeight, today);
      }
    }
  }

  private makeCarouselTrack(viewport: HTMLElement): HTMLElement {
    viewport.addClass("dl-carousel-viewport");
    const track = viewport.createDiv("dl-carousel-track");
    track.createDiv("dl-carousel-panel");
    track.createDiv("dl-carousel-panel");
    track.createDiv("dl-carousel-panel");
    return track;
  }

  private buildTimeGrid(el: HTMLElement) {
    const today = toDateStr(new Date());
    const gridHeight = TOTAL_HOURS * HOUR_PX;

    const grid = el.createDiv("dl-time-grid");

    if (Platform.isMobile) {
      this.carouselTracks = [];
      const colsByOffset = ([-1, 0, 1] as const).map(o => this.getColumnsForOffset(o));

      // ── Header row with carousel ───────────────────────────────
      const headerRow = grid.createDiv("dl-grid-header-row");
      headerRow.createDiv("dl-time-gutter");
      const headerTrack = this.makeCarouselTrack(headerRow.createDiv());
      this.carouselTracks.push(headerTrack);
      for (let i = 0; i < 3; i++) {
        this.buildHeadersInto(headerTrack.children[i] as HTMLElement, colsByOffset[i], today);
      }

      // ── All-day rows (one per panel) ───────────────────────────
      const hasAllDayByOffset = colsByOffset.map(cols =>
        cols.flatMap(c => c.dates).some(d => this.plugin.calendarReader.getAllDayEventsForDate(d).length > 0)
      );
      if (hasAllDayByOffset.some(Boolean)) {
        const alldayRow = grid.createDiv("dl-allday-row");
        alldayRow.createDiv("dl-time-gutter dl-allday-label").setText("ganztägig");
        const alldayTrack = this.makeCarouselTrack(alldayRow.createDiv());
        this.carouselTracks.push(alldayTrack);
        // Calculate max area height across all panels so the row stays stable
        const heights = colsByOffset.map((cols, i) => {
          if (!hasAllDayByOffset[i]) return 20;
          const tmpArea = document.createElement("div");
          return this.buildAllDayAreaInto(tmpArea, cols, cols.flatMap(c => c.dates));
        });
        const maxH = Math.max(...heights);
        const cappedH = Math.min(maxH, ALLDAY_MAX_H);
        for (let i = 0; i < 3; i++) {
          const panel = alldayTrack.children[i] as HTMLElement;
          panel.style.height = `${cappedH}px`;
          const scroll = panel.createDiv("dl-allday-scroll");
          const area = scroll.createDiv("dl-allday-area");
          if (hasAllDayByOffset[i]) {
            const cols = colsByOffset[i];
            this.buildAllDayAreaInto(area, cols, cols.flatMap(c => c.dates));
          } else {
            area.style.height = "20px";
          }
        }
      }

      // ── Body with carousel ─────────────────────────────────────
      const bodyScroll = grid.createDiv("dl-grid-body-scroll");
      const bodyInner = bodyScroll.createDiv("dl-grid-body-inner");

      const gutter = bodyInner.createDiv("dl-time-gutter dl-time-gutter--labels");
      gutter.style.height = `${gridHeight}px`;
      for (let h = DAY_START; h <= DAY_END; h++) {
        const lbl = gutter.createDiv("dl-time-label");
        lbl.style.top = `${(h - DAY_START) * HOUR_PX}px`;
        lbl.setText(`${String(h).padStart(2, "0")}:00`);
      }

      const bodyTrack = this.makeCarouselTrack(bodyInner.createDiv());
      this.carouselTracks.push(bodyTrack);
      for (let i = 0; i < 3; i++) {
        const panel = bodyTrack.children[i] as HTMLElement;
        panel.style.height = `${gridHeight}px`;
        this.buildBodiesInto(panel, colsByOffset[i], gridHeight, today);
      }

      this.setupSwipeGestures(grid, bodyScroll);

    } else {
      // ── Desktop: CSS-Grid — gutter col (fixed) + slide zone (animates) ──
      grid.addClass("dl-time-grid--desktop");
      const columns = this.getColumnsForOffset(0);
      const allDates = columns.flatMap(c => c.dates);
      const hasAllDay = allDates.some(d =>
        this.plugin.calendarReader.getAllDayEventsForDate(d).length > 0
      );

      // Left column: always-visible gutter (not part of the slide animation)
      const gutterCol = grid.createDiv("dl-gutter-col");
      const gutterHeaderSpacer = gutterCol.createDiv("dl-gutter-header-spacer");
      let gutterAlldaySpacer: HTMLElement | null = null;
      if (hasAllDay) {
        gutterAlldaySpacer = gutterCol.createDiv("dl-gutter-allday-spacer dl-allday-label");
        gutterAlldaySpacer.setText("ganztägig");
      }
      const gutterBodyWrap = gutterCol.createDiv("dl-gutter-body-wrap");
      const gutterLabels = gutterBodyWrap.createDiv("dl-time-gutter dl-time-gutter--labels");
      gutterLabels.style.height = `${gridHeight}px`;
      for (let h = DAY_START; h <= DAY_END; h++) {
        const lbl = gutterLabels.createDiv("dl-time-label");
        lbl.style.top = `${(h - DAY_START) * HOUR_PX}px`;
        lbl.setText(`${String(h).padStart(2, "0")}:00`);
      }

      // Right column: content that slides on navigation
      const slideZone = grid.createDiv("dl-slide-zone");
      this.desktopSlideZone = slideZone;

      const headerRow = slideZone.createDiv("dl-grid-header-row");
      this.buildHeadersInto(headerRow, columns, today);

      if (hasAllDay) {
        const alldayScroll = slideZone.createDiv("dl-allday-scroll");
        const alldayArea = alldayScroll.createDiv("dl-allday-area");
        this.buildAllDayAreaInto(alldayArea, columns, allDates);
      }

      const bodyScroll = slideZone.createDiv("dl-grid-body-scroll");
      const bodyInner = bodyScroll.createDiv("dl-grid-body-inner");
      this.buildBodiesInto(bodyInner, columns, gridHeight, today);

      // Sync gutter scroll position with body scroll
      bodyScroll.addEventListener("scroll", () => {
        gutterBodyWrap.scrollTop = bodyScroll.scrollTop;
      }, { passive: true });

      // Match spacer heights to rendered content heights (next frame)
      requestAnimationFrame(() => {
        if (!headerRow.isConnected) return;
        gutterHeaderSpacer.style.height = `${headerRow.offsetHeight}px`;
        if (gutterAlldaySpacer) {
          gutterAlldaySpacer.style.height = `${
            slideZone.querySelector<HTMLElement>(".dl-allday-scroll")?.offsetHeight ?? ALLDAY_MAX_H
          }px`;
        }
        gutterBodyWrap.scrollTop = bodyScroll.scrollTop;
      });
    }

    if (Platform.isMobile && toDateStr(this.anchor) !== today) {
      const fab = grid.createDiv("dl-today-fab");
      fab.innerHTML = todayIconSvg(22);
      fab.addEventListener("click", () => { this.anchor = new Date(); this.render(); });
    }
  }

  private setupSwipeGestures(el: HTMLElement, scrollEl: HTMLElement) {
    const EDGE_ZONE = 60;
    const THRESHOLD = 50;
    let startX = 0, startY = 0;
    let interior = false;
    let claimedH = false;

    const setTracks = (transform: string, transition = "none") => {
      this.carouselTracks.forEach(t => {
        t.style.transition = transition;
        t.style.transform = transform;
      });
    };

    // Centre = -33.333% shows the middle panel
    const CENTER = "translateX(-33.333%)";

    el.addEventListener("touchstart", (e) => {
      const t = e.touches[0];
      startX = t.clientX;
      startY = t.clientY;
      interior = startX >= EDGE_ZONE && startX <= window.innerWidth - EDGE_ZONE;
      claimedH = false;
      setTracks(CENTER); // ensure clean start
    }, { passive: true });

    el.addEventListener("touchmove", (e) => {
      if (!interior || e.touches.length !== 1) return;
      const dx = e.touches[0].clientX - startX;
      const dy = e.touches[0].clientY - startY;
      if (!claimedH && Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy) * 1.5) {
        claimedH = true;
      }
      if (claimedH) {
        e.stopPropagation();
        e.preventDefault();
        // Move tracks: -33.333% + finger offset (track is 300% wide so divide by 3)
        setTracks(`translateX(calc(-33.333% + ${dx}px))`);
      }
    }, { passive: false });

    el.addEventListener("touchend", (e) => {
      if (!interior) return;
      const dx = e.changedTouches[0].clientX - startX;
      if (claimedH && Math.abs(dx) > THRESHOLD) {
        e.stopPropagation();
        const dir = dx < 0 ? 1 : -1; // 1 = forward, -1 = back
        // Animate to adjacent panel
        const target = dir > 0 ? "translateX(-66.666%)" : "translateX(0%)";
        setTracks(target, "transform 280ms cubic-bezier(0.25,0.46,0.45,0.94)");
        setTimeout(() => {
          const savedScroll = scrollEl.scrollTop;
          this.navigate(dir); // triggers render(), builds new carousel at CENTER
          // Restore scroll position in new body
          requestAnimationFrame(() => {
            const newScroll = this.containerEl.querySelector<HTMLElement>(".dl-grid-body-scroll");
            if (newScroll) newScroll.scrollTop = savedScroll;
          });
        }, 280);
      } else {
        // Snap back to centre
        setTracks(CENTER, "transform 220ms cubic-bezier(0.25,0.46,0.45,0.94)");
      }
      interior = false;
      claimedH = false;
    }, { passive: false });
  }

  private buildAllDayAreaInto(area: HTMLElement, columns: DayColumn[], allDates: string[]): number {
    const ROW_H = 18;
    const totalCols = columns.length;

    const dateFrac = new Map<string, { start: number; end: number }>();
    columns.forEach((col, i) => {
      if (col.dates.length === 2) {
        dateFrac.set(col.dates[0], { start: i, end: i + 0.5 });
        dateFrac.set(col.dates[1], { start: i + 0.5, end: i + 1 });
      } else {
        dateFrac.set(col.dates[0], { start: i, end: i + 1 });
      }
    });

    const seen = new Set<string>();
    const items: Array<{ ev: CalendarEvent; fracStart: number; fracEnd: number }> = [];

    for (const date of allDates) {
      for (const ev of this.plugin.calendarReader.getAllDayEventsForDate(date)) {
        if (seen.has(ev.id)) continue;
        seen.add(ev.id);
        const evStart = ev.start.slice(0, 10);
        const evEnd = ev.end.slice(0, 10);
        let fs = totalCols, fe = 0;
        for (const [d, frac] of dateFrac) {
          if (d >= evStart && d <= evEnd) {
            fs = Math.min(fs, frac.start);
            fe = Math.max(fe, frac.end);
          }
        }
        if (fs < fe) items.push({ ev, fracStart: fs, fracEnd: fe });
      }
    }

    items.sort((a, b) => a.fracStart - b.fracStart || b.fracEnd - b.fracStart - (a.fracEnd - a.fracStart));

    const rowEnds: number[] = [];
    const rowOf = items.map(({ fracStart, fracEnd }) => {
      let row = rowEnds.findIndex((end) => end <= fracStart);
      if (row === -1) { row = rowEnds.length; rowEnds.push(fracEnd); }
      else rowEnds[row] = fracEnd;
      return row;
    });

    const areaH = rowEnds.length * ROW_H + 2;
    area.style.height = `${areaH}px`;

    for (let i = 0; i < totalCols; i++) {
      const sep = area.createDiv("dl-allday-col-sep");
      sep.style.left = `${(i / totalCols) * 100}%`;
    }

    for (let i = 0; i < items.length; i++) {
      const { ev, fracStart, fracEnd } = items[i];
      const row = rowOf[i];
      const chip = area.createDiv("dl-allday-chip");
      chip.addEventListener("mouseenter", (e) => this.showHoverPopover(e, ev));
      chip.addEventListener("mouseleave", () => this.hideHoverPopover());
      if (ev.id === this.selectedEventId) chip.addClass("dl-allday-chip--selected");
      else if (this.selectedSeriesTitle && ev.title === this.selectedSeriesTitle) chip.addClass("dl-allday-chip--series");
      if (ev.isRecurring) chip.addClass("dl-allday-chip--recurring");
      if (ev.isCancelled) chip.addClass("dl-allday-chip--cancelled");
      chip.style.left = `calc(${(fracStart / totalCols) * 100}% + 3px)`;
      chip.style.top = `${row * ROW_H + 2}px`;
      chip.style.width = `calc(${((fracEnd - fracStart) / totalCols) * 100}% - 6px)`;
      chip.setText(ev.title);
      chip.addEventListener("click", (e) => this.openEvent(ev, e.metaKey || e.ctrlKey));
      chip.addEventListener("contextmenu", (e) => this.showEventContextMenu(e, ev, ev.start.slice(0, 10)));
    }

    return areaH;
  }

  private buildAllDayRowSpanning(grid: HTMLElement, columns: DayColumn[], allDates: string[]) {
    const allDayRow = grid.createDiv("dl-allday-row");
    allDayRow.createDiv("dl-time-gutter dl-allday-label").setText("ganztägig");
    const scroll = allDayRow.createDiv("dl-allday-scroll");
    const area = scroll.createDiv("dl-allday-area");
    this.buildAllDayAreaInto(area, columns, allDates);
  }

  private buildDayBody(
    el: HTMLElement,
    date: string,
    gridHeight: number,
    today: string,
  ) {
    el.dataset.date = date;
    if (date === today) el.addClass("dl-day-body--today");
    if (date === this.selectedDate) el.addClass("dl-day-body--selected");
    el.style.height = `${gridHeight}px`;

    for (let h = 0; h < TOTAL_HOURS; h++) {
      const line = el.createDiv("dl-hour-line");
      line.style.top = `${h * HOUR_PX}px`;
      const half = el.createDiv("dl-hour-line dl-hour-line--half");
      half.style.top = `${h * HOUR_PX + HOUR_PX / 2}px`;
    }

    if (date === today) {
      const now = new Date();
      const topPx =
        (((now.getHours() - DAY_START) * 60 + now.getMinutes()) / 60) * HOUR_PX;
      if (topPx >= 0 && topPx <= gridHeight) {
        const nowLine = el.createDiv("dl-now-line");
        nowLine.style.top = `${topPx}px`;
        nowLine.createDiv("dl-now-dot");
      }
    }

    for (const layout of assignColumns(
      this.plugin.calendarReader.getEventsForDate(date),
    )) {
      this.buildEventCard(el, layout.event, layout.col, layout.totalCols, date);
    }

    if (!Platform.isMobile)
      el.addEventListener("mousedown", (e) => this.onDayMouseDown(e, el, date));
  }

  private buildEventCard(
    container: HTMLElement,
    event: CalendarEvent,
    col: number,
    totalCols: number,
    date: string,
  ) {
    const gridBottom = TOTAL_HOURS * HOUR_PX;
    const rawTop = topFromISO(event.start);
    const rawBottom = rawTop + heightFromISO(event.start, event.end);

    if (rawBottom <= 0 || rawTop >= gridBottom) return;

    const topPx = Math.max(0, rawTop) + 1;
    const heightPx = Math.min(gridBottom, rawBottom) - topPx - 1;

    const card = container.createDiv("dl-event-card");
    card.addEventListener("mouseenter", (e) => this.showHoverPopover(e, event));
    card.addEventListener("mouseleave", () => this.hideHoverPopover());
    card.addEventListener("mousedown", () => this.hideHoverPopover());
    if (event.id === this.selectedEventId)
      card.addClass("dl-event-card--selected");
    else if (
      this.selectedSeriesTitle &&
      event.title === this.selectedSeriesTitle
    )
      card.addClass("dl-event-card--series");
    const noteFile = this.noteCache.get(event.id) ?? null;
    if (noteFile) card.addClass("dl-event-card--has-note");
    if (event.isRecurring) card.addClass("dl-event-card--recurring");
    if (event.isCancelled) card.addClass("dl-event-card--cancelled");
    if ((event as any)._continuesBefore)
      card.addClass("dl-event-card--continues-before");
    if ((event as any)._continuesAfter)
      card.addClass("dl-event-card--continues-after");

    const pct = (n: number) => `${(n * 100).toFixed(2)}%`;
    card.style.top = `${topPx}px`;
    card.style.height = `${heightPx}px`;
    card.style.left = `calc(${pct(col / totalCols)} + 1px)`;
    card.style.width = `calc(${pct(1 / totalCols)} - 3px)`;

    if (noteFile) card.createDiv("dl-event-note-dot");

    const short = heightPx < 30;

    if (!short) {
      const timeRow = card.createDiv("dl-event-time-row");
      timeRow.createSpan({
        cls: "dl-event-time",
        text: toTimeStr(event.start),
      });
      if (event.isRecurring)
        timeRow.createSpan({ cls: "dl-event-recurring-icon", text: "↻" });
    }

    card.createDiv({ cls: "dl-event-title", text: event.title });
    if (heightPx > 42) {
      const isTeamsCard =
        event.meetingPlatform?.toLowerCase().includes("teams") ||
        event.location?.toLowerCase().includes("teams");
      if (isTeamsCard) {
        const loc = card.createDiv({ cls: "dl-event-location dl-event-location--teams" });
        loc.innerHTML = teamsIconSvg(11);
      } else if (event.location) {
        card.createDiv({ cls: "dl-event-location", text: event.location });
      }
    }

    if (noteFile) {
      const fm = this.app.metadataCache.getFileCache(noteFile)?.frontmatter;
      if (fm?.toBeRemoved)
        card.createDiv({
          cls: "dl-event-removal-hint",
          text: `⏱ ${fm.removalDate ?? ""}`,
        });
    }

    const canEdit =
      event.isOrganizer && !event.isCancelled && !Platform.isMobile;

    card.addEventListener("contextmenu", (e) => {
      e.stopPropagation();
      this.showEventContextMenu(e, event, date);
    });

    if (canEdit) {
      // Resize handle at bottom edge
      const resizeHandle = card.createDiv("dl-resize-handle");
      resizeHandle.addEventListener("mousedown", (e) => {
        e.stopPropagation();
        this.onResizeMouseDown(e, event, date, card);
      });

      // Drag-to-move: track drag vs click
      let wasDrag = false;
      card.addEventListener("mousedown", (e) => {
        if (e.button !== 0) return;
        if ((e.target as HTMLElement).closest(".dl-resize-handle")) return;
        e.stopPropagation();
        wasDrag = false;
        this.onEventMoveMouseDown(e, event, date, card, () => {
          wasDrag = true;
        });
      });
      card.addEventListener("click", (e) => {
        e.stopPropagation();
        if (wasDrag) {
          wasDrag = false;
          return;
        }
        this.openEvent(event, e.metaKey || e.ctrlKey);
      });
    } else {
      card.addEventListener("click", (e) => {
        e.stopPropagation();
        this.openEvent(event, e.metaKey || e.ctrlKey);
      });
    }
  }

  // ── Drag-to-create ───────────────────────────────────────────────

  private onDayMouseDown(e: MouseEvent, dayEl: HTMLElement, date: string) {
    if (e.button !== 0) return;
    if ((e.target as HTMLElement).closest(".dl-event-card")) return;
    e.preventDefault();

    const rect = dayEl.getBoundingClientRect();
    const startMin = Math.max(
      0,
      Math.min(23 * 60, snapMins(((e.clientY - rect.top) / HOUR_PX) * 60)),
    );
    let endMin = Math.min(24 * 60, startMin + 30);

    const ghost = dayEl.createDiv("dl-ghost-event");
    this.refreshGhost(ghost, startMin, endMin);

    const onMove = (ev: MouseEvent) => {
      const rawMins = snapMins(
        ((ev.clientY - dayEl.getBoundingClientRect().top) / HOUR_PX) * 60,
      );
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
    ghost.style.top = `${(startMin / 60) * HOUR_PX}px`;
    ghost.style.height = `${Math.max(14, ((endMin - startMin) / 60) * HOUR_PX)}px`;
    ghost.textContent = `${minsToTimeStr(startMin)} – ${minsToTimeStr(endMin)}`;
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

  private showCreatePopover(
    date: string,
    startMin: number,
    endMin: number,
    e: MouseEvent,
  ) {
    this.containerEl.querySelector(".dl-create-popover")?.remove();

    const popover = document.body.createDiv("dl-create-popover");

    popover.createDiv({
      cls: "dl-create-time",
      text: `${minsToTimeStr(startMin)} – ${minsToTimeStr(endMin)}`,
    });

    const input = popover.createEl("input", {
      type: "text",
      cls: "dl-create-input",
      placeholder: "Titel eingeben…",
    } as any) as HTMLInputElement;

    const actions = popover.createDiv("dl-create-actions");

    const confirm = async () => {
      const title = input.value.trim();
      if (!title) {
        input.focus();
        return;
      }
      popover.remove();
      try {
        await this.plugin.calendarReader.createEvent({
          title,
          start: minsToISO(date, startMin),
          end: minsToISO(date, endMin),
        });
      } catch (err: any) {
        new Notice(`Fehler beim Erstellen: ${err?.message ?? err}`);
      }
    };
    const cancel = () => popover.remove();

    const createBtn = actions.createEl("button", {
      cls: "dl-create-btn dl-create-btn--primary",
      text: "Erstellen",
    });
    const cancelBtn = actions.createEl("button", {
      cls: "dl-create-btn",
      text: "Abbrechen",
    });

    // Prevent input blur when clicking buttons
    createBtn.addEventListener("mousedown", (ev) => ev.preventDefault());
    cancelBtn.addEventListener("mousedown", (ev) => ev.preventDefault());
    createBtn.addEventListener("click", confirm);
    cancelBtn.addEventListener("click", cancel);

    input.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter") {
        ev.preventDefault();
        confirm();
      }
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
    popover.style.top = `${e.clientY - 24}px`;
    setTimeout(() => {
      const r = popover.getBoundingClientRect();
      if (r.right > window.innerWidth - 8)
        popover.style.left = `${e.clientX - r.width - 12}px`;
      if (r.bottom > window.innerHeight - 8)
        popover.style.top = `${window.innerHeight - r.height - 8}px`;
      input.focus();
    }, 0);
  }

  // ── Drag-to-move / Drag-to-resize ───────────────────────────────

  private findDayBodyAt(
    x: number,
    y: number,
  ): { el: HTMLElement; date: string } | null {
    for (const el of document.elementsFromPoint(x, y)) {
      const h = el as HTMLElement;
      if (h.dataset?.date && h.classList.contains("dl-day-body"))
        return { el: h, date: h.dataset.date };
    }
    return null;
  }

  private onEventMoveMouseDown(
    e: MouseEvent,
    event: CalendarEvent,
    date: string,
    cardEl: HTMLElement,
    onDragStart: () => void,
  ) {
    const startX = e.clientX,
      startY = e.clientY;
    const cardRect = cardEl.getBoundingClientRect();
    const clickOffsetMins = Math.round(
      ((e.clientY - cardRect.top) / HOUR_PX) * 60,
    );
    const durationMins = Math.round(
      (new Date(event.end).getTime() - new Date(event.start).getTime()) / 60000,
    );

    const ghost = document.body.createDiv("dl-drag-ghost");
    ghost.style.cssText = `width:${cardRect.width}px;height:${cardRect.height}px;left:${cardRect.left}px;top:${cardRect.top}px;display:none`;
    ghost.createDiv({ cls: "dl-event-title", text: event.title });

    const landing = document.createElement("div");
    landing.className = "dl-landing-ghost";
    landing.style.height = `${Math.max(20, (durationMins / 60) * HOUR_PX)}px`;

    let dragging = false;
    let targetDate: string | null = null;
    let targetStartMins = 0;

    const onMove = (ev: MouseEvent) => {
      if (!dragging) {
        const dx = ev.clientX - startX,
          dy = ev.clientY - startY;
        if (dx * dx + dy * dy < 25) return;
        dragging = true;
        document.body.style.userSelect = "none";
        ghost.style.display = "block";
        onDragStart();
      }
      ghost.style.left = `${ev.clientX - cardRect.width / 2}px`;
      ghost.style.top = `${ev.clientY - (clickOffsetMins / 60) * HOUR_PX}px`;

      const hit = this.findDayBodyAt(ev.clientX, ev.clientY);
      if (hit) {
        const dayRect = hit.el.getBoundingClientRect();
        const rawMins =
          ((ev.clientY - dayRect.top) / HOUR_PX) * 60 - clickOffsetMins;
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
      const origStartMins =
        new Date(event.start).getHours() * 60 +
        new Date(event.start).getMinutes();
      if (targetDate === origDate && targetStartMins === origStartMins) return;

      try {
        await this.plugin.calendarReader.moveEvent(
          event.id,
          minsToISO(targetDate, targetStartMins),
          minsToISO(targetDate, targetStartMins + durationMins),
        );
      } catch (err: any) {
        new Notice(`Fehler beim Verschieben: ${err?.message ?? err}`);
      }
    };

    this.dragMove = { ghost, landing, onMove, onUp };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }

  private onResizeMouseDown(
    e: MouseEvent,
    event: CalendarEvent,
    date: string,
    cardEl: HTMLElement,
  ) {
    if (e.button !== 0) return;
    e.preventDefault();

    const startMins =
      new Date(event.start).getHours() * 60 +
      new Date(event.start).getMinutes();
    let endMins =
      new Date(event.end).getHours() * 60 + new Date(event.end).getMinutes();
    const dayBody = cardEl.closest<HTMLElement>(".dl-day-body");
    const origH = cardEl.offsetHeight;

    const onMove = (ev: MouseEvent) => {
      if (!dayBody) return;
      const dayRect = dayBody.getBoundingClientRect();
      const rawMins = ((ev.clientY - dayRect.top) / HOUR_PX) * 60;
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

      const origEndMins =
        new Date(event.end).getHours() * 60 + new Date(event.end).getMinutes();
      if (endMins === origEndMins) return;

      try {
        await this.plugin.calendarReader.moveEvent(
          event.id,
          minsToISO(date, startMins),
          minsToISO(date, endMins),
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
    const year = this.anchor.getFullYear();
    const month = this.anchor.getMonth();
    const monthNames = [
      "Jan",
      "Feb",
      "Mär",
      "Apr",
      "Mai",
      "Jun",
      "Jul",
      "Aug",
      "Sep",
      "Okt",
      "Nov",
      "Dez",
    ];

    const mini = container.createDiv("dl-mini-month");
    mini.createDiv({
      cls: "dl-mini-month-header",
      text: `${monthNames[month]} ${year}`,
    });

    const grid = mini.createDiv("dl-mini-month-grid");

    // Header row: KW label + day-of-week labels
    grid.createDiv({ cls: "dl-mini-dow dl-mini-kw-header", text: "KW" });
    for (const d of ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"])
      grid.createDiv({ cls: "dl-mini-dow", text: d });

    const firstDow = new Date(year, month, 1).getDay();
    const leadingEmpty = firstDow === 0 ? 6 : firstDow - 1;
    const totalDays = new Date(year, month + 1, 0).getDate();
    const totalRows = Math.ceil((leadingEmpty + totalDays) / 7);
    const today = toDateStr(new Date());
    const anchorStr = toDateStr(this.anchor);

    for (let row = 0; row < totalRows; row++) {
      // KW: use the first real day in this row
      let kwDate: Date | null = null;
      for (let col = 0; col < 7; col++) {
        const dayNum = row * 7 + col - leadingEmpty + 1;
        if (dayNum >= 1 && dayNum <= totalDays) {
          kwDate = new Date(year, month, dayNum);
          break;
        }
      }
      const kwCell = grid.createDiv("dl-mini-kw");
      if (kwDate) kwCell.setText(String(getWeekNumber(kwDate)));

      for (let col = 0; col < 7; col++) {
        const dayNum = row * 7 + col - leadingEmpty + 1;
        if (dayNum < 1 || dayNum > totalDays) {
          grid.createDiv("dl-mini-day--empty");
          continue;
        }

        const date = new Date(year, month, dayNum);
        const dateStr = toDateStr(date);
        const cell = grid.createDiv("dl-mini-day");
        cell.setText(String(dayNum));

        const hasEvent =
          this.plugin.calendarReader.getEventsForDate(dateStr).length > 0 ||
          this.plugin.calendarReader.getAllDayEventsForDate(dateStr).length > 0;

        if (hasEvent) cell.addClass("dl-mini-day--has-event");
        if (dateStr === anchorStr) cell.addClass("dl-mini-day--anchor");
        if (dateStr === today) cell.addClass("dl-mini-day--today");

        cell.addEventListener("click", () => {
          const dir = date > this.anchor ? 1 : -1;
          this.anchor = date;
          this.animatedRender(dir);
        });
      }
    }
  }

  // ── Now-line tick ────────────────────────────────────────────────

  private tickNowLine() {
    const now = new Date();
    const topPx =
      (((now.getHours() - DAY_START) * 60 + now.getMinutes()) / 60) * HOUR_PX;
    const root = this.containerEl.children[1] as HTMLElement;
    root.querySelectorAll<HTMLElement>(".dl-now-line").forEach((el) => {
      el.style.top = `${topPx}px`;
    });
  }

  // ── Hover popover ────────────────────────────────────────────────

  private showHoverPopover(e: MouseEvent, event: CalendarEvent) {
    if (this.hoverTimer !== null) window.clearTimeout(this.hoverTimer);
    this.hoverTimer = window.setTimeout(() => {
      this.hoverTimer = null;
      this.hideHoverPopover();

      const el = document.body.createDiv("dl-hover-popover");
      this.hoverEl = el;

      el.createDiv({ cls: "dl-hover-title", text: event.title });

      const timeStr = event.isAllDay
        ? "Ganztägig"
        : `${toTimeStr(event.start)} – ${toTimeStr(event.end)}`;
      el.createDiv({ cls: "dl-hover-meta", text: timeStr });

      const isTeams =
        event.meetingPlatform?.toLowerCase().includes("teams") ||
        event.location?.toLowerCase().includes("teams");

      if (isTeams) {
        const row = el.createDiv({ cls: "dl-hover-meta dl-hover-teams" });
        row.innerHTML = teamsIconSvg(14) + `<span style="margin-left:4px">Microsoft Teams</span>`;
      } else if (event.location) {
        el.createDiv({ cls: "dl-hover-meta", text: event.location });
      }

      if (event.calendar)
        el.createDiv({ cls: "dl-hover-meta dl-hover-calendar", text: event.calendar });
      if ((event.numAttendees ?? 0) > 1)
        el.createDiv({ cls: "dl-hover-meta", text: `${event.numAttendees} Teilnehmer` });
      if (!isTeams && event.meetingPlatform)
        el.createDiv({ cls: "dl-hover-meta", text: event.meetingPlatform });
      if (this.noteCache.has(event.id))
        el.createDiv({ cls: "dl-hover-meta dl-hover-note", text: "Notiz verknüpft" });

      el.style.left = `${e.clientX + 14}px`;
      el.style.top = `${e.clientY - 12}px`;

      requestAnimationFrame(() => {
        const r = el.getBoundingClientRect();
        if (r.right > window.innerWidth - 8)
          el.style.left = `${e.clientX - r.width - 14}px`;
        if (r.bottom > window.innerHeight - 8)
          el.style.top = `${window.innerHeight - r.height - 8}px`;
      });
    }, 350);
  }

  private hideHoverPopover() {
    if (this.hoverTimer !== null) {
      window.clearTimeout(this.hoverTimer);
      this.hoverTimer = null;
    }
    if (this.hoverEl) {
      this.hoverEl.remove();
      this.hoverEl = null;
    }
  }

  // ── Context menu ────────────────────────────────────────────────

  private showEventContextMenu(e: MouseEvent, event: CalendarEvent, date: string) {
    e.preventDefault();
    const menu = new Menu();
    const label = event.isOrganizer ? "Termin löschen" : "Einladung ablehnen";

    if (event.isRecurring) {
      menu.addItem((item) =>
        item
          .setTitle(`${label} (nur dieser Termin)`)
          .setIcon("x")
          .onClick(async () => {
            try {
              await this.plugin.calendarReader.cancelEvent(event.id, "this");
            } catch (err: any) {
              new Notice(`Fehler: ${err?.message ?? err}`);
            }
          }),
      );
      menu.addItem((item) =>
        item
          .setTitle(`${label} (dieser und alle folgenden)`)
          .setIcon("x-circle")
          .onClick(async () => {
            try {
              await this.plugin.calendarReader.cancelEvent(event.id, "future");
            } catch (err: any) {
              new Notice(`Fehler: ${err?.message ?? err}`);
            }
          }),
      );
    } else {
      menu.addItem((item) =>
        item
          .setTitle(label)
          .setIcon("x")
          .onClick(async () => {
            try {
              await this.plugin.calendarReader.cancelEvent(event.id);
            } catch (err: any) {
              new Notice(`Fehler: ${err?.message ?? err}`);
            }
          }),
      );
    }

    menu.showAtMouseEvent(e);
  }

  // ── Note opening ────────────────────────────────────────────────

  private async openEvent(event: CalendarEvent, modifier = false) {
    this.applySelection(event);
    this.render();
    const { file, isNew } = await this.plugin.noteManager.openOrCreate(event);
    await openFile(this.app, file, modifier);
    if (isNew)
      setTimeout(() => {
        const editor = this.app.workspace.getActiveViewOfType(MarkdownView)
          ?.editor as any;
        editor?.fold?.({ line: 0, ch: 0 });
      }, 100);
  }
}
