import { EXHIBIT_CONFIG } from "./config";
import { hitTestElement } from "./elementLayout";
import { getElement } from "../data/elements";
import type { ExhibitEvent, InteractionPhase, Point, PointerSample } from "./types";

export type InteractionState = {
  phase: InteractionPhase;
  /** Last known normalized pointer position, for drawing the cursor. */
  point: Point | null;
  hovered: number | null;
  /** The element the exhibit is currently presenting. */
  selected: number | null;
  engaged: boolean;
  lastConfirmed: number | null;
  lastConfirmedAt: number;
  source: PointerSample["source"] | null;
};

export const initialInteractionState: InteractionState = {
  phase: "idle",
  point: null,
  hovered: null,
  selected: null,
  engaged: false,
  lastConfirmed: null,
  lastConfirmedAt: Number.NEGATIVE_INFINITY,
  source: null,
};

type InteractionResult = {
  state: InteractionState;
  events: ExhibitEvent[];
};

function isDebounced(state: InteractionState, atomicNumber: number, now: number): boolean {
  return (
    state.lastConfirmed === atomicNumber &&
    now - state.lastConfirmedAt < EXHIBIT_CONFIG.sameCellDebounceMs
  );
}

/**
 * The single place where a stream of pointer samples becomes discrete exhibit
 * events. Mouse and hand input both arrive here, so they cannot drift apart.
 */
export function reduceInteraction(
  state: InteractionState,
  sample: PointerSample,
  now: number,
): InteractionResult {
  // Tracking loss clears the pointer immediately but never the current selection —
  // the info display must keep whatever the last visitor chose.
  if (sample.point === null || sample.confidence < EXHIBIT_CONFIG.minConfidence) {
    return {
      state: { ...state, phase: "idle", point: null, hovered: null, engaged: false, source: null },
      events: [],
    };
  }

  const hovered = hitTestElement(sample.point);
  const pressEdge = sample.engaged && !state.engaged;
  const base: InteractionState = {
    ...state,
    point: sample.point,
    hovered,
    engaged: sample.engaged,
    source: sample.source,
  };

  if (pressEdge && hovered !== null) {
    if (isDebounced(state, hovered, now)) {
      return { state: { ...base, phase: "cooldown" }, events: [] };
    }
    const element = getElement(hovered);
    if (!element) return { state: { ...base, phase: "armed" }, events: [] };

    return {
      state: {
        ...base,
        phase: "confirmed",
        selected: hovered,
        lastConfirmed: hovered,
        lastConfirmedAt: now,
      },
      events: [
        { type: "elementSelected", atomicNumber: hovered, timestamp: now },
        { type: "lightsPulse", category: element.category, intensity: 1 },
      ],
    };
  }

  if (sample.engaged) {
    // Held: either nothing under the pointer to confirm, or already confirmed.
    const phase: InteractionPhase =
      state.phase === "confirmed" || state.phase === "cooldown" ? "cooldown" : "armed";
    return { state: { ...base, phase }, events: [] };
  }

  return { state: { ...base, phase: hovered === null ? "idle" : "hover" }, events: [] };
}

/** Converts a raw pinch measurement into an engaged flag with hysteresis. */
export function resolvePinchEngaged(previousEngaged: boolean, pinchRatio: number): boolean {
  if (!Number.isFinite(pinchRatio)) return false;
  if (previousEngaged) return pinchRatio < EXHIBIT_CONFIG.pinchRelease;
  return pinchRatio <= EXHIBIT_CONFIG.pinchEngage;
}
