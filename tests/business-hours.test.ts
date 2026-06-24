import { describe, expect, it } from "vitest";
import { getBusinessHoursSegment, parseTimeToMinutes } from "../src/business-hours";
import { DEFAULT_SETTINGS } from "../src/types";

describe("business hours defaults", () => {
  it("defaults to Monday-Friday 09:00-17:00", () => {
    expect(DEFAULT_SETTINGS.businessHours).toEqual({
      enabled: true,
      start: "09:00",
      end: "17:00",
      days: [1, 2, 3, 4, 5],
    });
  });
});

describe("parseTimeToMinutes", () => {
  it("parses valid HH:MM values", () => {
    expect(parseTimeToMinutes("09:30")).toBe(570);
    expect(parseTimeToMinutes("23:59")).toBe(1439);
  });

  it("rejects invalid values", () => {
    expect(parseTimeToMinutes("24:00")).toBeNull();
    expect(parseTimeToMinutes("9:00")).toBeNull();
    expect(parseTimeToMinutes("nope")).toBeNull();
  });
});

describe("getBusinessHoursSegment", () => {
  const settings = DEFAULT_SETTINGS.businessHours;

  it("returns a segment for enabled weekdays", () => {
    expect(getBusinessHoursSegment(new Date(2026, 5, 22), settings)).toEqual({
      topMinutes: 9 * 60,
      durationMinutes: 8 * 60,
    });
  });

  it("returns no segment for weekends by default", () => {
    expect(getBusinessHoursSegment(new Date(2026, 5, 20), settings)).toBeNull();
    expect(getBusinessHoursSegment(new Date(2026, 5, 21), settings)).toBeNull();
  });

  it("returns no segment when disabled", () => {
    expect(getBusinessHoursSegment(new Date(2026, 5, 22), { ...settings, enabled: false })).toBeNull();
  });

  it("returns no segment for invalid or empty ranges", () => {
    expect(getBusinessHoursSegment(new Date(2026, 5, 22), { ...settings, start: "17:00", end: "09:00" })).toBeNull();
    expect(getBusinessHoursSegment(new Date(2026, 5, 22), { ...settings, start: "09:00", end: "09:00" })).toBeNull();
    expect(getBusinessHoursSegment(new Date(2026, 5, 22), { ...settings, start: "invalid" })).toBeNull();
  });
});
