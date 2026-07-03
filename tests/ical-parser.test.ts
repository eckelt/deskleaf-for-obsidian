import { describe, expect, it } from "vitest";
import { parseICalendar, updateVEvent, updateVEventAttendeePartstat } from "../src/ical-parser";

const EVENT = [
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

describe("updateVEvent", () => {
  it("updates summary, time, location and description", () => {
    const updated = updateVEvent(EVENT, {
      title: "New title",
      start: "2026-06-16T10:00:00Z",
      end: "2026-06-16T11:00:00Z",
      location: "New room",
      notes: "New description",
    });

    expect(updated).toContain("SUMMARY:New title");
    expect(updated).toContain("DTSTART:20260616T100000Z");
    expect(updated).toContain("DTEND:20260616T110000Z");
    expect(updated).toContain("LOCATION:New room");
    expect(updated).toContain("DESCRIPTION:New description");

    const [event] = parseICalendar(updated, "Work");
    expect(event.title).toBe("New title");
    expect(event.location).toBe("New room");
    expect(event.body).toBe("New description");
  });

  it("updates event start time without touching VTIMEZONE DTSTART", () => {
    const eventWithTimezone = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "BEGIN:VTIMEZONE",
      "TZID:Europe/Berlin",
      "BEGIN:STANDARD",
      "DTSTART:19701025T030000",
      "TZOFFSETFROM:+0200",
      "TZOFFSETTO:+0100",
      "END:STANDARD",
      "END:VTIMEZONE",
      "BEGIN:VEVENT",
      "UID:event-1",
      "DTSTART;TZID=Europe/Berlin:20260616T080000",
      "DTEND;TZID=Europe/Berlin:20260616T090000",
      "SUMMARY:Old title",
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\r\n") + "\r\n";

    const updated = updateVEvent(eventWithTimezone, {
      title: "New title",
      start: "2026-06-16T10:00:00+02:00",
      end: "2026-06-16T11:00:00+02:00",
      location: "",
      notes: "",
    });

    expect(updated).toContain("DTSTART:19701025T030000");
    expect(updated).toContain("DTSTART:20260616T080000Z");
    expect(updated).toContain("DTEND:20260616T090000Z");
    expect(updated.indexOf("DTSTART:19701025T030000")).toBeLessThan(updated.indexOf("BEGIN:VEVENT"));
    expect(updated.indexOf("DTSTART:20260616T080000Z")).toBeGreaterThan(updated.indexOf("BEGIN:VEVENT"));
  });

  it("adds missing optional text fields", () => {
    const base = EVENT
      .replace(/^LOCATION[^\r\n]*\r?\n/m, "")
      .replace(/^DESCRIPTION[^\r\n]*\r?\n/m, "");

    const updated = updateVEvent(base, {
      title: "Title",
      start: "2026-06-16T10:00:00Z",
      end: "2026-06-16T11:00:00Z",
      location: "Room",
      notes: "Description",
    });

    expect(updated).toContain("LOCATION:Room");
    expect(updated).toContain("DESCRIPTION:Description");
    expect(updated.indexOf("LOCATION:Room")).toBeLessThan(updated.indexOf("END:VEVENT"));
  });

  it("removes empty optional text fields", () => {
    const updated = updateVEvent(EVENT, {
      title: "Title",
      start: "2026-06-16T10:00:00Z",
      end: "2026-06-16T11:00:00Z",
      location: "",
      notes: "",
    });

    expect(updated).not.toMatch(/^LOCATION/m);
    expect(updated).not.toMatch(/^DESCRIPTION/m);
  });

  it("escapes iCal text values", () => {
    const updated = updateVEvent(EVENT, {
      title: "Review, Q2; follow\\up",
      start: "2026-06-16T10:00:00Z",
      end: "2026-06-16T11:00:00Z",
      location: "Room, 1",
      notes: "Line 1\nLine 2",
    });

    expect(updated).toContain("SUMMARY:Review\\, Q2\\; follow\\\\up");
    expect(updated).toContain("LOCATION:Room\\, 1");
    expect(updated).toContain("DESCRIPTION:Line 1\\nLine 2");
  });

  it("replaces folded description continuations instead of appending stale text", () => {
    const folded = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "BEGIN:VEVENT",
      "UID:event-1",
      "DTSTART:20260616T080000Z",
      "DTEND:20260616T090000Z",
      "SUMMARY:Old title",
      "DESCRIPTION:Heute sucht Manuel außer der Reihe aus und der Termin",
      " findet im Hofbräuhaus statt.findet im Hofbräuhaus statt.",
      " findet im Hofbräuhaus statt.findet im Hofbräuhaus statt.",
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\r\n") + "\r\n";

    const updated = updateVEvent(folded, {
      title: "Old title",
      start: "2026-06-16T08:00:00Z",
      end: "2026-06-16T09:00:00Z",
      location: "",
      notes: "Heute sucht Manuel außer der Reihe aus und der Termin findet im Hofbräuhaus statt. 🍻",
    });

    expect(updated).toContain("DESCRIPTION:Heute sucht Manuel außer der Reihe aus und der Termin findet im Hofbräuhaus statt. 🍻");
    expect(updated).not.toContain("\r\n findet im Hofbräuhaus");

    const [event] = parseICalendar(updated, "Work");
    expect(event.body).toBe("Heute sucht Manuel außer der Reihe aus und der Termin findet im Hofbräuhaus statt. 🍻");
  });
});

describe("parseICalendar", () => {
  it("cleans Google Meet provider text while preserving remote event facts and platform detection", () => {
    const ical = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "BEGIN:VEVENT",
      "UID:event-1",
      "DTSTART:20260703T080000Z",
      "DTEND:20260703T090000Z",
      "SUMMARY:Planning",
      "LOCATION:Room A",
      "DESCRIPTION:Agenda\\n-::~:~::~:~:~:~:~:~:~:~:~::~:~::-\\nJoin with Google Meet: https://meet.google.com/abc-defg-hij\\nPlease do not edit this section.\\n-::~:~::~:~:~:~:~:~:~:~:~::~:~::-\\nFollow-up",
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\r\n") + "\r\n";

    const [event] = parseICalendar(ical, "Work");

    expect(event.title).toBe("Planning");
    expect(event.start).toBe("2026-07-03T08:00:00Z");
    expect(event.end).toBe("2026-07-03T09:00:00Z");
    expect(event.location).toBe("Room A");
    expect(event.calendar).toBe("Work");
    expect(event.body).toBe("Agenda\nFollow-up");
    expect(event.meetingPlatform).toBe("meet");
  });
});

describe("CalDAV RSVP parsing and updates", () => {
  it("marks the current user as RSVP-capable when an ATTENDEE line matches", () => {
    const ical = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "BEGIN:VEVENT",
      "UID:event-1",
      "DTSTART:20260616T080000Z",
      "DTEND:20260616T090000Z",
      "SUMMARY:RSVP event",
      "ATTENDEE;CN=Nils;PARTSTAT=NEEDS-ACTION:mailto:user@example.test",
      "ATTENDEE;CN=Other;PARTSTAT=ACCEPTED:mailto:other@example.test",
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\r\n") + "\r\n";

    const [event] = parseICalendar(ical, "Work", "user@example.test");

    expect(event.rsvp).toEqual({ attendeeEmail: "user@example.test", status: null });
  });

  it("updates only the matching ATTENDEE PARTSTAT", () => {
    const ical = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "BEGIN:VEVENT",
      "UID:event-1",
      "DTSTART:20260616T080000Z",
      "DTEND:20260616T090000Z",
      "SUMMARY:RSVP event",
      "ATTENDEE;CN=Nils;ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION:mailto:user@example.test",
      "ATTENDEE;CN=Other;PARTSTAT=ACCEPTED:mailto:other@example.test",
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\r\n") + "\r\n";

    const updated = updateVEventAttendeePartstat(ical, "user@example.test", "tentative");

    expect(updated).toContain("ATTENDEE;CN=Nils;ROLE=REQ-PARTICIPANT;PARTSTAT=TENTATIVE:mailto:user@example.test");
    expect(updated).toContain("ATTENDEE;CN=Other;PARTSTAT=ACCEPTED:mailto:other@example.test");
  });
});
