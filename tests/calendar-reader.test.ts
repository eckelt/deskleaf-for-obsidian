import { describe, expect, it, vi } from "vitest";
import { CalendarReader } from "../src/calendar-reader";

describe("CalendarReader.updateEvent", () => {
  it("updates through the Swift binary and reloads the calendar view data", async () => {
    const reader = new CalendarReader("/tmp/deskleaf-calendar-sync");
    const refreshedEvents = [
      {
        id: "event-1",
        title: "Updated planning",
        start: "2026-06-16T10:00:00Z",
        end: "2026-06-16T11:00:00Z",
        location: "Room 2",
        body: "Updated description",
        calendar: "Work",
      },
    ];
    const execFile = vi.fn((_: string, args: string[], __: object, callback: (err: Error | null, stdout: string) => void) => {
      if (args[0] === "update") {
        callback(null, "");
        return;
      }
      if (args[0] === "export") {
        callback(null, JSON.stringify(refreshedEvents));
        return;
      }
      callback(new Error(`Unexpected command: ${args[0]}`), "");
    });
    const onChange = vi.fn();

    Reflect.set(reader, "execFile", execFile);
    Reflect.set(reader, "existsSync", () => true);
    reader.onChange(onChange);

    await reader.updateEvent("event-1", {
      title: "Updated planning",
      start: "2026-06-16T10:00:00Z",
      end: "2026-06-16T11:00:00Z",
      location: "Room 2",
      notes: "Updated description",
      calendar: "Work",
      span: "this",
    });

    expect(execFile).toHaveBeenCalledTimes(2);
    expect(execFile.mock.calls[0][1]).toEqual([
      "update",
      "--id", "event-1",
      "--title", "Updated planning",
      "--start", "2026-06-16T10:00:00Z",
      "--end", "2026-06-16T11:00:00Z",
      "--span", "this",
      "--calendar", "Work",
      "--location", "Room 2",
      "--notes", "Updated description",
    ]);
    expect(execFile.mock.calls[1][1]).toEqual(["export", "--days-back", "90", "--days-forward", "365"]);
    expect(reader.getEvents()).toEqual(refreshedEvents);
    expect(onChange).toHaveBeenCalledOnce();
  });
});

describe("CalendarReader binary import", () => {
  it("cleans provider text from imported event bodies without changing other fields", async () => {
    const reader = new CalendarReader("/tmp/deskleaf-calendar-sync");
    const execFile = vi.fn((_: string, args: string[], __: object, callback: (err: Error | null, stdout: string) => void) => {
      if (args[0] !== "export") {
        callback(new Error(`Unexpected command: ${args[0]}`), "");
        return;
      }
      callback(null, JSON.stringify([{
        id: "event-1",
        title: "Planning",
        start: "2026-07-03T08:00:00Z",
        end: "2026-07-03T09:00:00Z",
        location: "Room A",
        attendees: ["Remote Attendee"],
        body: [
          "Agenda",
          "-::~:~::~:~:~:~:~:~:~:~:~::~:~::-",
          "Join with Google Meet: https://meet.google.com/abc-defg-hij",
          "Please do not edit this section.",
          "-::~:~::~:~:~:~:~:~:~:~:~::~:~::-",
          "Follow-up",
        ].join("\n"),
        meetingPlatform: "meet",
        calendar: "Work",
        isAllDay: false,
        isRecurring: true,
        isCancelled: true,
        isOrganizer: false,
        organizer: "Remote Organizer",
      }]));
    });

    Reflect.set(reader, "execFile", execFile);
    Reflect.set(reader, "existsSync", () => true);

    await reader.load();

    expect(reader.getEvents()).toEqual([expect.objectContaining({
      id: "event-1",
      title: "Planning",
      start: "2026-07-03T08:00:00Z",
      end: "2026-07-03T09:00:00Z",
      location: "Room A",
      attendees: ["Remote Attendee"],
      body: "Agenda\nFollow-up",
      meetingPlatform: "meet",
      calendar: "Work",
      isAllDay: false,
      isRecurring: true,
      isCancelled: true,
      isOrganizer: false,
      organizer: "Remote Organizer",
    })]);
  });
});
