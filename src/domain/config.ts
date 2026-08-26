/**
 * Every tunable the demo laptop might need on the day. Nothing gesture-related
 * is allowed to live anywhere else.
 */
export const EXHIBIT_CONFIG = {
  /** Pinch ratio at or below which a press engages. */
  pinchEngage: 0.28,
  /** Pinch ratio at or above which the press releases and can re-arm. */
  pinchRelease: 0.38,
  /** Hand-tracking confidence below this clears the pointer entirely. */
  minConfidence: 0.5,
  /** Re-selecting the same cell is ignored for this long. */
  sameCellDebounceMs: 1_000,
  /** How long a confirmed cell stays visibly confirmed before settling. */
  confirmFlashMs: 420,
  /** Cross-window channel name. */
  channelName: "periodic-exhibit",
  /** Corner-calibration dwell before a point is captured. */
  calibrationHoldMs: 900,
  /** How far the fingertip may wander mid-hold before it counts as drift. */
  calibrationDriftRadius: 0.055,
  /** Sustained drift is a restart; anything briefer is forgiven. */
  calibrationDriftGraceMs: 260,
  /**
   * Fraction of the camera frame trimmed from each edge for the default
   * mapping. The central region maps to the whole table, so hand input does
   * something sensible before anyone calibrates.
   */
  defaultRegionInset: 0.18,
  /** Smallest share of the frame a captured quadrilateral may enclose. */
  minCalibrationArea: 0.03,
} as const;
