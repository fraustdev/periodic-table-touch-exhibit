import { describe, expect, it } from "vitest";
import { EXHIBIT_CONFIG } from "./config";
import { reduceDwell, type DwellState } from "./calibrationDwell";
import type { Point } from "./types";

const HOLD = EXHIBIT_CONFIG.calibrationHoldMs;

/** Feeds a sequence of [point, time] pairs through the reducer. */
function run(steps: [Point | null, number][]) {
  let state: DwellState | null = null;
  const captured: Point[] = [];
  let lastProgress = 0;
  for (const [point, now] of steps) {
    const result = reduceDwell(state, point, now);
    state = result.state;
    if (result.kind === "captured") captured.push(result.point);
    if (result.kind === "holding") lastProgress = result.progress;
    if (result.kind === "idle") lastProgress = 0;
  }
  return { state, captured, lastProgress };
}

describe("calibration dwell", () => {
  it("captures the mean of the hold, not the sample that started it", () => {
    // A hand wobbling inside tolerance around (0.5, 0.5).
    const steps: [Point, number][] = [
      [{ x: 0.48, y: 0.52 }, 0],
      [{ x: 0.52, y: 0.48 }, 200],
      [{ x: 0.5, y: 0.5 }, 400],
      [{ x: 0.51, y: 0.49 }, 600],
      [{ x: 0.49, y: 0.51 }, HOLD + 10],
    ];
    const { captured } = run(steps);
    expect(captured).toHaveLength(1);

    // The property that matters: the captured point is closer to the true
    // centre than the single sample that started the hold would have been.
    const truth = { x: 0.5, y: 0.5 };
    const error = (p: Point) => Math.hypot(p.x - truth.x, p.y - truth.y);
    const firstSample = steps[0][0];
    expect(error(captured[0])).toBeLessThan(error(firstSample));
    expect(error(captured[0])).toBeLessThan(0.01);
  });

  it("forgives a momentary excursion instead of restarting the hold", () => {
    const { captured } = run([
      [{ x: 0.5, y: 0.5 }, 0],
      [{ x: 0.5, y: 0.5 }, 300],
      // One bad frame well outside tolerance.
      [{ x: 0.9, y: 0.9 }, 400],
      [{ x: 0.5, y: 0.5 }, 500],
      [{ x: 0.5, y: 0.5 }, HOLD + 10],
    ]);
    expect(captured).toHaveLength(1);
    expect(captured[0].x).toBeCloseTo(0.5, 3);
  });

  it("keeps the wobble out of the average even while forgiving it", () => {
    const { captured } = run([
      [{ x: 0.5, y: 0.5 }, 0],
      [{ x: 0.95, y: 0.95 }, 200],
      [{ x: 0.5, y: 0.5 }, HOLD + 10],
    ]);
    // If the excursion had been averaged in, this would land near 0.65.
    expect(captured[0].x).toBeCloseTo(0.5, 3);
  });

  it("restarts when the fingertip genuinely moves somewhere else", () => {
    const { captured, lastProgress } = run([
      [{ x: 0.3, y: 0.3 }, 0],
      [{ x: 0.3, y: 0.3 }, 200],
      // Sustained past the grace window at a new location.
      [{ x: 0.7, y: 0.7 }, 400],
      [{ x: 0.7, y: 0.7 }, 400 + EXHIBIT_CONFIG.calibrationDriftGraceMs + 50],
    ]);
    expect(captured).toHaveLength(0);
    expect(lastProgress).toBe(0);
  });

  it("reports progress monotonically across a steady hold", () => {
    let state: DwellState | null = null;
    const seen: number[] = [];
    for (const now of [0, HOLD * 0.25, HOLD * 0.5, HOLD * 0.75]) {
      const result = reduceDwell(state, { x: 0.4, y: 0.4 }, now);
      state = result.state;
      if (result.kind === "holding") seen.push(result.progress);
    }
    expect(seen).toEqual([...seen].sort((a, b) => a - b));
    expect(seen[seen.length - 1]).toBeCloseTo(0.75, 2);
  });

  it("goes idle and discards the hold when tracking is lost", () => {
    const { state, captured } = run([
      [{ x: 0.5, y: 0.5 }, 0],
      [{ x: 0.5, y: 0.5 }, 500],
      [null, 600],
      [{ x: 0.5, y: 0.5 }, HOLD + 700],
    ]);
    expect(captured).toHaveLength(0);
    expect(state).not.toBeNull();
  });
});
