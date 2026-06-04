import { describe, it, expect } from "vitest";
import { locationIconSvg, clockIconSvg } from "../src/calendar-view";

// AC1: Ist `location` auf einem Event befüllt und die Card-Höhe erlaubt die Anzeige des
// Ortstexts (> 42px), erscheint unmittelbar vor dem Ortstext ein Standort-Pin-Icon.
describe("locationIconSvg (AC1-Proxy)", () => {
  it("returns a string containing a valid <svg> opening tag", () => {
    const svg = locationIconSvg(12);
    expect(svg).toMatch(/<svg[^>]*>/);
  });

  it("returns a string containing at least one <path> element", () => {
    const svg = locationIconSvg(12);
    expect(svg).toMatch(/<path[^/]*/);
  });
});

// AC2: Vor der angezeigten Startzeit jeder timed Event-Card erscheint ein Uhr-Icon.
describe("clockIconSvg (AC2-Proxy)", () => {
  it("returns a string containing a valid <svg> opening tag", () => {
    const svg = clockIconSvg(12);
    expect(svg).toMatch(/<svg[^>]*>/);
  });

  it("returns a string containing at least one <path> element", () => {
    const svg = clockIconSvg(12);
    expect(svg).toMatch(/<path[^/]*/);
  });
});

// AC3: Die Icons übernehmen die Textfarbe ihres jeweiligen Containers (currentColor).
describe("color inheritance via currentColor (AC3)", () => {
  it("locationIconSvg uses fill=\"currentColor\" or omits fill so currentColor applies", () => {
    const svg = locationIconSvg(12);
    // Either explicitly set to currentColor, or no fill attribute at all (inherits currentColor).
    const hasFillCurrentColor = /fill="currentColor"/.test(svg);
    const hasNoFill = !/fill="/.test(svg);
    expect(hasFillCurrentColor || hasNoFill).toBe(true);
  });

  it("clockIconSvg uses fill=\"currentColor\" or omits fill so currentColor applies", () => {
    const svg = clockIconSvg(12);
    const hasFillCurrentColor = /fill="currentColor"/.test(svg);
    const hasNoFill = !/fill="/.test(svg);
    expect(hasFillCurrentColor || hasNoFill).toBe(true);
  });
});

// AC4: Icon-Größe und vertikaler Ausrichtung fügen sich ohne Zeilenumbruch in den
// bestehenden Einzeiler ein; die `size`-Zahl wird als width/height übernommen.
describe("size parameter sets width and height (AC4)", () => {
  it("locationIconSvg sets width to the given size", () => {
    const svg = locationIconSvg(16);
    expect(svg).toContain('width="16"');
  });

  it("locationIconSvg sets height to the given size", () => {
    const svg = locationIconSvg(16);
    expect(svg).toContain('height="16"');
  });

  it("clockIconSvg sets width to the given size", () => {
    const svg = clockIconSvg(16);
    expect(svg).toContain('width="16"');
  });

  it("clockIconSvg sets height to the given size", () => {
    const svg = clockIconSvg(16);
    expect(svg).toContain('height="16"');
  });

  it("locationIconSvg reflects a different size value", () => {
    const svg = locationIconSvg(8);
    expect(svg).toContain('width="8"');
    expect(svg).toContain('height="8"');
  });

  it("clockIconSvg reflects a different size value", () => {
    const svg = clockIconSvg(8);
    expect(svg).toContain('width="8"');
    expect(svg).toContain('height="8"');
  });
});

// AC5: All-day-Chips und Removal-Hint erhalten keine Icons.
// Sentinel: locationIconSvg and clockIconSvg exist as named exports (not default) —
// guarantees the integration points can be imported correctly.
describe("named exports exist (AC5-Sentinel)", () => {
  it("locationIconSvg is a named export and is a function", () => {
    expect(typeof locationIconSvg).toBe("function");
  });

  it("clockIconSvg is a named export and is a function", () => {
    expect(typeof clockIconSvg).toBe("function");
  });
});
