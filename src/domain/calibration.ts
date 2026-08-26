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
};

const STORAGE_KEY = "periodic-exhibit.calibration.v1";

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
  const matrix = solveHomography(
    cameraPoints,
    CALIBRATION_CORNERS.map((corner) => corner.target),
  );
  if (!matrix) return null;
  return { matrix, ...meta };
}

/** A calibration only survives while the camera and the table geometry match. */
export function isCalibrationValid(
  calibration: Calibration | null,
  current: { cameraLabel: string; viewport: { width: number; height: number } },
): boolean {
  if (!calibration) return false;
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
    return parsed;
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
