import { describe, expect, it } from "vitest";
import { fingertipPoint, pinchRatio, smoothPoint, type Landmark } from "./handMath";

/** Builds a 21-landmark hand where the pinch gap and overall scale are explicit. */
function hand({
  gap,
  scale,
  tip,
}: {
  gap: number;
  scale: number;
  tip?: { x: number; y: number };
}): Landmark[] {
  const landmarks: Landmark[] = Array.from({ length: 21 }, () => ({ x: 0, y: 0 }));
  landmarks[0] = { x: 0.5, y: 0.5 }; // wrist
  landmarks[9] = { x: 0.5, y: 0.5 - scale }; // middle knuckle, scale above the wrist
  landmarks[4] = { x: 0.5, y: 0.2 }; // thumb tip
  landmarks[8] = tip ? { ...tip } : { x: 0.5 + gap, y: 0.2 }; // index tip
  if (tip) landmarks[4] = { x: tip.x - gap, y: tip.y };
  return landmarks;
}

describe("hand math", () => {
  it("measures pinch relative to hand size, not absolute distance", () => {
    // Same gesture, hand twice as close to the camera: same ratio.
    const near = pinchRatio(hand({ gap: 0.04, scale: 0.2 }));
    const far = pinchRatio(hand({ gap: 0.02, scale: 0.1 }));
    expect(near).toBeCloseTo(far, 6);
    expect(near).toBeCloseTo(0.2, 6);
  });

  it("reports a wide-open hand as a large ratio", () => {
    expect(pinchRatio(hand({ gap: 0.2, scale: 0.2 }))).toBeCloseTo(1, 6);
  });

  it("returns NaN for unusable landmark data", () => {
    expect(pinchRatio([])).toBeNaN();
    expect(pinchRatio(hand({ gap: 0.04, scale: 0 }))).toBeNaN();
  });

  it("un-mirrors the fingertip so pointing right moves the cursor right", () => {
    const landmarks = hand({ gap: 0.05, scale: 0.2, tip: { x: 0.8, y: 0.3 } });
    const mirrored = fingertipPoint(landmarks)!;
    expect(mirrored.x).toBeCloseTo(0.2, 6);
    expect(mirrored.y).toBeCloseTo(0.3, 6);
    expect(fingertipPoint(landmarks, false)).toEqual({ x: 0.8, y: 0.3 });
    expect(fingertipPoint([])).toBeNull();
  });

  it("smooths toward the new point without overshooting", () => {
    expect(smoothPoint(null, { x: 0.4, y: 0.6 })).toEqual({ x: 0.4, y: 0.6 });
    const smoothed = smoothPoint({ x: 0, y: 0 }, { x: 1, y: 1 }, 0.5);
    expect(smoothed).toEqual({ x: 0.5, y: 0.5 });
  });
});
