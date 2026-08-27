import { describe, expect, it } from "vitest";
import { EXHIBIT_CONFIG } from "./config";
import { getCellCenter } from "./elementLayout";
import {
  initialInteractionState,
  reduceInteraction,
  resolvePinchEngaged,
  type InteractionState,
} from "./interaction";
import type { ExhibitEvent, PointerSample } from "./types";

const CARBON = 6;
const GOLD = 79;

function sample(
  over: number | null,
  engaged: boolean,
  over_: Partial<PointerSample> = {},
): PointerSample {
  return {
    point: over === null ? null : getCellCenter(over),
    engaged,
    confidence: 1,
    source: "mouse",
    ...over_,
  };
}

/**
 * Events minus their timestamps. The drivers reach a press at different points
 * in their own sample streams — a finger is already pressed on contact, a mouse
 * presses on a later sample — so the moment differs by construction. The claim
 * under test is that the *selections* and *light cues* are identical, in the
 * same order, not that they happen on the same millisecond.
 */
function withoutTimestamps(events: readonly ExhibitEvent[]) {
  return events.map((event) =>
    event.type === "elementSelected" ? { ...event, timestamp: 0 } : event,
  );
}

/** Drives a list of samples through the reducer, collecting every event emitted. */
function run(samples: PointerSample[], times?: number[]) {
  let state: InteractionState = initialInteractionState;
  const events: ExhibitEvent[] = [];
  samples.forEach((next, index) => {
    const result = reduceInteraction(state, next, times?.[index] ?? index * 10);
    state = result.state;
    events.push(...result.events);
  });
  return { state, events };
}

describe("interaction controller", () => {
  it("moves idle → hover → confirmed and emits both events once", () => {
    const { state, events } = run([sample(CARBON, false), sample(CARBON, true)]);
    expect(state.phase).toBe("confirmed");
    expect(state.selected).toBe(CARBON);
    expect(events).toEqual([
      { type: "elementSelected", atomicNumber: CARBON, timestamp: 10 },
      { type: "lightsPulse", category: "nonmetal", intensity: 1 },
    ]);
  });

  it("does not repeat while the press is held", () => {
    const { state, events } = run([
      sample(CARBON, false),
      sample(CARBON, true),
      sample(CARBON, true),
      sample(CARBON, true),
    ]);
    expect(events.filter((event) => event.type === "elementSelected")).toHaveLength(1);
    expect(state.phase).toBe("cooldown");
  });

  it("arms without confirming when the press lands on an empty cell", () => {
    const { state, events } = run([
      { ...sample(CARBON, false), point: { x: 0.5, y: 0.01 } },
      { ...sample(CARBON, true), point: { x: 0.5, y: 0.01 } },
    ]);
    expect(state.phase).toBe("armed");
    expect(events).toHaveLength(0);
  });

  it("debounces a repeat of the same cell but allows a different one", () => {
    const sameCell = run(
      [sample(CARBON, false), sample(CARBON, true), sample(CARBON, false), sample(CARBON, true)],
      [0, 0, 100, 200],
    );
    expect(sameCell.events.filter((event) => event.type === "elementSelected")).toHaveLength(1);
    expect(sameCell.state.phase).toBe("cooldown");

    const differentCell = run(
      [sample(CARBON, false), sample(CARBON, true), sample(GOLD, false), sample(GOLD, true)],
      [0, 0, 100, 200],
    );
    expect(differentCell.events.filter((event) => event.type === "elementSelected")).toHaveLength(
      2,
    );
  });

  it("allows the same cell again once the debounce window passes", () => {
    const { events } = run(
      [sample(CARBON, false), sample(CARBON, true), sample(CARBON, false), sample(CARBON, true)],
      [0, 0, 10, EXHIBIT_CONFIG.sameCellDebounceMs + 50],
    );
    expect(events.filter((event) => event.type === "elementSelected")).toHaveLength(2);
  });

  it("clears the pointer on tracking loss but keeps the selection", () => {
    const { state } = run([
      sample(CARBON, false),
      sample(CARBON, true),
      sample(CARBON, false),
      { ...sample(CARBON, false), point: null, source: "hand" },
    ]);
    expect(state.phase).toBe("idle");
    expect(state.point).toBeNull();
    expect(state.hovered).toBeNull();
    expect(state.selected).toBe(CARBON);
  });

  it("clears the pointer when hand confidence drops below the threshold", () => {
    const { state } = run([
      { ...sample(GOLD, false), source: "hand" },
      { ...sample(GOLD, false), source: "hand", confidence: EXHIBIT_CONFIG.minConfidence - 0.01 },
    ]);
    expect(state.phase).toBe("idle");
    expect(state.hovered).toBeNull();
  });

  it("produces identical events for mouse, hand and touch over the same cell", () => {
    // Each driver reaches a selection differently. A mouse hovers first, then
    // presses. A hand tracks, then pinches. A finger arrives already pressed
    // and leaves nothing behind. The exhibit events must not be able to tell.
    const mouse = run([sample(GOLD, false), sample(GOLD, true)]);

    const hand = run([
      { ...sample(GOLD, false), source: "hand", confidence: 0.9 },
      { ...sample(GOLD, true), source: "hand", confidence: 0.9 },
    ]);

    const touch = run([
      { ...sample(GOLD, true), source: "touch" },
      { point: null, engaged: false, confidence: 1, source: "touch" },
    ]);

    expect(withoutTimestamps(hand.events)).toEqual(withoutTimestamps(mouse.events));
    expect(withoutTimestamps(touch.events)).toEqual(withoutTimestamps(mouse.events));
  });

  it("keeps the three drivers identical across a realistic multi-cell session", () => {
    // Carbon, then gold, then carbon again after the debounce window.
    const plan = [CARBON, GOLD, CARBON];

    const asMouse = plan
      .flatMap((z) => [
        { ...sample(z, false), source: "mouse" as const },
        { ...sample(z, true), source: "mouse" as const },
        { ...sample(z, false), source: "mouse" as const },
      ])
      .map((s, i) => [s, i * 700] as const);

    const asHand = plan
      .flatMap((z) => [
        { ...sample(z, false), source: "hand" as const, confidence: 0.9 },
        { ...sample(z, true), source: "hand" as const, confidence: 0.9 },
        { ...sample(z, false), source: "hand" as const, confidence: 0.9 },
      ])
      .map((s, i) => [s, i * 700] as const);

    // Touch has no hover, so a contact is press-then-gone.
    const asTouch = plan
      .flatMap((z) => [
        { ...sample(z, true), source: "touch" as const },
        { point: null, engaged: false, confidence: 1, source: "touch" as const },
        { point: null, engaged: false, confidence: 1, source: "touch" as const },
      ])
      .map((s, i) => [s, i * 700] as const);

    const events = (pairs: readonly (readonly [PointerSample, number])[]) =>
      run(
        pairs.map(([s]) => s),
        pairs.map(([, t]) => t),
      ).events;

    const mouseEvents = withoutTimestamps(events(asMouse));
    expect(mouseEvents.filter((e) => e.type === "elementSelected")).toHaveLength(3);
    expect(withoutTimestamps(events(asHand))).toEqual(mouseEvents);
    expect(withoutTimestamps(events(asTouch))).toEqual(mouseEvents);
  });

  it("treats a lifted finger as no pointer at all, unlike a mouse", () => {
    // The behavioural difference the drivers are allowed to have: after a
    // mouse release the cursor still hovers; after a lift there is nothing.
    const afterMouseRelease = run([
      sample(CARBON, false),
      sample(CARBON, true),
      sample(CARBON, false),
    ]);
    expect(afterMouseRelease.state.phase).toBe("hover");
    expect(afterMouseRelease.state.hovered).toBe(CARBON);

    const afterLift = run([
      { ...sample(CARBON, true), source: "touch" },
      { point: null, engaged: false, confidence: 1, source: "touch" },
    ]);
    expect(afterLift.state.phase).toBe("idle");
    expect(afterLift.state.hovered).toBeNull();
    // The selection survives either way — that is what the displays show.
    expect(afterLift.state.selected).toBe(CARBON);
  });
});

describe("pinch hysteresis", () => {
  it("engages at the tight threshold and holds until the release threshold", () => {
    expect(resolvePinchEngaged(false, 0.5)).toBe(false);
    expect(resolvePinchEngaged(false, EXHIBIT_CONFIG.pinchEngage)).toBe(true);
    // Between the thresholds the previous state wins — no flicker.
    expect(resolvePinchEngaged(true, 0.33)).toBe(true);
    expect(resolvePinchEngaged(false, 0.33)).toBe(false);
    expect(resolvePinchEngaged(true, EXHIBIT_CONFIG.pinchRelease)).toBe(false);
  });

  it("treats an unmeasurable pinch as released", () => {
    expect(resolvePinchEngaged(true, Number.NaN)).toBe(false);
  });
});
