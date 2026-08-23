import { describe, expect, it } from "vitest";
import { CAL_COLOR_PALETTE, CAL_TONES, CAL_TONE_FALLBACK, calTone } from "../src/types";

// HSL → sRGB → relative Luminanz → WCAG-Kontrast. Die Palette wird im
// Stylesheet als hsl() ausgegeben, also wird hier genau das nachgerechnet.
function rgb(h: number, s: number, l: number): [number, number, number] {
  const S = s / 100;
  const L = l / 100;
  const c = (1 - Math.abs(2 * L - 1)) * S;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = L - c / 2;
  const t: [number, number, number] =
    h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x]
    : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return [t[0] + m, t[1] + m, t[2] + m];
}

function luminance(h: number, s: number, l: number): number {
  const [r, g, b] = rgb(h, s, l).map((v) =>
    v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4),
  );
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: [number, number, number], b: [number, number, number]): number {
  const la = luminance(...a);
  const lb = luminance(...b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

describe("CAL_TONES", () => {
  it("covers every hue in the palette", () => {
    for (const hue of CAL_COLOR_PALETTE) {
      expect(CAL_TONES[hue], `Hue ${hue}`).toBeDefined();
    }
  });

  it("falls back for a hue outside the palette", () => {
    expect(calTone(999)).toBe(CAL_TONE_FALLBACK);
    expect(calTone(48)).toBe(CAL_TONES[48]);
  });

  it("keeps text on the card readable — WCAG AA on every hue", () => {
    for (const hue of CAL_COLOR_PALETTE) {
      const { bgS, bgL, txL } = calTone(hue);
      const ratio = contrast([hue, bgS, bgL], [hue, 100, txL]);
      expect(ratio, `Hue ${hue} liegt bei ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("keeps the series variant readable too — it darkens the surface by 6", () => {
    for (const hue of CAL_COLOR_PALETTE) {
      const { bgS, bgL, txL } = calTone(hue);
      const ratio = contrast([hue, bgS, bgL - 6], [hue, 100, txL]);
      expect(ratio, `Hue ${hue} als Serie liegt bei ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("separates the accent bar from the text so both stay distinguishable", () => {
    for (const hue of CAL_COLOR_PALETTE) {
      const { bdL, txL } = calTone(hue);
      expect(bdL - txL, `Hue ${hue}`).toBeGreaterThanOrEqual(10);
    }
  });

  it("keeps the accent bar darker than the surface it sits on", () => {
    for (const hue of CAL_COLOR_PALETTE) {
      const { bgL, bdL } = calTone(hue);
      expect(bdL, `Hue ${hue}`).toBeLessThan(bgL);
    }
  });

  it("pins the two tones that were specified by hand", () => {
    expect(calTone(48)).toEqual({ bgS: 100, bgL: 88, bdL: 50, txL: 25 });
    expect(calTone(346)).toEqual({ bgS: 95, bgL: 88, bdL: 42, txL: 30 });
  });
});
