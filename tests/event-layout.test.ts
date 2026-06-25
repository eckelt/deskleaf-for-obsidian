import { describe, it, expect } from "vitest";
import { DeskleafCalendarView } from "../src/calendar-view";
import {
  assignColumns,
  clampHourPx,
  DEFAULT_HOUR_PX,
  heightFromISO,
  hourPxForPinch,
  scrollTopForZoomAnchor,
  snapMins,
  minsToTimeStr,
  minsToISO,
  topFromISO,
} from "../src/event-layout";
import type { CalendarEvent } from "../src/types";

// All tests run with TZ=UTC (set in package.json test script)

function makeEvent(id: string, start: string, end: string): CalendarEvent {
  return { id, title: `Event ${id}`, start, end };
}

class StyleDeclarations {
  private values = new Map<string, string>();

  setProperty(name: string, value: string): void {
    this.values.set(name, value);
  }

  getPropertyValue(name: string): string {
    return this.values.get(name) ?? "";
  }
}

class CalendarElement {
  readonly dataset: Record<string, string | undefined>;
  readonly style = new StyleDeclarations();
  private readonly matchesBySelector = new Map<string, CalendarElement[]>();

  constructor(dataset: Record<string, string> = {}) {
    this.dataset = { ...dataset };
  }

  setSelectorMatches(selector: string, matches: CalendarElement[]): void {
    this.matchesBySelector.set(selector, matches);
  }

  querySelectorAll(selector: string): CalendarElement[] {
    return this.matchesBySelector.get(selector) ?? [];
  }
}

function applyHourPxToGrid(hourPx: number, grid: CalendarElement): void {
  const method = Reflect.get(DeskleafCalendarView.prototype, "applyHourPxToGrid");
  if (typeof method !== "function") {
    throw new Error("applyHourPxToGrid is not available");
  }
  method.call({ hourPx }, grid);
}

function cssValue(element: CalendarElement, property: string): string {
  return element.style.getPropertyValue(property);
}

describe("topFromISO", () => {
  it("midnight = 0px", () => {
    expect(topFromISO("2026-05-04T00:00:00+00:00")).toBe(0);
  });

  it("08:00 = 8 * DEFAULT_HOUR_PX", () => {
    expect(topFromISO("2026-05-04T08:00:00+00:00")).toBe(8 * DEFAULT_HOUR_PX);
  });

  it("12:30 = 12.5 * DEFAULT_HOUR_PX", () => {
    expect(topFromISO("2026-05-04T12:30:00+00:00")).toBe(12.5 * DEFAULT_HOUR_PX);
  });

  it("23:59 is near day end", () => {
    const top = topFromISO("2026-05-04T23:59:00+00:00");
    expect(top).toBeCloseTo((23 + 59 / 60) * DEFAULT_HOUR_PX, 0);
  });

  it("uses the provided hour height", () => {
    expect(topFromISO("2026-05-04T08:30:00+00:00", 40)).toBe(8.5 * 40);
    expect(topFromISO("2026-05-04T08:30:00+00:00", 180)).toBe(8.5 * 180);
  });
});

describe("heightFromISO", () => {
  it("1 hour = DEFAULT_HOUR_PX", () => {
    expect(heightFromISO("2026-05-04T10:00:00+00:00", "2026-05-04T11:00:00+00:00")).toBe(DEFAULT_HOUR_PX);
  });

  it("30 minutes = DEFAULT_HOUR_PX / 2", () => {
    expect(heightFromISO("2026-05-04T10:00:00+00:00", "2026-05-04T10:30:00+00:00")).toBe(DEFAULT_HOUR_PX / 2);
  });

  it("short events have minimum height of 20px", () => {
    // 5 minutes = 5/60 * 64 ≈ 5.3px, but min is 20
    expect(heightFromISO("2026-05-04T10:00:00+00:00", "2026-05-04T10:05:00+00:00")).toBe(20);
  });

  it("2 hours", () => {
    expect(heightFromISO("2026-05-04T10:00:00+00:00", "2026-05-04T12:00:00+00:00")).toBe(2 * DEFAULT_HOUR_PX);
  });

  it("uses the provided hour height", () => {
    expect(heightFromISO("2026-05-04T10:00:00+00:00", "2026-05-04T12:00:00+00:00", 40)).toBe(80);
    expect(heightFromISO("2026-05-04T10:00:00+00:00", "2026-05-04T12:00:00+00:00", 180)).toBe(360);
  });
});

describe("zoom geometry", () => {
  it("clamps the lower bound so the full day fits the viewport", () => {
    expect(clampHourPx(10, 720)).toBe(30);
  });

  it("clamps the upper bound so exactly four hours fill the viewport", () => {
    expect(clampHourPx(250, 720)).toBe(180);
  });

  it("keeps values inside the viewport-derived bounds unchanged", () => {
    expect(clampHourPx(64, 720)).toBe(64);
  });

  it("derives pinch zoom from touch-distance scale and clamps it", () => {
    expect(hourPxForPinch(64, 100, 150, 720)).toBe(96);
    expect(hourPxForPinch(64, 100, 500, 720)).toBe(180);
    expect(hourPxForPinch(64, 100, 10, 720)).toBe(30);
  });

  it("keeps the time under the pinch midpoint anchored while zooming", () => {
    const scrollTop = scrollTopForZoomAnchor({
      oldHourPx: 60,
      newHourPx: 120,
      scrollTop: 300,
      viewportOffsetY: 150,
    });

    expect(scrollTop).toBe(750);
  });

  it("scales every hour-dependent calendar element with the current zoom level", () => {
    const hourLine = new CalendarElement({ hourOffset: "9" });
    const halfHourLine = new CalendarElement({ hourOffset: "9.5" });
    const timeLabel = new CalendarElement({ hourOffset: "8" });
    const nowLine = new CalendarElement({ hourOffset: "10.25" });
    const businessHours = new CalendarElement({
      hourOffset: "9",
      hourDuration: "8",
    });
    const eventCard = new CalendarElement({
      eventTopHours: "10",
      eventHeightHours: "1.5",
      eventTopOffset: "1",
      eventHeightOffset: "-2",
      eventMinHeight: "0",
    });
    const dragGhost = new CalendarElement({
      eventTopHours: "13",
      eventHeightHours: "0.5",
      eventTopOffset: "0",
      eventHeightOffset: "0",
      eventMinHeight: "14",
    });
    const grid = new CalendarElement();
    grid.setSelectorMatches("[data-hour-offset]", [
      hourLine,
      halfHourLine,
      timeLabel,
      nowLine,
      businessHours,
    ]);
    grid.setSelectorMatches("[data-hour-duration]", [businessHours]);
    grid.setSelectorMatches("[data-event-top-hours]", [eventCard, dragGhost]);

    applyHourPxToGrid(40, grid);

    expect(cssValue(grid, "--f-hour-px")).toBe("40px");
    expect(cssValue(grid, "--f-grid-height")).toBe("960px");
    expect(cssValue(hourLine, "--f-hour-top")).toBe("360px");
    expect(cssValue(halfHourLine, "--f-hour-top")).toBe("380px");
    expect(cssValue(timeLabel, "--f-hour-top")).toBe("320px");
    expect(cssValue(nowLine, "--f-hour-top")).toBe("410px");
    expect(cssValue(businessHours, "--f-hour-top")).toBe("360px");
    expect(cssValue(businessHours, "--f-hour-height")).toBe("320px");
    expect(cssValue(eventCard, "--f-event-top")).toBe("401px");
    expect(cssValue(eventCard, "--f-event-height")).toBe("58px");
    expect(cssValue(dragGhost, "--f-event-top")).toBe("520px");
    expect(cssValue(dragGhost, "--f-event-height")).toBe("20px");

    applyHourPxToGrid(100, grid);

    expect(cssValue(grid, "--f-hour-px")).toBe("100px");
    expect(cssValue(grid, "--f-grid-height")).toBe("2400px");
    expect(cssValue(hourLine, "--f-hour-top")).toBe("900px");
    expect(cssValue(halfHourLine, "--f-hour-top")).toBe("950px");
    expect(cssValue(timeLabel, "--f-hour-top")).toBe("800px");
    expect(cssValue(nowLine, "--f-hour-top")).toBe("1025px");
    expect(cssValue(businessHours, "--f-hour-top")).toBe("900px");
    expect(cssValue(businessHours, "--f-hour-height")).toBe("800px");
    expect(cssValue(eventCard, "--f-event-top")).toBe("1001px");
    expect(cssValue(eventCard, "--f-event-height")).toBe("148px");
    expect(cssValue(dragGhost, "--f-event-top")).toBe("1300px");
    expect(cssValue(dragGhost, "--f-event-height")).toBe("50px");
  });
});

describe("snapMins", () => {
  it("0 stays 0", () => expect(snapMins(0)).toBe(0));
  it("7 snaps to 0", () => expect(snapMins(7)).toBe(0));
  it("8 snaps to 15", () => expect(snapMins(8)).toBe(15));
  it("22 snaps to 15", () => expect(snapMins(22)).toBe(15));
  it("23 snaps to 30", () => expect(snapMins(23)).toBe(30));
  it("60 stays 60", () => expect(snapMins(60)).toBe(60));
  it("90 stays 90", () => expect(snapMins(90)).toBe(90));
});

describe("minsToTimeStr", () => {
  it("0 → 00:00", () => expect(minsToTimeStr(0)).toBe("00:00"));
  it("90 → 01:30", () => expect(minsToTimeStr(90)).toBe("01:30"));
  it("510 → 08:30", () => expect(minsToTimeStr(510)).toBe("08:30"));
  it("1439 → 23:59", () => expect(minsToTimeStr(1439)).toBe("23:59"));
});

describe("minsToISO", () => {
  it("produces a valid ISO 8601 datetime string", () => {
    const result = minsToISO("2026-05-04", 510); // 08:30
    expect(result).toMatch(/^2026-05-04T08:30:00[+-]\d{2}:\d{2}$/);
  });

  it("encodes the date in the output", () => {
    expect(minsToISO("2026-12-31", 0)).toMatch(/^2026-12-31T00:00:00/);
  });
});

describe("assignColumns", () => {
  it("returns empty array for no events", () => {
    expect(assignColumns([])).toEqual([]);
  });

  it("single event gets col=0, totalCols=1", () => {
    const ev = makeEvent("a", "2026-05-04T10:00:00+00:00", "2026-05-04T11:00:00+00:00");
    const result = assignColumns([ev]);
    expect(result).toHaveLength(1);
    expect(result[0].col).toBe(0);
    expect(result[0].totalCols).toBe(1);
  });

  it("two non-overlapping events each get col=0, totalCols=1", () => {
    const a = makeEvent("a", "2026-05-04T09:00:00+00:00", "2026-05-04T10:00:00+00:00");
    const b = makeEvent("b", "2026-05-04T11:00:00+00:00", "2026-05-04T12:00:00+00:00");
    const result = assignColumns([a, b]);
    expect(result.every((r) => r.totalCols === 1)).toBe(true);
    expect(result.every((r) => r.col === 0)).toBe(true);
  });

  it("two overlapping events get totalCols=2, different cols", () => {
    const a = makeEvent("a", "2026-05-04T10:00:00+00:00", "2026-05-04T11:30:00+00:00");
    const b = makeEvent("b", "2026-05-04T10:30:00+00:00", "2026-05-04T12:00:00+00:00");
    const result = assignColumns([a, b]);
    expect(result).toHaveLength(2);
    expect(result.every((r) => r.totalCols === 2)).toBe(true);
    const cols = result.map((r) => r.col).sort();
    expect(cols).toEqual([0, 1]);
  });

  it("three mutually overlapping events get totalCols=3", () => {
    const a = makeEvent("a", "2026-05-04T10:00:00+00:00", "2026-05-04T13:00:00+00:00");
    const b = makeEvent("b", "2026-05-04T10:30:00+00:00", "2026-05-04T12:00:00+00:00");
    const c = makeEvent("c", "2026-05-04T11:00:00+00:00", "2026-05-04T12:30:00+00:00");
    const result = assignColumns([a, b, c]);
    expect(result.every((r) => r.totalCols === 3)).toBe(true);
    const cols = result.map((r) => r.col).sort();
    expect(cols).toEqual([0, 1, 2]);
  });

  it("adjacent events (end === next start) are in separate clusters", () => {
    const a = makeEvent("a", "2026-05-04T09:00:00+00:00", "2026-05-04T10:00:00+00:00");
    const b = makeEvent("b", "2026-05-04T10:00:00+00:00", "2026-05-04T11:00:00+00:00");
    const result = assignColumns([a, b]);
    expect(result.every((r) => r.totalCols === 1)).toBe(true);
  });

  it("keeps overlap columns stable across vertical zoom levels", () => {
    const events = [
      makeEvent("a", "2026-05-04T09:00:00+00:00", "2026-05-04T11:00:00+00:00"),
      makeEvent("b", "2026-05-04T09:30:00+00:00", "2026-05-04T10:30:00+00:00"),
      makeEvent("c", "2026-05-04T10:45:00+00:00", "2026-05-04T12:00:00+00:00"),
    ];
    const columns = assignColumns(events).map((layout) => ({
      id: layout.event.id,
      col: layout.col,
      totalCols: layout.totalCols,
    }));
    const compactGeometry = events.map((event) => ({
      top: topFromISO(event.start, 40),
      height: heightFromISO(event.start, event.end, 40),
    }));
    const detailedGeometry = events.map((event) => ({
      top: topFromISO(event.start, 160),
      height: heightFromISO(event.start, event.end, 160),
    }));

    expect(assignColumns(events).map((layout) => ({
      id: layout.event.id,
      col: layout.col,
      totalCols: layout.totalCols,
    }))).toEqual(columns);
    expect(detailedGeometry[0].top).toBe(compactGeometry[0].top * 4);
    expect(detailedGeometry[0].height).toBe(compactGeometry[0].height * 4);
  });
});
