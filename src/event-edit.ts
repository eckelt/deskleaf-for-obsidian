import type { EventEditInput, EventUpdate } from "./types";
import { minsToISO } from "./date-utils";

export function parseClockTime(value: string): number {
  const [hours, minutes] = value.split(":").map(Number);
  return (hours || 0) * 60 + (minutes || 0);
}

export function validateEventEditInput(input: EventEditInput): EventUpdate | null {
  const title = input.title.trim();
  if (!title || !input.startTime || !input.endTime) return null;

  const startMins = parseClockTime(input.startTime);
  const endMins = parseClockTime(input.endTime);
  if (endMins <= startMins) return null;

  return {
    title,
    start: minsToISO(input.startDate, startMins),
    end: minsToISO(input.endDate, endMins),
    location: input.location.trim(),
    notes: input.notes.trim(),
    calendar: input.calendar.trim(),
  };
}
