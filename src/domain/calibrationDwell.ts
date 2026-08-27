import { EXHIBIT_CONFIG } from "./config";
import type { Point } from "./types";

export type DwellState = {
  /** When the current hold began. */
  since: number;
  /** Every in-tolerance sample of this hold, averaged on capture. */
  samples: readonly Point[];
  centroid: Point;
  /** When the fingertip first left tolerance, or null while steady. */
  driftingSince: number | null;
};

type DwellResult =
  | { kind: "idle"; state: null }
  | { kind: "holding"; state: DwellState; progress: number }
  | { kind: "captured"; state: null; point: Point };

function centroidOf(samples: readonly Point[]): Point {
  const total = samples.reduce((sum, point) => ({ x: sum.x + point.x, y: sum.y + point.y }), {
    x: 0,
    y: 0,
  });
  return { x: total.x / samples.length, y: total.y / samples.length };
}

function begin(point: Point, now: number): DwellState {
  return { since: now, samples: [point], centroid: point, driftingSince: null };
}

/**
 * Hold-to-capture, built for a fingertip held unsupported in mid-air.
 *
 * Two properties matter more than they look. The captured point is the *mean*
 * of the whole hold, not the sample that happened to start it — averaging is
 * the entire reason a dwell beats a single reading. And a brief excursion is
 * forgiven rather than restarting the hold, because an unsupported hand always
 * wobbles, and throwing away a nearly-complete hold over one frame is what
 * makes calibration feel impossible.
 */
export function reduceDwell(
  state: DwellState | null,
  point: Point | null,
  now: number,
): DwellResult {
  if (!point) return { kind: "idle", state: null };
  if (!state) return { kind: "holding", state: begin(point, now), progress: 0 };

  const distance = Math.hypot(point.x - state.centroid.x, point.y - state.centroid.y);

  let next: DwellState;
  if (distance > EXHIBIT_CONFIG.calibrationDriftRadius) {
    const driftingSince = state.driftingSince ?? now;
    if (now - driftingSince > EXHIBIT_CONFIG.calibrationDriftGraceMs) {
      // Sustained: the visitor has moved on to a different spot.
      return { kind: "holding", state: begin(point, now), progress: 0 };
    }
    // Momentary wobble: hold the progress, but do not pollute the average.
    next = { ...state, driftingSince };
  } else {
    const samples = [...state.samples, point];
    next = { since: state.since, samples, centroid: centroidOf(samples), driftingSince: null };
  }

  const progress = Math.min(1, (now - next.since) / EXHIBIT_CONFIG.calibrationHoldMs);
  if (progress >= 1) return { kind: "captured", state: null, point: next.centroid };
  return { kind: "holding", state: next, progress };
}
