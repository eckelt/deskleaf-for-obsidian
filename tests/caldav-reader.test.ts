import { describe, expect, it, vi } from "vitest";
import { CalDAVReader } from "../src/caldav-reader";

const EVENT_ICAL = [
  "BEGIN:VCALENDAR",
  "VERSION:2.0",
  "BEGIN:VEVENT",
  "UID:event-1",
  "DTSTART:20260616T080000Z",
  "DTEND:20260616T090000Z",
  "SUMMARY:Old title",
  "LOCATION:Old room",
  "DESCRIPTION:Old description",
  "END:VEVENT",
  "END:VCALENDAR",
].join("\r\n") + "\r\n";

function makeReader() {
  const reader = new CalDAVReader("https://example.test", "user", "pass");
  const client = {
    getEvent: vi.fn(async () => EVENT_ICAL),
    putEvent: vi.fn(async () => undefined),
    moveEvent: vi.fn(async () => undefined),
    hrefForEvent: vi.fn((calendarHref: string, uid: string) => `${calendarHref}${uid}.ics`),
  };

  Reflect.set(reader, "client", client);
  Reflect.set(reader, "calendars", [
    { href: "/calendars/work/", displayName: "Work" },
    { href: "/calendars/private/", displayName: "Private" },
  ]);
  Reflect.set(reader, "hrefMap", new Map([["event-1", "/calendars/work/event-1.ics"]]));
  Reflect.set(reader, "calendarHrefMap", new Map([["event-1", "/calendars/work/"]]));
  Reflect.set(reader, "fetchAll", vi.fn(async () => undefined));

  return { reader, client };
}

describe("CalDAVReader.updateEvent", () => {
  it("updates the existing VEVENT and reloads the calendar", async () => {
    const { reader, client } = makeReader();

    await reader.updateEvent("event-1", {
      title: "New title",
      start: "2026-06-16T10:00:00Z",
      end: "2026-06-16T11:00:00Z",
      location: "New room",
      notes: "New description",
      calendar: "Work",
    });

    expect(client.getEvent).toHaveBeenCalledWith("/calendars/work/event-1.ics");
    expect(client.putEvent).toHaveBeenCalledTimes(1);
    expect(client.putEvent.mock.calls[0][0]).toBe("/calendars/work/event-1.ics");
    expect(client.putEvent.mock.calls[0][1]).toContain("SUMMARY:New title");
    expect(client.putEvent.mock.calls[0][1]).toContain("DTSTART:20260616T100000Z");
    expect(client.putEvent.mock.calls[0][1]).toContain("DTEND:20260616T110000Z");
    expect(client.putEvent.mock.calls[0][1]).toContain("LOCATION:New room");
    expect(client.putEvent.mock.calls[0][1]).toContain("DESCRIPTION:New description");
    expect(client.moveEvent).not.toHaveBeenCalled();
    expect(Reflect.get(reader, "fetchAll")).toHaveBeenCalledOnce();
  });

  it("moves the resource after a successful update when the calendar changes", async () => {
    const { reader, client } = makeReader();

    await reader.updateEvent("event-1", {
      title: "New title",
      start: "2026-06-16T10:00:00Z",
      end: "2026-06-16T11:00:00Z",
      calendar: "Private",
    });

    expect(client.putEvent).toHaveBeenCalledOnce();
    expect(client.hrefForEvent).toHaveBeenCalledWith("/calendars/private/", "event-1");
    expect(client.moveEvent).toHaveBeenCalledWith(
      "/calendars/work/event-1.ics",
      "/calendars/private/event-1.ics",
    );
    expect(Reflect.get(reader, "fetchAll")).toHaveBeenCalledOnce();
  });

  it("rejects ambiguous recurring series updates before writing", async () => {
    const { reader, client } = makeReader();
    client.getEvent.mockResolvedValueOnce(
      EVENT_ICAL.replace("SUMMARY:Old title", "RECURRENCE-ID:20260616T080000Z\r\nSUMMARY:Old title"),
    );

    await expect(reader.updateEvent("event-1", {
      title: "New title",
      start: "2026-06-16T10:00:00Z",
      end: "2026-06-16T11:00:00Z",
      span: "series",
    })).rejects.toThrow("Serienbearbeitung");

    expect(client.putEvent).not.toHaveBeenCalled();
    expect(client.moveEvent).not.toHaveBeenCalled();
  });

  it("writes RSVP through the attendee PARTSTAT path and reloads without updateEvent", async () => {
    const { reader, client } = makeReader();
    client.getEvent.mockResolvedValueOnce([
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "BEGIN:VEVENT",
      "UID:event-1",
      "DTSTART:20260616T080000Z",
      "DTEND:20260616T090000Z",
      "SUMMARY:RSVP event",
      "ATTENDEE;CN=User;PARTSTAT=NEEDS-ACTION:mailto:user",
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\r\n") + "\r\n");

    await reader.updateRsvp("event-1", "accepted");

    expect(client.getEvent).toHaveBeenCalledWith("/calendars/work/event-1.ics");
    expect(client.putEvent).toHaveBeenCalledOnce();
    expect(client.putEvent.mock.calls[0][0]).toBe("/calendars/work/event-1.ics");
    expect(client.putEvent.mock.calls[0][1]).toContain("ATTENDEE;CN=User;PARTSTAT=ACCEPTED:mailto:user");
    expect(Reflect.get(reader, "fetchAll")).toHaveBeenCalledOnce();
  });
});

describe("CalDAVReader cache precedence", () => {
  it("uses cache only until a successful backend reload replaces stale event facts", async () => {
    const reader = new CalDAVReader("https://example.test", "user", "pass");
    const remoteIcal = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "BEGIN:VEVENT",
      "UID:event-1",
      "DTSTART;VALUE=DATE:20260616",
      "DTEND;VALUE=DATE:20260618",
      "SUMMARY:Remote title",
      "LOCATION:Remote room",
      "DESCRIPTION:Remote description",
      "RRULE:FREQ=WEEKLY",
      "STATUS:CANCELLED",
      "ORGANIZER;CN=Remote Organizer:mailto:organizer@example.test",
      "ATTENDEE;CN=Remote Attendee;PARTSTAT=ACCEPTED:mailto:attendee@example.test",
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\r\n") + "\r\n";
    const client = {
      discoverCalendars: vi.fn(async () => [{ href: "/calendars/work/", displayName: "Work" }]),
      fetchEvents: vi.fn(async () => [{ href: "/calendars/work/event-1.ics", ical: remoteIcal }]),
    };
    const staleCache = [{
      id: "event-1",
      title: "Cached title",
      start: "2026-06-16T08:00:00Z",
      end: "2026-06-16T08:30:00Z",
      isAllDay: false,
      isRecurring: false,
      calendar: "Cached calendar",
      location: "Cached room",
      attendees: ["Cached Attendee"],
      organizer: "Cached Organizer",
      isCancelled: false,
      isOrganizer: false,
    }];
    const saved = vi.fn(async () => undefined);

    Reflect.set(reader, "client", client);
    reader.setCacheCallbacks(
      saved,
      async () => ({ events: staleCache, date: "2026-06-15T12:00:00Z" }),
    );

    await reader.load();

    expect(reader.getEvents()).toEqual([expect.objectContaining({
      id: "event-1",
      title: "Remote title",
      start: "2026-06-16",
      end: "2026-06-17",
      isAllDay: true,
      isRecurring: true,
      calendar: "Work",
      location: "Remote room",
      attendees: ["Remote Attendee"],
      organizer: "Remote Organizer",
      isCancelled: true,
    })]);
    expect(reader.getEvents()[0].isOrganizer).toBeUndefined();
    expect(saved).toHaveBeenCalledWith(
      [expect.objectContaining({
        id: "event-1",
        title: "Remote title",
        start: "2026-06-16",
        end: "2026-06-17",
        attendees: ["Remote Attendee"],
        organizer: "Remote Organizer",
        isCancelled: true,
      })],
      expect.any(String),
    );
  });
});
