import { describe, it, expect } from "vitest";
import {
  assignColumns,
  calculateAnchoredScrollTop,
  clampHourPx,
  DEFAULT_HOUR_PX,
  heightFromISO,
  snapMins,
  topFromISO,
  minsToTimeStr,
  minsToISO,
} from "../src/event-layout";
import type { CalendarEvent } from "../src/types";

// All tests run with TZ=UTC (set in package.json test script)

function makeEvent(id: string, start: string, end: string): CalendarEvent {
  return { id, title: `Event ${id}`, start, end };
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

  it("uses a custom hour height", () => {
    expect(topFromISO("2026-05-04T12:30:00+00:00", 32)).toBe(400);
    expect(topFromISO("2026-05-04T12:30:00+00:00", 180)).toBe(2250);
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

  it("uses a custom hour height", () => {
    expect(heightFromISO("2026-05-04T10:00:00+00:00", "2026-05-04T11:30:00+00:00", 32)).toBe(48);
    expect(heightFromISO("2026-05-04T10:00:00+00:00", "2026-05-04T11:30:00+00:00", 180)).toBe(270);
  });
});

describe("clampHourPx", () => {
  it("clamps out at the height where a full day fits the viewport", () => {
    expect(clampHourPx(10, 960)).toBe(40);
  });

  it("clamps in at the height where four hours fill the viewport", () => {
    expect(clampHourPx(300, 960)).toBe(240);
  });

  it("keeps values inside the viewport-relative zoom range", () => {
    expect(clampHourPx(80, 960)).toBe(80);
  });
});

describe("calculateAnchoredScrollTop", () => {
  it("keeps the time under the pinch midpoint at the same viewport offset", () => {
    const nextScrollTop = calculateAnchoredScrollTop({
      currentScrollTop: 320,
      anchorOffsetY: 160,
      previousHourPx: 64,
      nextHourPx: 96,
    });

    expect(nextScrollTop).toBe(560);
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
});
