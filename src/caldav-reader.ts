import { Notice } from "obsidian";
import type { CalendarEvent, EventUpdate } from "./types";
import { getEventsForDate, getAllDayEventsForDate } from "./event-filter";
import { CalDAVClient, type CalDAVCalendar } from "./caldav-client";
import { parseICalendar, buildVEvent, updateVEventTimes, updateVEvent } from "./ical-parser";

const POLL_MS = 5 * 60 * 1000; // 5 minutes
const DAYS_BACK = 90;
const DAYS_FORWARD = 365;

export class CalDAVReader {
  private client: CalDAVClient;
  private principalPath: string;
  private baseUrl: string;
  private events: CalendarEvent[] = [];
  private loadError: string | null = null;
  private cacheDate: string | null = null;
  private watchers: Array<() => void> = [];
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private calendars: CalDAVCalendar[] = [];
  selectedCalendars: string[] = []; // hrefs; leer = alle
  // uid → absolute href, populated during fetch
  private hrefMap = new Map<string, string>();
  private calendarHrefMap = new Map<string, string>();
  private initialLoaded = false;
  private saveCache: ((events: CalendarEvent[], date: string) => Promise<void>) | null = null;
  private loadCacheFn: (() => Promise<{ events: CalendarEvent[]; date: string | null }>) | null = null;

  constructor(baseUrl: string, username: string, password: string) {
    this.baseUrl = baseUrl;
    this.client = new CalDAVClient(baseUrl, username, password);
    this.principalPath = `/dav/principals/user/${encodeURIComponent(username)}/`;
  }

  updateCredentials(baseUrl: string, username: string, password: string): void {
    this.baseUrl = baseUrl;
    this.client = new CalDAVClient(baseUrl, username, password);
    this.principalPath = `/dav/principals/user/${encodeURIComponent(username)}/`;
    this.calendars = [];
    this.hrefMap.clear();
    this.calendarHrefMap.clear();
  }

  // ── CalendarReader-compatible interface ───────────────────────

  setBinaryPath(_path: string): void { /* no-op for interface compatibility */ }
  getPath(): string { return this.baseUrl; }

  setCacheCallbacks(
    save: (events: CalendarEvent[], date: string) => Promise<void>,
    load: () => Promise<{ events: CalendarEvent[]; date: string | null }>,
  ): void {
    this.saveCache = save;
    this.loadCacheFn = load;
  }

  getEvents(): CalendarEvent[] { return this.events; }
  getLoadError(): string | null { return this.loadError; }
  getCacheDate(): string | null { return this.cacheDate; }

  getEventsForDate(date: string): CalendarEvent[] {
    return getEventsForDate(this.events, date);
  }

  getAllDayEventsForDate(date: string): CalendarEvent[] {
    return getAllDayEventsForDate(this.events, date);
  }

  onChange(fn: () => void): () => void {
    this.watchers.push(fn);
    return () => { this.watchers = this.watchers.filter(w => w !== fn); };
  }

  // ── Lifecycle ─────────────────────────────────────────────────

  async load(): Promise<void> {
    await this.tryLoadCache();
    await this.fetchAll();
  }

  startWatching(): void {
    this.stopWatching();
    this.pollTimer = setInterval(() => this.fetchAll(), POLL_MS);
  }

  stopWatching(): void {
    if (this.pollTimer !== null) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  refresh(): void {
    void this.fetchAll();
  }

  // ── Core fetch ────────────────────────────────────────────────

  private async fetchAll(): Promise<void> {
    try {
      if (this.calendars.length === 0) {
        this.calendars = await this.client.discoverCalendars(this.principalPath);
      }

      const selected = this.selectedCalendars;
      const active = selected.length > 0
        ? this.calendars.filter(c => selected.includes(c.href))
        : this.calendars;

      const now = new Date();
      const from = new Date(now);
      from.setDate(from.getDate() - DAYS_BACK);
      const to = new Date(now);
      to.setDate(to.getDate() + DAYS_FORWARD);

      const allEvents: CalendarEvent[] = [];
      this.hrefMap.clear();
      this.calendarHrefMap.clear();

      const skipped: string[] = [];
      for (const calendar of active) {
        try {
          const results = await this.client.fetchEvents(calendar.href, from, to);
          for (const { href, ical } of results) {
            const parsed = parseICalendar(ical, calendar.displayName);
            for (const ev of parsed) {
              allEvents.push(ev);
              this.hrefMap.set(ev.id, href);
              this.calendarHrefMap.set(ev.id, calendar.href);
            }
          }
        } catch (err) {
          skipped.push(`${calendar.displayName} (${(err as Error).message})`);
          console.warn(`[Deskleaf] Kalender übersprungen (${calendar.displayName}):`, (err as Error).message);
        }
      }

      this.events = allEvents;
      this.loadError = skipped.length > 0 && allEvents.length === 0
        ? `Alle Kalender fehlerhaft: ${skipped.join("; ")}`
        : null;
      this.cacheDate = new Date().toISOString();
      if (this.saveCache) await this.saveCache(allEvents, this.cacheDate);

      if (!this.initialLoaded) {
        new Notice(`Deskleaf: ${allEvents.length} Events geladen`, 2000);
        this.initialLoaded = true;
      }
      console.log(`[Deskleaf] ${allEvents.length} CalDAV events loaded`);
      this.notify();
    } catch (err) {
      this.loadError = `CalDAV: ${(err as Error).message}`;
      console.error("[Deskleaf] CalDAV fetch error:", err);
      this.notify();
    }
  }

  private async tryLoadCache(): Promise<void> {
    if (!this.loadCacheFn) return;
    const cached = await this.loadCacheFn();
    if (cached.events.length > 0) {
      this.events = cached.events;
      this.cacheDate = cached.date;
      this.notify();
    }
  }

  private notify(): void { for (const w of this.watchers) w(); }

  // ── Write operations ──────────────────────────────────────────

  async createEvent(params: {
    title: string;
    start: string;
    end: string;
    calendar?: string;
    notes?: string;
    location?: string;
  }): Promise<string> {
    const calendar = this.resolveCalendar(params.calendar);
    const uid = crypto.randomUUID();
    const ical = buildVEvent({
      uid,
      summary: params.title,
      dtstart: params.start,
      dtend: params.end,
      description: params.notes,
      location: params.location,
    });
    const href = this.client.hrefForEvent(calendar.href, uid);
    await this.client.putEvent(href, ical, true);
    await this.fetchAll();
    return uid;
  }

  async moveEvent(id: string, newStart: string, newEnd: string): Promise<void> {
    const href = this.requireHref(id);
    const ical = await this.client.getEvent(href);
    const updated = updateVEventTimes(ical, newStart, newEnd);
    await this.client.putEvent(href, updated, false);
    await this.fetchAll();
  }

  async updateEvent(id: string, update: EventUpdate): Promise<void> {
    const href = this.requireHref(id);
    const currentIcal = await this.client.getEvent(href);
    if (update.span === "series" && currentIcal.includes("RECURRENCE-ID")) {
      throw new Error("Serienbearbeitung ist für diese CalDAV-Instanz nicht eindeutig möglich");
    }

    const updatedIcal = updateVEvent(currentIcal, update);
    const targetCalendar = this.resolveCalendar(update.calendar);
    const currentCalendarHref = this.calendarHrefMap.get(id);
    const uid = this.uidFromId(id);
    const targetHref = this.client.hrefForEvent(targetCalendar.href, uid);

    if (!currentCalendarHref || currentCalendarHref === targetCalendar.href) {
      await this.client.putEvent(href, updatedIcal, false);
    } else {
      await this.client.putEvent(targetHref, updatedIcal, true);
      await this.client.deleteEvent(href);
    }
    await this.fetchAll();
  }

  async cancelEvent(id: string, _span: "this" | "future" = "this"): Promise<void> {
    const href = this.requireHref(id);
    await this.client.deleteEvent(href);
    await this.fetchAll();
  }

  // ── Helpers ───────────────────────────────────────────────────

  private resolveCalendar(name?: string): CalDAVCalendar {
    const cal = name
      ? (this.calendars.find(c => c.displayName === name) ?? this.calendars[0])
      : this.calendars[0];
    if (!cal) throw new Error("Kein Kalender konfiguriert");
    return cal;
  }

  private requireHref(id: string): string {
    const href = this.hrefMap.get(id);
    if (!href) throw new Error(`Event ${id} nicht gefunden`);
    return href;
  }

  private uidFromId(id: string): string {
    return id.includes("_") ? id.slice(0, id.indexOf("_")) : id;
  }
}
