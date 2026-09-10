import type { CalendarEvent } from "./types";

export function getEventsForDate(events: CalendarEvent[], date: string): CalendarEvent[] {
  const result: CalendarEvent[] = [];
  for (const e of events) {
    if (e.isAllDay) continue;
    const startDate = e.start.slice(0, 10);
    const endDate   = e.end.slice(0, 10);
    if (startDate > date || endDate < date) continue;
    if (startDate === date && endDate === date) { result.push(e); continue; }
    const sliceStart = startDate === date ? e.start : `${date}T00:00:00`;
    const sliceEnd   = endDate   === date ? e.end   : `${date}T23:59:59`;
    result.push({ ...e, start: sliceStart, end: sliceEnd,
      _continuesAfter: endDate > date, _continuesBefore: startDate < date } as any);
  }
  return result;
}

export function getAllDayEventsForDate(events: CalendarEvent[], date: string): CalendarEvent[] {
  return events.filter((e) => {
    if (!e.isAllDay) return false;
    const s  = e.start.slice(0, 10);
    const en = e.end.slice(0, 10);
    return s <= date && date <= en;
  });
}

/**
 * Merges the primary event source with a reminders-only source (see ADR 3). Only
 * `isReminder` objects are taken from the second source — defensive against a future
 * change to the reminders-only binary mode that starts emitting `EKEvent` data — and
 * primary events always win on id collisions.
 */
export function mergeReminderEvents(
  primaryEvents: CalendarEvent[],
  reminderSourceEvents: CalendarEvent[],
): CalendarEvent[] {
  const primaryIds = new Set(primaryEvents.map((e) => e.id));
  const reminders = reminderSourceEvents.filter((e) => e.isReminder && !primaryIds.has(e.id));
  return [...primaryEvents, ...reminders];
}
