import type { CalendarEvent, EventUpdate, RsvpResponse } from "./types";
import { CalendarReader } from "./calendar-reader";
import { CalDAVReader } from "./caldav-reader";
import { getEventsForDate, getAllDayEventsForDate, mergeReminderEvents } from "./event-filter";

/**
 * Coexistence reader for ADR 3: CalDAV stays the sole event source, while a second,
 * reminders-only binary process (macOS desktop only) contributes `isReminder` tiles on
 * top. Write methods delegate exclusively to the primary CalDAV reader — reminders stay
 * read-only (AC7). Implements the same reader interface consumed by calendar-view.ts /
 * sidebar-view.ts / note-manager.ts, so the view layer never learns two sources exist.
 */
export class CompositeCalendarReader {
  constructor(private readonly primary: CalDAVReader, private readonly reminders: CalendarReader) {
    // A failed reminders-only process must never surface as an event-calendar error (AC11).
    this.reminders.onChange(() => {
      const err = this.reminders.getLoadError();
      if (err) console.warn("[Deskleaf] Reminders (reminders-only process):", err);
    });
  }

  // ── CalendarReader-compatible interface ───────────────────────

  get selectedCalendars(): string[] { return this.primary.selectedCalendars; }
  set selectedCalendars(value: string[]) { this.primary.selectedCalendars = value; }

  getPath(): string { return this.primary.getPath(); }
  setBinaryPath(path: string): void { this.reminders.setBinaryPath(path); }

  setCacheCallbacks(
    save: (events: CalendarEvent[], date: string) => Promise<void>,
    load: () => Promise<{ events: CalendarEvent[]; date: string | null }>,
  ): void {
    this.primary.setCacheCallbacks(save, load);
  }

  getEvents(): CalendarEvent[] {
    return mergeReminderEvents(this.primary.getEvents(), this.reminders.getEvents());
  }

  getEventsForDate(date: string): CalendarEvent[] {
    return getEventsForDate(this.getEvents(), date);
  }

  getAllDayEventsForDate(date: string): CalendarEvent[] {
    return getAllDayEventsForDate(this.getEvents(), date);
  }

  getLoadError(): string | null { return this.primary.getLoadError(); }
  getCacheDate(): string | null { return this.primary.getCacheDate(); }
  getEventUrl(id: string): string | null { return this.primary.getEventUrl(id); }

  onChange(fn: () => void): () => void {
    const unsubPrimary = this.primary.onChange(fn);
    const unsubReminders = this.reminders.onChange(fn);
    return () => { unsubPrimary(); unsubReminders(); };
  }

  // ── Lifecycle ─────────────────────────────────────────────────

  async load(): Promise<void> {
    await Promise.all([this.primary.load(), this.reminders.load()]);
  }

  startWatching(): void {
    this.primary.startWatching();
    this.reminders.startWatching();
  }

  stopWatching(): void {
    this.primary.stopWatching();
    this.reminders.stopWatching();
  }

  updateCredentials(baseUrl: string, username: string, password: string): void {
    this.primary.updateCredentials(baseUrl, username, password);
  }

  refresh(): void { this.primary.refresh(); }

  // ── Write operations — delegate to the primary CalDAV reader only (AC7) ────

  async createEvent(params: {
    title: string;
    start: string;
    end: string;
    calendar?: string;
    notes?: string;
    location?: string;
  }): Promise<string> {
    return this.primary.createEvent(params);
  }

  async moveEvent(id: string, newStart: string, newEnd: string): Promise<void> {
    return this.primary.moveEvent(id, newStart, newEnd);
  }

  async updateEvent(id: string, update: EventUpdate): Promise<void> {
    return this.primary.updateEvent(id, update);
  }

  async cancelEvent(id: string, span: "this" | "future" = "this"): Promise<void> {
    return this.primary.cancelEvent(id, span);
  }

  async updateRsvp(id: string, response: RsvpResponse): Promise<void> {
    return this.primary.updateRsvp(id, response);
  }
}
