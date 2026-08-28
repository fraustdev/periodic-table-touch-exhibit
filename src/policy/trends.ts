import { elements } from "../data/elements";
import type { ElementRecord } from "../domain/types";

/**
 * Trend overlays: recolour the whole table by a measured property, so the
 * table's structure becomes visible as physics rather than as convention.
 *
 * Colour is never the only channel — the focus card prints the value with
 * units and the legend becomes a labelled scale, so nothing here is readable
 * only by hue.
 */
export type TrendKey = "category" | "melting" | "density" | "electronegativity";

type Trend = {
  key: TrendKey;
  label: string;
  /** Measured value, or null where none exists for this element. */
  value: (element: ElementRecord) => number | null;
  format: (value: number) => string;
  /**
   * Density spans three orders of magnitude, so a linear ramp would render
   * everything except the heavy metals identically.
   */
  scale: "linear" | "log";
  lowLabel: string;
  highLabel: string;
  /** Why this trend is worth looking at, shown while it is active. */
  note: string;
};

const kelvinToCelsius = (k: number) => k - 273.15;

export const TRENDS: Trend[] = [
  {
    key: "category",
    label: "Category",
    value: () => null,
    format: () => "",
    scale: "linear",
    lowLabel: "",
    highLabel: "",
    note: "Grouped by chemical family.",
  },
  {
    key: "melting",
    label: "Melting point",
    value: (element) => element.meltK,
    format: (k) => `${Math.round(kelvinToCelsius(k))} °C`,
    scale: "linear",
    lowLabel: "Helium · −272 °C",
    highLabel: "Tungsten · 3422 °C",
    note: "Where a solid gives way. The refractory metals cluster in the middle of the d-block.",
  },
  {
    key: "density",
    label: "Density",
    value: (element) => element.density,
    format: (d) => (d < 1 ? `${d.toFixed(3)} g/L` : `${d.toFixed(2)} g/cm³`),
    scale: "log",
    lowLabel: "Hydrogen · lightest",
    highLabel: "Osmium · densest",
    note: "Spans three orders of magnitude, so the scale is logarithmic.",
  },
  {
    key: "electronegativity",
    label: "Electronegativity",
    value: (element) => element.electronegativity,
    format: (v) => v.toFixed(2),
    scale: "linear",
    lowLabel: "Cesium · gives electrons away",
    highLabel: "Fluorine · takes them",
    note: "Rises to the right and up. This is the gradient that drives most chemistry.",
  },
];

export function getTrend(key: TrendKey): Trend {
  return TRENDS.find((trend) => trend.key === key) ?? TRENDS[0];
}

type TrendRange = { min: number; max: number; measured: number; missing: number };

/** Observed range across every element that has a value, computed once. */
export function trendRange(trend: Trend): TrendRange {
  const values = elements
    .map((element) => trend.value(element))
    .filter((value): value is number => value !== null && Number.isFinite(value));

  if (values.length === 0) {
    return { min: 0, max: 1, measured: 0, missing: elements.length };
  }
  return {
    min: Math.min(...values),
    max: Math.max(...values),
    measured: values.length,
    missing: elements.length - values.length,
  };
}

/** Position of a value within the trend's range, 0..1, or null if unmeasured. */
export function normalizeTrend(
  trend: Trend,
  range: TrendRange,
  element: ElementRecord,
): number | null {
  const value = trend.value(element);
  if (value === null || !Number.isFinite(value)) return null;

  if (trend.scale === "log") {
    // Guard the floor: a zero or negative value has no logarithm.
    const floor = Math.max(range.min, Number.EPSILON);
    const low = Math.log(floor);
    const high = Math.log(Math.max(range.max, floor * 1.0001));
    const at = Math.log(Math.max(value, floor));
    return Math.min(1, Math.max(0, (at - low) / (high - low)));
  }

  if (range.max === range.min) return 0.5;
  return Math.min(1, Math.max(0, (value - range.min) / (range.max - range.min)));
}

/**
 * A heat ramp, dark violet through to pale gold. Chosen to stay legible against
 * the gallery's near-black ground at every stop, which a hue-only rainbow does
 * not.
 */
const RAMP: readonly [number, [number, number, number]][] = [
  [0.0, [43, 26, 82]],
  [0.25, [123, 35, 130]],
  [0.5, [195, 61, 91]],
  [0.75, [236, 122, 44]],
  [1.0, [247, 214, 122]],
];

/** Shown where a property has never been measured — mostly the superheavies. */
export const NO_DATA_COLOR = "#4a453f";

export function trendColor(position: number | null): string {
  if (position === null) return NO_DATA_COLOR;
  const at = Math.min(1, Math.max(0, position));

  for (let i = 0; i < RAMP.length - 1; i += 1) {
    const [lowStop, low] = RAMP[i];
    const [highStop, high] = RAMP[i + 1];
    if (at > highStop) continue;
    const span = highStop - lowStop;
    const t = span === 0 ? 0 : (at - lowStop) / span;
    const channel = (index: number) => Math.round(low[index] + (high[index] - low[index]) * t);
    return `#${[0, 1, 2].map((index) => channel(index).toString(16).padStart(2, "0")).join("")}`;
  }
  const [, last] = RAMP[RAMP.length - 1];
  return `#${last.map((c) => c.toString(16).padStart(2, "0")).join("")}`;
}

const INK_DARK = "#17130d";
const INK_LIGHT = "#f4eee2";

/** WCAG relative luminance. */
function relativeLuminance(hex: string): number {
  return [1, 3, 5]
    .map((at) => parseInt(hex.slice(at, at + 2), 16) / 255)
    .map((channel) => (channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4))
    .reduce((sum, channel, index) => sum + channel * [0.2126, 0.7152, 0.0722][index], 0);
}

function contrastRatio(a: string, b: string): number {
  const [low, high] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => x - y);
  return (high + 0.05) / (low + 0.05);
}

/**
 * Text colour that stays legible on a given ramp position.
 *
 * The ramp climbs from deep violet to pale gold, so neither a light nor a dark
 * ink works across all of it. Rather than guess a crossover point — an earlier
 * attempt used a luminance threshold and picked the wrong ink through the
 * orange band — this measures both and takes the better one. The worst position
 * on the ramp still reaches about 4:1.
 */
export function trendInk(position: number | null): string {
  const background = trendColor(position);
  return contrastRatio(background, INK_DARK) >= contrastRatio(background, INK_LIGHT)
    ? INK_DARK
    : INK_LIGHT;
}

/**
 * The value at a position on the scale — the inverse of normalizeTrend, so a
 * scale can be labelled at intervals rather than only at its ends.
 */
export function valueAtPosition(trend: Trend, range: TrendRange, position: number): number {
  const at = Math.min(1, Math.max(0, position));
  if (trend.scale === "log") {
    const floor = Math.max(range.min, Number.EPSILON);
    const low = Math.log(floor);
    const high = Math.log(Math.max(range.max, floor * 1.0001));
    return Math.exp(low + (high - low) * at);
  }
  return range.min + (range.max - range.min) * at;
}

type ScaleTick = { at: number; label: string };

/**
 * Labelled ticks for a calibrated scale. Four reads as a scale; more reads as
 * clutter at this size, and two reads as a gradient swatch.
 */
export function scaleTicks(trend: Trend, range: TrendRange): ScaleTick[] {
  if (trend.key === "category") return [];
  return [0, 1 / 3, 2 / 3, 1].map((at) => ({
    at,
    label: trend.format(valueAtPosition(trend, range, at)),
  }));
}

/** CSS gradient for the legend, sampled from the same ramp. */
export function trendGradient(): string {
  const stops = RAMP.map(([at]) => `${trendColor(at)} ${Math.round(at * 100)}%`);
  return `linear-gradient(90deg, ${stops.join(", ")})`;
}
