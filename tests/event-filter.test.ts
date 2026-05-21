import { describe, it, expect } from "vitest";
import { getEventsForDate, getAllDayEventsForDate } from "../src/event-filter";
import type { CalendarEvent } from "../src/types";

// Representative events as deskleaf-calendar-sync would produce them
const TIMED: CalendarEvent[] = [
  {
    id: "ev1",
    title: "Morning Standup",
    start: "2026-05-04T09:00:00+02:00",
    end:   "2026-05-04T09:30:00+02:00",
    isAllDay: false,
    calendar: "Work",
    attendees: [],
    isRecurring: true,
    isCancelled: false,
    isOrganizer: true,
    numAttendees: 1,
  },
  {
    id: "ev2",
    title: "Team Weekly",
    start: "2026-05-04T10:00:00+02:00",
    end:   "2026-05-04T11:00:00+02:00",
    isAllDay: false,
    calendar: "Work",
    attendees: ["Alice Smith", "Bob Jones"],
    isRecurring: false,
    isCancelled: false,
    isOrganizer: true,
    numAttendees: 3,
    meetingPlatform: "teams",
  },
  {
    id: "ev3",
    title: "Future Event",
    start: "2026-05-05T14:00:00+02:00",
    end:   "2026-05-05T15:00:00+02:00",
    isAllDay: false,
    calendar: "Personal",
    attendees: [],
    isRecurring: false,
    isCancelled: false,
    isOrganizer: true,
    numAttendees: 1,
  },
  {
    id: "ev4",
    title: "Past Event",
    start: "2026-05-03T14:00:00+02:00",
    end:   "2026-05-03T15:00:00+02:00",
    isAllDay: false,
    calendar: "Personal",
    attendees: [],
    isRecurring: false,
    isCancelled: false,
    isOrganizer: true,
    numAttendees: 1,
  },
  {
    id: "ev5",
    title: "Multi-Day Conference",
    start: "2026-05-03T09:00:00+02:00",
    end:   "2026-05-06T18:00:00+02:00",
    isAllDay: false,
    calendar: "Work",
    attendees: [],
    isRecurring: false,
    isCancelled: false,
    isOrganizer: false,
    numAttendees: 100,
  },
];

const ALL_DAY: CalendarEvent[] = [
  {
    id: "ad1",
    title: "Public Holiday",
    start: "2026-05-04",
    end:   "2026-05-04",
    isAllDay: true,
    calendar: "Holidays",
    attendees: [],
    isRecurring: false,
    isCancelled: false,
    isOrganizer: false,
    numAttendees: 0,
  },
  {
    id: "ad2",
    title: "Week-long Conference",
    start: "2026-05-04",
    end:   "2026-05-08",
    isAllDay: true,
    calendar: "Work",
    attendees: [],
    isRecurring: false,
    isCancelled: false,
    isOrganizer: true,
    numAttendees: 0,
  },
  {
    id: "ad3",
    title: "Yesterday Only",
    start: "2026-05-03",
    end:   "2026-05-03",
    isAllDay: true,
    calendar: "Personal",
    attendees: [],
    isRecurring: false,
    isCancelled: false,
    isOrganizer: true,
    numAttendees: 0,
  },
];

describe("getEventsForDate", () => {
  it("returns events on the exact date", () => {
    const result = getEventsForDate(TIMED, "2026-05-04");
    const ids = result.map((e) => e.id);
    expect(ids).toContain("ev1");
    expect(ids).toContain("ev2");
  });

  it("excludes events on other dates", () => {
    const result = getEventsForDate(TIMED, "2026-05-04");
    const ids = result.map((e) => e.id);
    expect(ids).not.toContain("ev3"); // future
    expect(ids).not.toContain("ev4"); // past
  });

  it("excludes all-day events", () => {
    const mixed = [...TIMED, ...ALL_DAY];
    const result = getEventsForDate(mixed, "2026-05-04");
    expect(result.every((e) => !e.isAllDay)).toBe(true);
  });

  it("includes multi-day event spanning the date", () => {
    const result = getEventsForDate(TIMED, "2026-05-04");
    const ids = result.map((e) => e.id);
    expect(ids).toContain("ev5");
  });

  it("slices multi-day event start to 00:00:00 when it starts before the date", () => {
    const result = getEventsForDate(TIMED, "2026-05-04");
    const ev5 = result.find((e) => e.id === "ev5")!;
    expect(ev5.start).toBe("2026-05-04T00:00:00");
  });

  it("slices multi-day event end to 23:59:59 when it ends after the date", () => {
    const result = getEventsForDate(TIMED, "2026-05-04");
    const ev5 = result.find((e) => e.id === "ev5")!;
    expect(ev5.end).toBe("2026-05-04T23:59:59");
  });

  it("sets _continuesBefore on sliced multi-day event", () => {
    const result = getEventsForDate(TIMED, "2026-05-04");
    const ev5 = result.find((e) => e.id === "ev5") as any;
    expect(ev5._continuesBefore).toBe(true);
  });

  it("sets _continuesAfter on sliced multi-day event", () => {
    const result = getEventsForDate(TIMED, "2026-05-04");
    const ev5 = result.find((e) => e.id === "ev5") as any;
    expect(ev5._continuesAfter).toBe(true);
  });

  it("keeps original start for multi-day event on its start day", () => {
    const result = getEventsForDate(TIMED, "2026-05-03");
    const ev5 = result.find((e) => e.id === "ev5")!;
    expect(ev5.start).toBe("2026-05-03T09:00:00+02:00");
    expect((ev5 as any)._continuesBefore).toBeFalsy();
  });

  it("returns empty array when no events match", () => {
    expect(getEventsForDate(TIMED, "2026-01-01")).toHaveLength(0);
  });
});

describe("getAllDayEventsForDate", () => {
  it("returns all-day events on exact date", () => {
    const result = getAllDayEventsForDate(ALL_DAY, "2026-05-04");
    const ids = result.map((e) => e.id);
    expect(ids).toContain("ad1");
  });

  it("returns multi-day all-day event spanning the date", () => {
    const result = getAllDayEventsForDate(ALL_DAY, "2026-05-06");
    const ids = result.map((e) => e.id);
    expect(ids).toContain("ad2");
    expect(ids).not.toContain("ad1"); // only on 05-04
  });

  it("excludes all-day event that ended before the date", () => {
    const result = getAllDayEventsForDate(ALL_DAY, "2026-05-04");
    const ids = result.map((e) => e.id);
    expect(ids).not.toContain("ad3");
  });

  it("excludes timed events", () => {
    const mixed = [...TIMED, ...ALL_DAY];
    const result = getAllDayEventsForDate(mixed, "2026-05-04");
    expect(result.every((e) => e.isAllDay)).toBe(true);
  });

  it("multi-day all-day event is inclusive on both start and end day", () => {
    const resultStart = getAllDayEventsForDate(ALL_DAY, "2026-05-04");
    const resultEnd   = getAllDayEventsForDate(ALL_DAY, "2026-05-08");
    expect(resultStart.map((e) => e.id)).toContain("ad2");
    expect(resultEnd.map((e) => e.id)).toContain("ad2");
  });

  it("returns empty array for a date with no all-day events", () => {
    expect(getAllDayEventsForDate(ALL_DAY, "2026-05-01")).toHaveLength(0);
  });
});
