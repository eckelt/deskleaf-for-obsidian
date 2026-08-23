import { describe, expect, it } from "vitest";
import { CAL_COLOR_PALETTE, CAL_TONES, CAL_TONE_FALLBACK, calSwatchColor, calTone } from "../src/types";

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

const MODES = ["light", "dark"] as const;

describe("CAL_TONES", () => {
  it("covers every hue in the palette, in both themes", () => {
    for (const hue of CAL_COLOR_PALETTE) {
      expect(CAL_TONES[hue]?.light, `Hue ${hue} hell`).toBeDefined();
      expect(CAL_TONES[hue]?.dark, `Hue ${hue} dunkel`).toBeDefined();
    }
  });

  it("falls back for a hue outside the palette", () => {
    expect(calTone(999)).toBe(CAL_TONE_FALLBACK);
    expect(calTone(48)).toBe(CAL_TONES[48]);
  });

  it("keeps text on the card readable — WCAG AA on every hue and theme", () => {
    for (const mode of MODES) {
      for (const hue of CAL_COLOR_PALETTE) {
        const { bgS, bgL, txL } = calTone(hue)[mode];
        const ratio = contrast([hue, bgS, bgL], [hue, mode === "dark" ? 95 : 100, txL]);
        expect(ratio, `Hue ${hue} ${mode}: ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it("keeps the series variant readable — it shifts the surface by 6 toward the theme", () => {
    for (const mode of MODES) {
      for (const hue of CAL_COLOR_PALETTE) {
        const { bgS, bgL, txL } = calTone(hue)[mode];
        // hell: Fläche wird dunkler, dunkel: Fläche wird heller
        const seriesL = mode === "light" ? bgL - 6 : bgL + 6;
        const ratio = contrast([hue, bgS, seriesL], [hue, mode === "dark" ? 95 : 100, txL]);
        expect(ratio, `Hue ${hue} ${mode} Serie: ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it("separates the accent bar from the text so both stay distinguishable", () => {
    for (const mode of MODES) {
      for (const hue of CAL_COLOR_PALETTE) {
        const { bdL, txL } = calTone(hue)[mode];
        expect(Math.abs(bdL - txL), `Hue ${hue} ${mode}`).toBeGreaterThanOrEqual(10);
      }
    }
  });

  it("puts the bar on the correct side of the surface in each theme", () => {
    for (const hue of CAL_COLOR_PALETTE) {
      const tone = calTone(hue);
      expect(tone.light.bdL, `Hue ${hue} hell`).toBeLessThan(tone.light.bgL);
      expect(tone.dark.bdL, `Hue ${hue} dunkel`).toBeGreaterThan(tone.dark.bgL);
    }
  });

  it("keeps near-white text on the selected card readable", () => {
    // Der Auswahl-Zustand trug in beiden Themes weiße Schrift auf einer
    // gemeinsamen Fläche von 38 % — bei Gelb 2.7:1, bei Grün 2.4:1.
    for (const hue of CAL_COLOR_PALETTE) {
      const ratio = contrast([hue, 95, calTone(hue).selL], [0, 0, 100]);
      expect(ratio, `Hue ${hue} ausgewählt: ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("keeps the selected card darker than the resting one in light mode", () => {
    for (const hue of CAL_COLOR_PALETTE) {
      const tone = calTone(hue);
      expect(tone.selL, `Hue ${hue}`).toBeLessThan(tone.light.bgL);
    }
  });

  it("pins the two light tones that were specified by hand", () => {
    expect(calTone(48).light).toEqual({ bgS: 100, bgL: 88, bdL: 50, txL: 25 });
    expect(calTone(346).light).toEqual({ bgS: 95, bgL: 88, bdL: 42, txL: 30 });
  });
});

describe("calSwatchColor", () => {
  it("matches the accent bar of the cards it produces", () => {
    for (const hue of CAL_COLOR_PALETTE) {
      expect(calSwatchColor(hue, false)).toBe(`hsl(${hue} 100% ${calTone(hue).light.bdL}%)`);
      expect(calSwatchColor(hue, true)).toBe(`hsl(${hue} 100% ${calTone(hue).dark.bdL}%)`);
    }
  });

  it("gives every palette hue a distinct swatch — no two calendars look alike", () => {
    for (const isDark of [false, true]) {
      const swatches = CAL_COLOR_PALETTE.map((hue) => calSwatchColor(hue, isDark));
      expect(new Set(swatches).size).toBe(CAL_COLOR_PALETTE.length);
    }
  });

  it("falls back for an unknown hue instead of producing NaN", () => {
    expect(calSwatchColor(300, false)).toBe(`hsl(300 100% ${CAL_TONE_FALLBACK.light.bdL}%)`);
    expect(calSwatchColor(300, true)).toBe(`hsl(300 100% ${CAL_TONE_FALLBACK.dark.bdL}%)`);
  });
});
