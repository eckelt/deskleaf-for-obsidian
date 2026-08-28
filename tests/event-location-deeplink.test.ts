import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Notice, Platform, TFile, WorkspaceLeaf } from "obsidian";
import { DeskleafCalendarView } from "../src/calendar-view";
import type { CalendarEvent, EventUpdate } from "../src/types";
import { DEFAULT_SETTINGS } from "../src/types";

function makeEvent(overrides: Partial<CalendarEvent> = {}): CalendarEvent {
  return {
    id: "event-1",
    title: "Finanzamt anrufen",
    start: "2026-08-27T09:00:00.000Z",
    end: "2026-08-27T09:30:00.000Z",
    location: "",
    body: "Unterlagen bereitlegen",
    calendar: "Work",
    ...overrides,
  };
}

function makeFile(path: string): TFile {
  const file = new TFile();
  file.path = path;
  file.basename = path.replace(/\.md$/, "").split("/").pop() ?? "";
  return file;
}

interface ViewHarness {
  view: DeskleafCalendarView;
  updateEvent: ReturnType<typeof vi.fn<[string, EventUpdate], Promise<void>>>;
  openOrCreate: ReturnType<typeof vi.fn>;
}

function makeView(openOrCreateResult: { file: TFile; isNew: boolean }): ViewHarness {
  const updateEvent = vi.fn<[string, EventUpdate], Promise<void>>().mockResolvedValue();
  const openOrCreate = vi.fn().mockResolvedValue(openOrCreateResult);
  const plugin = {
    settings: DEFAULT_SETTINGS,
    calendarReader: {
      getEvents: vi.fn().mockReturnValue([]),
      updateEvent,
    },
    noteManager: {
      openOrCreate,
    },
  };
  // The view's app dependencies (workspace/vault) are unrelated to this
  // feature; render() is stubbed since it drives the full time-grid DOM,
  // which nothing here needs to exercise.
  const view = new DeskleafCalendarView(new WorkspaceLeaf(), plugin as any);
  (view as any).render = () => {};
  (view as any).app = {
    vault: { getName: () => "Brain" },
    workspace: {
      getLeavesOfType: () => [],
      getLeaf: () => ({ openFile: vi.fn().mockResolvedValue(undefined) }),
      getMostRecentLeaf: () => null,
      setActiveLeaf: () => {},
      getActiveViewOfType: () => null,
    },
  };
  return { view, updateEvent, openOrCreate };
}

describe("automatic location deeplink when opening an event note", () => {
  beforeEach(() => {
    Platform.isMobile = false;
    Platform.isDesktop = true;
    Notice.instances = [];
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("writes an Obsidian deeplink to the location field for a new note on an event without one", async () => {
    const event = makeEvent({ location: "" });
    const file = makeFile("meetings/2026-08-27 Finanzamt anrufen.md");
    const { view, updateEvent } = makeView({ file, isNew: true });

    await (view as any).openEvent(event, false);

    expect(updateEvent).toHaveBeenCalledWith("event-1", {
      title: "Finanzamt anrufen",
      start: "2026-08-27T09:00:00.000Z",
      end: "2026-08-27T09:30:00.000Z",
      notes: "Unterlagen bereitlegen",
      calendar: "Work",
      location: "obsidian://open?vault=Brain&file=meetings%2F2026-08-27%20Finanzamt%20anrufen",
    });
  });

  it("treats a whitespace-only location as empty", async () => {
    const event = makeEvent({ location: "   " });
    const file = makeFile("meetings/2026-08-27 Finanzamt anrufen.md");
    const { view, updateEvent } = makeView({ file, isNew: true });

    await (view as any).openEvent(event, false);

    expect(updateEvent).toHaveBeenCalledTimes(1);
  });

  it("does not overwrite an existing location, even for a newly created note", async () => {
    const event = makeEvent({ location: "Büro Raum 3" });
    const file = makeFile("meetings/2026-08-27 Finanzamt anrufen.md");
    const { view, updateEvent } = makeView({ file, isNew: true });

    await (view as any).openEvent(event, false);

    expect(updateEvent).not.toHaveBeenCalled();
  });

  it("links an existing note retroactively when the location is empty", async () => {
    const event = makeEvent({ location: "" });
    const file = makeFile("meetings/2026-08-27 Finanzamt anrufen.md");
    const { view, updateEvent } = makeView({ file, isNew: false });

    await (view as any).openEvent(event, false);

    expect(updateEvent).toHaveBeenCalledTimes(1);
  });

  it("does not set a span, so no this/series dialog appears even for a recurring event", async () => {
    const event = makeEvent({ location: "", isRecurring: true });
    const file = makeFile("meetings/2026-08-27 Finanzamt anrufen.md");
    const { view, updateEvent } = makeView({ file, isNew: false });

    await (view as any).openEvent(event, false);

    const update = updateEvent.mock.calls[0]?.[1];
    expect(update?.span).toBeUndefined();
  });

  it("shows a Notice and still keeps the note open when the location update fails", async () => {
    const event = makeEvent({ location: "" });
    const file = makeFile("meetings/2026-08-27 Finanzamt anrufen.md");
    const { view, updateEvent } = makeView({ file, isNew: true });
    updateEvent.mockRejectedValueOnce(new Error("Netzwerkfehler"));

    await expect((view as any).openEvent(event, false)).resolves.toBeUndefined();

    expect(Notice.instances.some((msg) => msg.includes("Netzwerkfehler"))).toBe(true);
  });
});
