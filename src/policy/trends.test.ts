import { describe, expect, it } from "vitest";
import { elements, getElement } from "../data/elements";
import {
  getTrend,
  NO_DATA_COLOR,
  normalizeTrend,
  trendColor,
  trendGradient,
  scaleTicks,
  trendInk,
  trendRange,
  valueAtPosition,
  TRENDS,
} from "./trends";

describe("trend definitions", () => {
  it("keeps category as the default and the fallback for an unknown key", () => {
    expect(TRENDS[0].key).toBe("category");
    expect(getTrend("melting").key).toBe("melting");
    expect(getTrend("nonsense" as never).key).toBe("category");
  });

  it("covers most of the table for every measured trend", () => {
    for (const trend of TRENDS.filter((t) => t.key !== "category")) {
      const range = trendRange(trend);
      // Gaps are real — the synthetic superheavies have no measured values —
      // but a trend covering less than three quarters is not worth showing.
      expect(range.measured, trend.key).toBeGreaterThan(88);
      expect(range.min).toBeLessThan(range.max);
    }
  });
});

describe("melting point", () => {
  const trend = getTrend("melting");
  const range = trendRange(trend);

  it("puts tungsten at the top and helium at the bottom", () => {
    expect(normalizeTrend(trend, range, getElement(74)!)).toBeCloseTo(1, 5);
    expect(normalizeTrend(trend, range, getElement(2)!)).toBeCloseTo(0, 2);
  });

  it("ranks a refractory metal above a soft one", () => {
    const tungsten = normalizeTrend(trend, range, getElement(74)!)!;
    const lead = normalizeTrend(trend, range, getElement(82)!)!;
    const gallium = normalizeTrend(trend, range, getElement(31)!)!;
    expect(tungsten).toBeGreaterThan(lead);
    expect(lead).toBeGreaterThan(gallium);
  });

  it("formats in degrees Celsius, not kelvin", () => {
    expect(trend.format(getElement(74)!.meltK!)).toBe("3422 °C");
  });
});

describe("density", () => {
  const trend = getTrend("density");
  const range = trendRange(trend);

  it("uses a log scale, so the light elements stay distinguishable", () => {
    expect(trend.scale).toBe("log");
    const hydrogen = normalizeTrend(trend, range, getElement(1)!)!;
    const lithium = normalizeTrend(trend, range, getElement(3)!)!;
    const iron = normalizeTrend(trend, range, getElement(26)!)!;

    // On a linear ramp hydrogen and lithium would both round to zero against a
    // 40 g/cm3 maximum. Log keeps a visible gap.
    expect(lithium - hydrogen).toBeGreaterThan(0.15);
    expect(iron).toBeGreaterThan(lithium);
  });

  it("orders osmium above iron above aluminium", () => {
    const osmium = normalizeTrend(trend, range, getElement(76)!)!;
    const iron = normalizeTrend(trend, range, getElement(26)!)!;
    const aluminium = normalizeTrend(trend, range, getElement(13)!)!;
    expect(osmium).toBeGreaterThan(iron);
    expect(iron).toBeGreaterThan(aluminium);
  });

  it("labels a gas in grams per litre and a solid in grams per cubic centimetre", () => {
    expect(trend.format(0.08988)).toMatch(/g\/L$/);
    expect(trend.format(22.59)).toMatch(/g\/cm³$/);
  });
});

describe("electronegativity", () => {
  const trend = getTrend("electronegativity");
  const range = trendRange(trend);

  it("puts fluorine at the top and cesium at the bottom", () => {
    expect(normalizeTrend(trend, range, getElement(9)!)).toBeCloseTo(1, 5);
    expect(normalizeTrend(trend, range, getElement(55)!)).toBeCloseTo(0, 5);
  });

  it("rises to the right across a period", () => {
    const across = [3, 4, 5, 6, 7, 8, 9]
      .map((z) => normalizeTrend(trend, range, getElement(z)!))
      .filter((v): v is number => v !== null);
    expect(across).toEqual([...across].sort((a, b) => a - b));
  });
});

describe("unmeasured properties", () => {
  it("returns null rather than inventing a value", () => {
    const trend = getTrend("electronegativity");
    const range = trendRange(trend);
    // Noble gases have no Pauling value; neither do most superheavies.
    expect(normalizeTrend(trend, range, getElement(2)!)).toBeNull();
    expect(normalizeTrend(trend, range, getElement(10)!)).toBeNull();
  });

  it("renders a distinct no-data colour", () => {
    expect(trendColor(null)).toBe(NO_DATA_COLOR);
    expect(trendColor(0.5)).not.toBe(NO_DATA_COLOR);
  });

  it("never leaves an element without a colour", () => {
    for (const trend of TRENDS) {
      const range = trendRange(trend);
      for (const element of elements) {
        const colour = trendColor(normalizeTrend(trend, range, element));
        expect(colour, `${trend.key} / ${element.symbol}`).toMatch(/^#[0-9a-f]{6}$/i);
      }
    }
  });
});

describe("the colour ramp", () => {
  it("produces a valid hex colour across the whole range", () => {
    for (let at = 0; at <= 1.0001; at += 0.05) {
      expect(trendColor(at)).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  it("clamps out-of-range positions instead of wrapping", () => {
    expect(trendColor(-3)).toBe(trendColor(0));
    expect(trendColor(9)).toBe(trendColor(1));
  });

  it("gets brighter as it climbs, so the scale reads without a legend", () => {
    const luminance = (hex: string) => {
      const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const samples = [0, 0.25, 0.5, 0.75, 1].map((at) => luminance(trendColor(at)));
    expect(samples).toEqual([...samples].sort((a, b) => a - b));
  });

  it("builds a legend gradient from the same stops", () => {
    const gradient = trendGradient();
    expect(gradient).toContain("linear-gradient(90deg");
    expect(gradient).toContain(trendColor(0));
    expect(gradient).toContain(trendColor(1));
  });
});

describe("legible ink", () => {
  it("uses dark ink at the pale end and light ink at the deep end", () => {
    expect(trendInk(1)).toBe("#17130d");
    expect(trendInk(0)).toBe("#f4eee2");
  });

  it("picks whichever ink actually measures better, not a guessed threshold", () => {
    // The orange band around 0.7 is where a naive luminance cutoff chose light
    // ink and dropped below 3:1.
    expect(trendInk(0.7)).toBe("#17130d");
    expect(trendInk(0.3)).toBe("#f4eee2");
  });

  it("keeps every ramp position above a readable contrast ratio", () => {
    const channels = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
    const relative = (hex: string) =>
      channels(hex)
        .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
        .reduce((sum, c, i) => sum + c * [0.2126, 0.7152, 0.0722][i], 0);

    for (let at = 0; at <= 1.0001; at += 0.05) {
      const bg = relative(trendColor(at));
      const fg = relative(trendInk(at));
      const ratio = (Math.max(bg, fg) + 0.05) / (Math.min(bg, fg) + 0.05);
      // 3:1 is the large-text threshold; the symbol is set very large.
      expect(ratio, `position ${at.toFixed(2)}`).toBeGreaterThan(3);
    }
  });

  it("has an ink for the no-data colour too", () => {
    expect(trendInk(null)).toMatch(/^#[0-9a-f]{6}$/i);
  });
});

describe("calibrated scale", () => {
  it("inverts the normalization, on both linear and log scales", () => {
    for (const key of ["melting", "density", "electronegativity"] as const) {
      const trend = getTrend(key);
      const range = trendRange(trend);
      for (const at of [0, 0.25, 0.5, 0.75, 1]) {
        const value = valueAtPosition(trend, range, at);
        const back = trend.scale === "log" ? value : value;
        // Round-trip through the real element path by faking a record.
        const position = normalizeTrend(trend, range, {
          meltK: back,
          density: back,
          electronegativity: back,
        } as never);
        expect(position, `${key} @ ${at}`).toBeCloseTo(at, 5);
      }
    }
  });

  it("labels four ticks, ascending, with the trend's own units", () => {
    const trend = getTrend("melting");
    const ticks = scaleTicks(trend, trendRange(trend));
    expect(ticks).toHaveLength(4);
    expect(ticks.map((t) => t.at)).toEqual([0, 1 / 3, 2 / 3, 1]);
    for (const tick of ticks) expect(tick.label).toMatch(/°C$/);
  });

  it("gives the category mode no scale at all", () => {
    const trend = getTrend("category");
    expect(scaleTicks(trend, trendRange(trend))).toEqual([]);
  });

  it("spaces log ticks by ratio, not by difference", () => {
    const trend = getTrend("density");
    const range = trendRange(trend);
    const values = scaleTicks(trend, range).map((t) => valueAtPosition(trend, range, t.at));
    // Equal ratios between successive ticks is what a log scale means.
    const ratios = values.slice(1).map((v, i) => v / values[i]);
    for (const ratio of ratios.slice(1)) expect(ratio).toBeCloseTo(ratios[0], 3);
  });
});
