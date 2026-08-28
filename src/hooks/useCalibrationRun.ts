import { useCallback, useMemo, useRef, useState } from "react";
import {
  CALIBRATION_CORNERS,
  clearCalibration,
  createCalibration,
  createDefaultCalibration,
  isCalibrationValid,
  loadCalibration,
  saveCalibration,
  validateCapturedQuad,
  type Calibration,
  type Matrix3,
} from "../domain/calibration";
import { reduceDwell, type DwellState } from "../domain/calibrationDwell";
import type { Point } from "../domain/types";

type CalibrationRunState = {
  /** Which corner is being captured, 0-indexed. */
  step: number;
  captured: Point[];
  /** Dwell completion for the current corner, 0..1. */
  progress: number;
};

type Options = {
  /** The element defining table space, for keying a capture to its geometry. */
  surfaceRef: React.RefObject<HTMLElement | null>;
  /** Label of the camera in use, so a capture can be invalidated if it changes. */
  cameraLabel: string;
  /** Surfaced to the operator when a capture cannot be used. */
  onError: (message: string) => void;
};

/**
 * Owns the four-corner calibration: the dwell, validation, the confirmation
 * step, persistence, and which transform is currently in force.
 *
 * The transform in force is, in order of precedence: a capture awaiting
 * confirmation, then a stored capture that still matches the camera and
 * geometry, then the default centre region. There is always one, so hand input
 * is never dead for want of calibration.
 */
export function useCalibrationRun({ surfaceRef, cameraLabel, onError }: Options) {
  const [calibration, setCalibration] = useState<Calibration | null>(
    () => loadCalibration() ?? createDefaultCalibration(),
  );
  /** A finished capture awaiting the operator's confirmation. */
  const [pending, setPending] = useState<Calibration | null>(null);
  const [run, setRun] = useState<CalibrationRunState | null>(null);

  const runRef = useRef<CalibrationRunState | null>(null);
  runRef.current = run;
  const dwellRef = useRef<DwellState | null>(null);

  const viewport = useCallback(() => {
    const surface = surfaceRef.current;
    return {
      width: surface?.clientWidth ?? window.innerWidth,
      height: surface?.clientHeight ?? window.innerHeight,
    };
  }, [surfaceRef]);

  /**
   * A corner calibration only holds while the camera and table geometry match.
   * When it no longer does, fall back to the default region rather than quietly
   * applying a mapping measured against different geometry.
   */
  const effective = useMemo(() => {
    const valid = isCalibrationValid(calibration, { cameraLabel, viewport: viewport() });
    return valid && calibration ? calibration : createDefaultCalibration();
  }, [calibration, cameraLabel, viewport]);

  const pendingRef = useRef(pending);
  pendingRef.current = pending;
  const effectiveRef = useRef(effective);
  effectiveRef.current = effective;

  /** Read fresh every frame by the hand driver. */
  const getTransform = useCallback((): Matrix3 | null => {
    // While capturing, the pointer must not also be selecting.
    if (runRef.current) return null;
    return (pendingRef.current ?? effectiveRef.current).matrix;
  }, []);

  const finish = useCallback(
    (captured: Point[]) => {
      setRun(null);

      // A capture can solve to a transform and still map the table onto
      // nonsense, so it is checked before it is offered.
      const check = validateCapturedQuad(captured);
      if (!check.ok) {
        onError(check.reason);
        return;
      }

      const built = createCalibration(captured, {
        cameraLabel,
        viewport: viewport(),
        capturedAt: Date.now(),
      });
      if (!built) {
        onError(
          "Those four points did not form a usable transform. Try again, tracing a larger rectangle.",
        );
        return;
      }

      // Nothing is persisted until it has been seen working.
      setPending(built);
    },
    [cameraLabel, onError, viewport],
  );

  /** Feed every camera-space fingertip reading in while a run is active. */
  const observeCameraPoint = useCallback(
    (point: Point | null) => {
      const active = runRef.current;
      if (!active) return;

      const result = reduceDwell(dwellRef.current, point, performance.now());
      dwellRef.current = result.state;

      if (result.kind === "idle") {
        setRun((current) =>
          current && current.progress !== 0 ? { ...current, progress: 0 } : current,
        );
        return;
      }

      if (result.kind === "holding") {
        setRun((current) =>
          current && Math.abs(current.progress - result.progress) > 0.02
            ? { ...current, progress: result.progress }
            : current,
        );
        return;
      }

      const captured = [...active.captured, result.point];
      if (captured.length < CALIBRATION_CORNERS.length) {
        setRun({ step: captured.length, captured, progress: 0 });
        return;
      }
      finish(captured);
    },
    [finish],
  );

  const start = useCallback(() => {
    dwellRef.current = null;
    setPending(null);
    setRun({ step: 0, captured: [], progress: 0 });
  }, []);

  const cancel = useCallback(() => {
    dwellRef.current = null;
    setRun(null);
    setPending(null);
  }, []);

  const accept = useCallback(() => {
    setPending((current) => {
      if (current) {
        saveCalibration(current);
        setCalibration(current);
      }
      return null;
    });
  }, []);

  const resetToDefault = useCallback(() => {
    clearCalibration();
    setPending(null);
    setCalibration(createDefaultCalibration());
  }, []);

  return {
    /** The transform in force, default or captured. */
    effective,
    pending,
    run,
    /** The corner currently being aimed at, or null when not calibrating. */
    target: run ? CALIBRATION_CORNERS[run.step] : null,
    cornerCount: CALIBRATION_CORNERS.length,
    observeCameraPoint,
    getTransform,
    start,
    cancel,
    accept,
    /** Discard the pending capture and take the four corners again. */
    redo: start,
    resetToDefault,
  };
}
