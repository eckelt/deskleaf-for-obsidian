import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { Platform, WorkspaceLeaf } from "obsidian";
import { DeskleafCalendarView } from "../src/calendar-view";
import { DEFAULT_HOUR_PX } from "../src/event-layout";

function makeElement(): any {
  return {
    children: [] as any[],
    scrollTop: 0,
    addClass: () => {},
    empty() {
      this.children = [];
    },
    createDiv() {
      const child = makeElement();
      this.children.push(child);
      return child;
    },
    querySelector: () => null,
  };
}

function makeView(): any {
  const plugin = {
    settings: { caldav: {}, icalSubscriptions: [] },
    calendarReader: {
      getEvents: () => [],
      getEventsForDate: () => [],
      getAllDayEventsForDate: () => [],
      getLoadError: () => null,
      getPath: () => "",
    },
    noteManager: {
      buildNoteCache: () => new Map(),
    },
    icalFeedManager: {
      getAllEvents: () => [],
      getWarnFeeds: () => [],
    },
  };
  const view = new DeskleafCalendarView(new WorkspaceLeaf(), plugin as any) as any;
  view.app = {
    workspace: {
      trigger: () => {},
    },
  };
  view.containerEl = makeElement();
  view.containerEl.children = [makeElement(), makeElement()];
  view.buildStatusBar = () => {};
  view.buildTimeGrid = () => {};
  view.buildMobileTodayFab = () => {};
  return view;
}

describe("DeskleafCalendarView zoom state", () => {
  beforeEach(() => {
    Platform.isMobile = false;
    Platform.isDesktop = true;
  });

  afterEach(() => {
    Platform.isMobile = false;
    Platform.isDesktop = true;
  });

  it("keeps the selected hour height across re-renders", () => {
    const view = makeView();
    view.hourPx = 96;

    view.render();

    expect(view.hourPx).toBe(96);
    expect(view.gridHeight()).toBe(24 * 96);
  });

  it("keeps the selected hour height across mobile day navigation", () => {
    const view = makeView();
    Platform.isMobile = true;
    Platform.isDesktop = false;
    view.visibleDays = 1;
    view.anchor = new Date("2026-05-04T12:00:00Z");
    view.hourPx = 112;

    view.navigate(1);

    expect(view.hourPx).toBe(112);
    expect(view.anchor.toISOString()).toBe("2026-05-05T12:00:00.000Z");
  });

  it("keeps the selected hour height across week navigation", () => {
    const view = makeView();
    view.visibleDays = 6;
    view.anchor = new Date("2026-05-04T12:00:00Z");
    view.hourPx = 128;

    view.navigate(1);

    expect(view.hourPx).toBe(128);
    expect(view.anchor.toISOString()).toBe("2026-05-11T12:00:00.000Z");
  });

  it("starts a fresh view at the default hour height clamped to the mobile viewport", () => {
    const view = makeView();
    Platform.isMobile = true;
    Platform.isDesktop = false;

    expect(view.hourPx).toBe(DEFAULT_HOUR_PX);
    expect(view.clampHourPxToViewport({ clientHeight: 200 })).toBe(true);
    expect(view.hourPx).toBe(50);
  });
});
