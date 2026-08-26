import { EXHIBIT_CONFIG } from "./config";
import type { Point } from "./types";

export type Matrix3 = readonly [number, number, number, number, number, number, number, number, number];

/** The four table corners, captured in this order. */
export const CALIBRATION_CORNERS = [
  { key: "top-left", label: "Top left", target: { x: 0, y: 0 } },
  { key: "top-right", label: "Top right", target: { x: 1, y: 0 } },
  { key: "bottom-right", label: "Bottom right", target: { x: 1, y: 1 } },
  { key: "bottom-left", label: "Bottom left", target: { x: 0, y: 1 } },
] as const;

export type Calibration = {
  matrix: Matrix3;
  cameraLabel: string;
  viewport: { width: number; height: number };
  capturedAt: number;
  /** "default" mappings apply to any camera and are never invalidated. */
  source: "default" | "corners";
};

const STORAGE_KEY = "periodic-exhibit.calibration.v1";

/**
 * The mapping used before anyone calibrates: the central region of the camera
 * frame, axis-aligned, covering the whole table. Hand tracking is therefore
 * useful immediately, and corner calibration becomes a refinement that corrects
 * for an off-axis camera rather than a gate that unlocks the feature.
 */
export function defaultRegionPoints(inset = EXHIBIT_CONFIG.defaultRegionInset): Point[] {
  const low = inset;
  const high = 1 - inset;
  return [
    { x: low, y: low },
    { x: high, y: low },
    { x: high, y: high },
    { x: low, y: high },
  ];
}

export function createDefaultCalibration(): Calibration {
  const matrix = solveHomography(defaultRegionPoints(), CALIBRATION_CORNERS.map((c) => c.target));
  if (!matrix) throw new Error("The default region is degenerate.");
  return {
    matrix,
    cameraLabel: "*",
    viewport: { width: 0, height: 0 },
    capturedAt: 0,
    source: "default",
  };
}

export type QuadCheck = { ok: true } | { ok: false; reason: string };

/** Twice the signed area of a polygon; sign carries the winding direction. */
function signedArea(points: readonly Point[]): number {
  let total = 0;
  for (let i = 0; i < points.length; i += 1) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    total += a.x * b.y - b.x * a.y;
  }
  return total;
}

/**
 * A singular matrix is not the only bad capture. Points taken out of order, or
 * within a tiny patch of the frame, still solve to a transform — one that maps
 * the table onto nonsense. Reject those here, with a reason worth showing.
 */
export function validateCapturedQuad(points: readonly Point[]): QuadCheck {
  if (points.length !== 4) return { ok: false, reason: "Four points are required." };

  const area = Math.abs(signedArea(points)) / 2;
  if (area < EXHIBIT_CONFIG.minCalibrationArea) {
    return {
      ok: false,
      reason:
        "Those four points cover too little of the camera view. Trace a larger rectangle — roughly shoulder width, at arm's length.",
    };
  }

  // Convexity: every turn must bend the same way.
  let sign = 0;
  for (let i = 0; i < 4; i += 1) {
    const a = points[i];
    const b = points[(i + 1) % 4];
    const c = points[(i + 2) % 4];
    const cross = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
    if (Math.abs(cross) < 1e-9) continue;
    const current = Math.sign(cross);
    if (sign === 0) sign = current;
    else if (current !== sign) {
      return {
        ok: false,
        reason:
          "Those points cross over each other. Take them in order: top left, top right, bottom right, bottom left.",
      };
    }
  }

  const [topLeft, topRight, bottomRight, bottomLeft] = points;
  if (topLeft.x >= topRight.x || bottomLeft.x >= bottomRight.x) {
    return {
      ok: false,
      reason: "The left points came out to the right of the right ones. Take them in the order shown.",
    };
  }
  if (topLeft.y >= bottomLeft.y || topRight.y >= bottomRight.y) {
    return {
      ok: false,
      reason: "The top points came out below the bottom ones. Take them in the order shown.",
    };
  }

  return { ok: true };
}

/** Solves the 8x8 system for a projective transform taking src → dst. */
export function solveHomography(src: readonly Point[], dst: readonly Point[]): Matrix3 | null {
  if (src.length !== 4 || dst.length !== 4) return null;

  const rows: number[][] = [];
  for (let i = 0; i < 4; i += 1) {
    const { x, y } = src[i];
    const { x: u, y: v } = dst[i];
    rows.push([x, y, 1, 0, 0, 0, -u * x, -u * y, u]);
    rows.push([0, 0, 0, x, y, 1, -v * x, -v * y, v]);
  }

  // Gaussian elimination with partial pivoting.
  for (let column = 0; column < 8; column += 1) {
    let pivot = column;
    for (let row = column + 1; row < 8; row += 1) {
      if (Math.abs(rows[row][column]) > Math.abs(rows[pivot][column])) pivot = row;
    }
    if (Math.abs(rows[pivot][column]) < 1e-12) return null; // degenerate capture
    [rows[column], rows[pivot]] = [rows[pivot], rows[column]];

    const divisor = rows[column][column];
    for (let k = column; k < 9; k += 1) rows[column][k] /= divisor;

    for (let row = 0; row < 8; row += 1) {
      if (row === column) continue;
      const factor = rows[row][column];
      if (factor === 0) continue;
      for (let k = column; k < 9; k += 1) rows[row][k] -= factor * rows[column][k];
    }
  }

  const h = rows.map((row) => row[8]);
  if (h.some((value) => !Number.isFinite(value))) return null;
  return [h[0], h[1], h[2], h[3], h[4], h[5], h[6], h[7], 1] as Matrix3;
}

export function applyHomography(matrix: Matrix3, point: Point): Point | null {
  const [a, b, c, d, e, f, g, h, i] = matrix;
  const denominator = g * point.x + h * point.y + i;
  if (!Number.isFinite(denominator) || Math.abs(denominator) < 1e-12) return null;
  const x = (a * point.x + b * point.y + c) / denominator;
  const y = (d * point.x + e * point.y + f) / denominator;
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return { x, y };
}

/** Builds a calibration from the four captured camera-space corner points. */
export function createCalibration(
  cameraPoints: readonly Point[],
  meta: { cameraLabel: string; viewport: { width: number; height: number }; capturedAt: number },
): Calibration | null {
  if (!validateCapturedQuad(cameraPoints).ok) return null;
  const matrix = solveHomography(
    cameraPoints,
    CALIBRATION_CORNERS.map((corner) => corner.target),
  );
  if (!matrix) return null;
  return { matrix, ...meta, source: "corners" };
}

/** A calibration only survives while the camera and the table geometry match. */
export function isCalibrationValid(
  calibration: Calibration | null,
  current: { cameraLabel: string; viewport: { width: number; height: number } },
): boolean {
  if (!calibration) return false;
  // The default region is camera- and geometry-agnostic, so nothing invalidates it.
  if (calibration.source === "default") return true;
  if (calibration.cameraLabel !== current.cameraLabel) return false;
  return (
    Math.abs(calibration.viewport.width - current.viewport.width) < 1 &&
    Math.abs(calibration.viewport.height - current.viewport.height) < 1
  );
}

export function loadCalibration(storage: Storage | undefined = safeStorage()): Calibration | null {
  try {
    const raw = storage?.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Calibration;
    if (!Array.isArray(parsed.matrix) || parsed.matrix.length !== 9) return null;
    return { ...parsed, source: parsed.source === "default" ? "default" : "corners" };
  } catch {
    return null;
  }
}

export function saveCalibration(
  calibration: Calibration,
  storage: Storage | undefined = safeStorage(),
): void {
  try {
    storage?.setItem(STORAGE_KEY, JSON.stringify(calibration));
  } catch {
    // A demo laptop with storage disabled still gets a working session.
  }
}

export function clearCalibration(storage: Storage | undefined = safeStorage()): void {
  try {
    storage?.removeItem(STORAGE_KEY);
  } catch {
    // ignored
  }
}

function safeStorage(): Storage | undefined {
  try {
    return typeof localStorage === "undefined" ? undefined : localStorage;
  } catch {
    return undefined;
  }
}
