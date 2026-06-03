import { describe, it, expect } from "vitest";
import {
  toDateStr,
  toTimeStr,
  parseDate,
  addDays,
  weekStart,
  shortDayLabel,
  get1DayColumn,
  getNDayColumns,
  getWeekColumns,
  rangeHeaderLabel,
  dayHeaderLabel,
  weekHeaderLabel,
  getWeekNumber,
} from "../src/date-utils";

// All tests run with TZ=UTC (set in package.json test script)

describe("toDateStr", () => {
  it("formats a date correctly", () => {
    expect(toDateStr(new Date(2026, 4, 4))).toBe("2026-05-04");
  });

  it("zero-pads month and day", () => {
    expect(toDateStr(new Date(2026, 0, 5))).toBe("2026-01-05");
  });

  it("handles year end", () => {
    expect(toDateStr(new Date(2026, 11, 31))).toBe("2026-12-31");
  });
});

describe("toTimeStr", () => {
  it("formats morning time", () => {
    expect(toTimeStr("2026-05-04T09:30:00+00:00")).toBe("09:30");
  });

  it("formats midnight", () => {
    expect(toTimeStr("2026-05-04T00:00:00+00:00")).toBe("00:00");
  });

  it("formats end of day", () => {
    expect(toTimeStr("2026-05-04T23:59:00+00:00")).toBe("23:59");
  });
});

describe("parseDate", () => {
  it("parses a YYYY-MM-DD string to local midnight", () => {
    const d = parseDate("2026-05-04");
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(4); // 0-indexed
    expect(d.getDate()).toBe(4);
  });

  it("round-trips with toDateStr", () => {
    const str = "2026-03-15";
    expect(toDateStr(parseDate(str))).toBe(str);
  });
});

describe("addDays", () => {
  it("adds positive days", () => {
    expect(toDateStr(addDays(parseDate("2026-05-01"), 10))).toBe("2026-05-11");
  });

  it("subtracts days with negative n", () => {
    expect(toDateStr(addDays(parseDate("2026-05-04"), -4))).toBe("2026-04-30");
  });

  it("crosses a month boundary", () => {
    expect(toDateStr(addDays(parseDate("2026-01-31"), 1))).toBe("2026-02-01");
  });

  it("crosses a year boundary", () => {
    expect(toDateStr(addDays(parseDate("2026-12-31"), 1))).toBe("2027-01-01");
  });
});

describe("weekStart", () => {
  it("Monday stays Monday", () => {
    expect(toDateStr(weekStart(parseDate("2026-05-04")))).toBe("2026-05-04");
  });

  it("Wednesday snaps to Monday", () => {
    expect(toDateStr(weekStart(parseDate("2026-05-06")))).toBe("2026-05-04");
  });

  it("Sunday snaps to the previous Monday", () => {
    expect(toDateStr(weekStart(parseDate("2026-05-10")))).toBe("2026-05-04");
  });

  it("Saturday snaps to the previous Monday", () => {
    expect(toDateStr(weekStart(parseDate("2026-05-09")))).toBe("2026-05-04");
  });
});

describe("getWeekNumber", () => {
  it("KW 1 of 2026 starts on Monday 2026-12-29", () => {
    // ISO week 1 of 2026: Mon 29 Dec 2025 – Sun 4 Jan 2026
    // Actually let me check: KW 1 2026 is the week containing Jan 1
    // Jan 1 2026 is Thursday, so KW 1 starts Mon Dec 29 2025
    expect(getWeekNumber(parseDate("2026-01-01"))).toBe(1);
  });

  it("KW 17 for 2026-04-20", () => {
    expect(getWeekNumber(parseDate("2026-04-20"))).toBe(17);
  });

  it("last week of 2026 is KW 53 or KW 1 of 2027", () => {
    // Dec 31 2026 is Thursday → KW 53
    const kw = getWeekNumber(parseDate("2026-12-31"));
    expect(kw).toBeGreaterThanOrEqual(52);
  });
});

describe("getWeekColumns", () => {
  it("returns 6 columns for a week", () => {
    const cols = getWeekColumns(parseDate("2026-05-04")); // Monday
    expect(cols).toHaveLength(6);
  });

  it("starts on Monday regardless of anchor day", () => {
    const cols = getWeekColumns(parseDate("2026-05-07")); // Thursday
    expect(cols[0].dates[0]).toBe("2026-05-04");
  });

  it("last column pairs Saturday and Sunday", () => {
    const cols = getWeekColumns(parseDate("2026-05-04"));
    expect(cols[5].dates).toHaveLength(2);
    expect(cols[5].dates[0]).toBe("2026-05-09"); // Saturday
    expect(cols[5].dates[1]).toBe("2026-05-10"); // Sunday
  });

  it("Mon–Fri are single-date columns", () => {
    const cols = getWeekColumns(parseDate("2026-05-04"));
    for (let i = 0; i < 5; i++) {
      expect(cols[i].dates).toHaveLength(1);
    }
  });
});

describe("get1DayColumn", () => {
  it("returns exactly one column with the anchor date", () => {
    const cols = get1DayColumn(parseDate("2026-05-04"));
    expect(cols).toHaveLength(1);
    expect(cols[0].dates[0]).toBe("2026-05-04");
  });
});

describe("getNDayColumns", () => {
  it("returns N columns for a weekday anchor", () => {
    const cols = getNDayColumns(parseDate("2026-05-04"), 3); // Monday
    expect(cols).toHaveLength(3);
  });

  it("Saturday and Sunday always paired", () => {
    const cols = getNDayColumns(parseDate("2026-05-08"), 3); // Friday
    const satCol = cols.find((c) => c.dates[0] === "2026-05-09");
    expect(satCol?.dates).toHaveLength(2);
    expect(satCol?.dates[1]).toBe("2026-05-10");
  });

  it("Sunday anchor snaps back to Saturday", () => {
    const cols = getNDayColumns(parseDate("2026-05-10"), 3); // Sunday → snaps to Saturday
    expect(cols[0].dates[0]).toBe("2026-05-09");
    expect(cols[0].dates[1]).toBe("2026-05-10");
  });
});

describe("rangeHeaderLabel", () => {
  it("omits year for current year", () => {
    const label = rangeHeaderLabel(parseDate("2026-04-20"), parseDate("2026-04-23"));
    expect(label).toMatch(/^Mo 20\./);
    expect(label).toMatch(/April$/);
  });
  it("includes year for a different year", () => {
    const label = rangeHeaderLabel(parseDate("2025-04-14"), parseDate("2025-04-17"));
    expect(label).toMatch(/^Mo 14\./);
    expect(label).toMatch(/April 2025$/);
  });
});

describe("dayHeaderLabel", () => {
  it("omits year for current year", () => {
    const label = dayHeaderLabel(parseDate("2026-04-22"));
    expect(label).toBe("Mi, 22. April");
  });
  it("includes year for a different year", () => {
    const label = dayHeaderLabel(parseDate("2025-04-22"));
    expect(label).toBe("Di, 22. April 2025");
  });
});

describe("weekHeaderLabel", () => {
  it("omits year for current year", () => {
    const label = weekHeaderLabel(parseDate("2026-04-20"));
    expect(label).toMatch(/^KW 17/);
    expect(label).toMatch(/April$/);
  });
  it("includes year for a different year", () => {
    const label = weekHeaderLabel(parseDate("2025-04-20"));
    expect(label).toMatch(/^KW 16/);
    expect(label).toMatch(/April 2025$/);
  });
});

describe("shortDayLabel", () => {
  it("formats as weekday + dash + day. Month", () => {
    expect(shortDayLabel(parseDate("2026-05-04"))).toBe("Mo – 4. Mai");
  });
});
