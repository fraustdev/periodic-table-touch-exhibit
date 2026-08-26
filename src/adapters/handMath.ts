import type { Point } from "../domain/types";

export type Landmark = { x: number; y: number; z?: number };

export const INDEX_TIP = 8;
export const THUMB_TIP = 4;
export const WRIST = 0;
export const MIDDLE_MCP = 9;

function distance(a: Landmark, b: Landmark): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/**
 * Pinch as a fraction of the hand's own size, so it works at any distance from
 * the camera without calibration. Wrist-to-middle-knuckle is the most stable
 * span MediaPipe reports.
 */
export function pinchRatio(landmarks: readonly Landmark[]): number {
  if (landmarks.length <= MIDDLE_MCP) return Number.NaN;
  const span = distance(landmarks[WRIST], landmarks[MIDDLE_MCP]);
  if (span < 1e-6) return Number.NaN;
  return distance(landmarks[THUMB_TIP], landmarks[INDEX_TIP]) / span;
}

/** The index fingertip in camera space, un-mirrored for a selfie-view webcam. */
export function fingertipPoint(landmarks: readonly Landmark[], mirrored = true): Point | null {
  if (landmarks.length <= INDEX_TIP) return null;
  const tip = landmarks[INDEX_TIP];
  if (!Number.isFinite(tip.x) || !Number.isFinite(tip.y)) return null;
  return { x: mirrored ? 1 - tip.x : tip.x, y: tip.y };
}

/** Exponential smoothing, so the on-screen cursor does not jitter. */
export function smoothPoint(previous: Point | null, next: Point, factor = 0.45): Point {
  if (!previous) return next;
  return {
    x: previous.x + (next.x - previous.x) * factor,
    y: previous.y + (next.y - previous.y) * factor,
  };
}
