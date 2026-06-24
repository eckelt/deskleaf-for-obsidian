import type { BusinessHoursSettings } from "./types";

export interface BusinessHoursSegment {
  topMinutes: number;
  durationMinutes: number;
}

const DAY_MINUTES = 24 * 60;
const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function parseTimeToMinutes(value: string): number | null {
  const match = TIME_RE.exec(value);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

export function getBusinessHoursSegment(
  date: Date,
  settings: BusinessHoursSettings,
): BusinessHoursSegment | null {
  if (!settings.enabled) return null;
  if (!settings.days.includes(date.getDay())) return null;

  const start = parseTimeToMinutes(settings.start);
  const end = parseTimeToMinutes(settings.end);
  if (start === null || end === null || end <= start) return null;

  const topMinutes = Math.max(0, Math.min(DAY_MINUTES, start));
  const endMinutes = Math.max(0, Math.min(DAY_MINUTES, end));
  if (endMinutes <= topMinutes) return null;

  return {
    topMinutes,
    durationMinutes: endMinutes - topMinutes,
  };
}
