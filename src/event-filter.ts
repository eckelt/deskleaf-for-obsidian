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
