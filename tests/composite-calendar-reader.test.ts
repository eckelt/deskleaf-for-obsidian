import { describe, expect, it, vi } from "vitest";
import { CompositeCalendarReader } from "../src/composite-calendar-reader";
import { CalDAVReader } from "../src/caldav-reader";
import { CalendarReader } from "../src/calendar-reader";
import type { CalendarEvent } from "../src/types";

const CALDAV_EVENT: CalendarEvent = {
  id: "ev-1", title: "Standup", start: "2026-09-10T09:00:00Z", end: "2026-09-10T09:30:00Z",
  calendar: "Work", attendees: [], isRecurring: false, isCancelled: false, isOrganizer: true, numAttendees: 1,
};

const REMINDER_EVENT: CalendarEvent = {
  id: "reminder:abc-123", title: "Rechnung stellen", start: "2026-09-10T14:00:00Z", end: "2026-09-10T14:30:00Z",
  isAllDay: false, isReminder: true, calendar: "Erinnerungen", attendees: [], isRecurring: false,
  isCancelled: false, numAttendees: 0,
};

function makeReaders() {
  const primary = new CalDAVReader("https://caldav.example.com", "user", "pass");
  const reminders = new CalendarReader("/tmp/deskleaf-calendar-sync");
  return { primary, reminders };
}

describe("CompositeCalendarReader — reads (ADR 3 / AC8, AC9)", () => {
  it("merges CalDAV events with reminders-only events", () => {
    const { primary, reminders } = makeReaders();
    vi.spyOn(primary, "getEvents").mockReturnValue([CALDAV_EVENT]);
    vi.spyOn(reminders, "getEvents").mockReturnValue([REMINDER_EVENT]);
    const composite = new CompositeCalendarReader(primary, reminders);

    expect(composite.getEvents().map((e) => e.id)).toEqual(["ev-1", "reminder:abc-123"]);
  });

  it("getEventsForDate/getAllDayEventsForDate operate over the merged set", () => {
    const { primary, reminders } = makeReaders();
    vi.spyOn(primary, "getEvents").mockReturnValue([CALDAV_EVENT]);
    vi.spyOn(reminders, "getEvents").mockReturnValue([REMINDER_EVENT]);
    const composite = new CompositeCalendarReader(primary, reminders);

    expect(composite.getEventsForDate("2026-09-10").map((e) => e.id)).toEqual(
      expect.arrayContaining(["ev-1", "reminder:abc-123"]),
    );
  });

  it("getLoadError/getPath/getCacheDate/getEventUrl delegate to the primary reader only", () => {
    const { primary, reminders } = makeReaders();
    vi.spyOn(primary, "getLoadError").mockReturnValue("caldav boom");
    vi.spyOn(primary, "getPath").mockReturnValue("https://caldav.example.com");
    vi.spyOn(primary, "getCacheDate").mockReturnValue("2026-09-10T00:00:00.000Z");
    vi.spyOn(primary, "getEventUrl").mockReturnValue("https://caldav.example.com/ev-1.ics");
    const composite = new CompositeCalendarReader(primary, reminders);

    expect(composite.getLoadError()).toBe("caldav boom");
    expect(composite.getPath()).toBe("https://caldav.example.com");
    expect(composite.getCacheDate()).toBe("2026-09-10T00:00:00.000Z");
    expect(composite.getEventUrl("ev-1")).toBe("https://caldav.example.com/ev-1.ics");
  });
});

describe("CompositeCalendarReader — write operations delegate only to the primary reader (AC7)", () => {
  it("createEvent/moveEvent/updateEvent/cancelEvent/updateRsvp never touch the reminders-only reader", async () => {
    const { primary, reminders } = makeReaders();
    const createEvent = vi.spyOn(primary, "createEvent").mockResolvedValue("uid-1");
    const moveEvent = vi.spyOn(primary, "moveEvent").mockResolvedValue(undefined);
    const updateEvent = vi.spyOn(primary, "updateEvent").mockResolvedValue(undefined);
    const cancelEvent = vi.spyOn(primary, "cancelEvent").mockResolvedValue(undefined);
    const updateRsvp = vi.spyOn(primary, "updateRsvp").mockResolvedValue(undefined);
    const remindersCreate = vi.spyOn(reminders, "createEvent");
    const composite = new CompositeCalendarReader(primary, reminders);

    await composite.createEvent({ title: "t", start: "s", end: "e" });
    await composite.moveEvent("ev-1", "s", "e");
    await composite.updateEvent("ev-1", { title: "t", start: "s", end: "e", span: "this" });
    await composite.cancelEvent("ev-1", "this");
    await composite.updateRsvp("ev-1", "accepted");

    expect(createEvent).toHaveBeenCalledTimes(1);
    expect(moveEvent).toHaveBeenCalledTimes(1);
    expect(updateEvent).toHaveBeenCalledTimes(1);
    expect(cancelEvent).toHaveBeenCalledTimes(1);
    expect(updateRsvp).toHaveBeenCalledTimes(1);
    expect(remindersCreate).not.toHaveBeenCalled();
  });
});

describe("CompositeCalendarReader — lifecycle and failure isolation (AC11)", () => {
  it("load()/startWatching()/stopWatching() drive both sub-readers", async () => {
    const { primary, reminders } = makeReaders();
    const primaryLoad = vi.spyOn(primary, "load").mockResolvedValue(undefined);
    const remindersLoad = vi.spyOn(reminders, "load").mockResolvedValue(undefined);
    const primaryStart = vi.spyOn(primary, "startWatching").mockImplementation(() => {});
    const remindersStart = vi.spyOn(reminders, "startWatching").mockImplementation(() => {});
    const primaryStop = vi.spyOn(primary, "stopWatching").mockImplementation(() => {});
    const remindersStop = vi.spyOn(reminders, "stopWatching").mockImplementation(() => {});
    const composite = new CompositeCalendarReader(primary, reminders);

    await composite.load();
    composite.startWatching();
    composite.stopWatching();

    expect(primaryLoad).toHaveBeenCalledTimes(1);
    expect(remindersLoad).toHaveBeenCalledTimes(1);
    expect(primaryStart).toHaveBeenCalledTimes(1);
    expect(remindersStart).toHaveBeenCalledTimes(1);
    expect(primaryStop).toHaveBeenCalledTimes(1);
    expect(remindersStop).toHaveBeenCalledTimes(1);
  });

  it("a reminders-only load error does not surface via getLoadError() (events path stays clean)", async () => {
    const { primary, reminders } = makeReaders();
    vi.spyOn(primary, "getLoadError").mockReturnValue(null);
    vi.spyOn(reminders, "getLoadError").mockReturnValue("deskleaf-calendar-sync: Reminder access denied");
    const composite = new CompositeCalendarReader(primary, reminders);

    expect(composite.getLoadError()).toBeNull();
  });

  it("onChange fires when either sub-reader changes, and unsubscribe detaches from both", () => {
    const { primary, reminders } = makeReaders();
    const composite = new CompositeCalendarReader(primary, reminders);
    const listener = vi.fn();

    const unsubscribe = composite.onChange(listener);
    const primaryWatchers = Reflect.get(primary, "watchers") as Array<() => void>;
    const remindersWatchers = Reflect.get(reminders, "watchers") as Array<() => void>;
    primaryWatchers.forEach((w) => w());
    remindersWatchers.forEach((w) => w());
    expect(listener).toHaveBeenCalledTimes(2);

    unsubscribe();
    // Sub-readers replace their watcher array on unsubscribe rather than mutating it,
    // so re-read it afterwards. Only the composite's own listener is detached; the
    // reader's internal failure-isolation watcher (see constructor) stays registered.
    expect((Reflect.get(primary, "watchers") as Array<() => void>).includes(listener)).toBe(false);
    expect((Reflect.get(reminders, "watchers") as Array<() => void>).includes(listener)).toBe(false);
  });
});
