import type { CalendarEvent } from "./types";

export const DEFAULT_HOUR_PX = 64;
export const HOUR_PX = DEFAULT_HOUR_PX;
const DAY_START = 0;
const TOTAL_HOURS = 24;
const MIN_VISIBLE_HOURS = 4;

export interface EventLayout {
  event: CalendarEvent;
  col: number;
  totalCols: number;
}

export function topFromISO(iso: string, hourPx: number = DEFAULT_HOUR_PX): number {
  const d = new Date(iso);
  return (((d.getHours() - DAY_START) * 60 + d.getMinutes()) / 60) * hourPx;
}

export function heightFromISO(
  start: string,
  end: string,
  hourPx: number = DEFAULT_HOUR_PX,
): number {
  const mins = (new Date(end).getTime() - new Date(start).getTime()) / 60000;
  return Math.max(20, (mins / 60) * hourPx);
}

export function clampHourPx(hourPx: number, viewportHeight: number): number {
  const minHourPx = viewportHeight / TOTAL_HOURS;
  const maxHourPx = viewportHeight / MIN_VISIBLE_HOURS;
  return Math.min(maxHourPx, Math.max(minHourPx, hourPx));
}

export interface AnchoredScrollInput {
  currentScrollTop: number;
  anchorOffsetY: number;
  previousHourPx: number;
  nextHourPx: number;
}

export function calculateAnchoredScrollTop(input: AnchoredScrollInput): number {
  const anchorHour = (input.currentScrollTop + input.anchorOffsetY) / input.previousHourPx;
  return anchorHour * input.nextHourPx - input.anchorOffsetY;
}

export function snapMins(mins: number): number {
  return Math.round(mins / 15) * 15;
}

export function minsToTimeStr(mins: number): string {
  return `${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`;
}

export function minsToISO(date: string, mins: number): string {
  const offset = -new Date().getTimezoneOffset();
  const sign = offset >= 0 ? "+" : "-";
  const abs = Math.abs(offset);
  const tz = `${sign}${String(Math.floor(abs / 60)).padStart(2, "0")}:${String(abs % 60).padStart(2, "0")}`;
  return `${date}T${minsToTimeStr(mins)}:00${tz}`;
}

export function assignColumns(events: CalendarEvent[]): EventLayout[] {
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
