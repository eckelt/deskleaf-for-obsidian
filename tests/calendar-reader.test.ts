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
