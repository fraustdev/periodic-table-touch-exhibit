import { beforeEach, describe, expect, it, vi } from "vitest";
import { TouchInteractionSource } from "./TouchInteractionSource";
import type { PointerSample } from "../domain/types";

/**
 * jsdom does not implement PointerEvent, and the driver only reads a handful of
 * fields, so a plain Event carrying those fields exercises the real code path.
 */
function pointerEvent(
  type: string,
  fields: {
    pointerId?: number;
    pointerType?: string;
    clientX?: number;
    clientY?: number;
    width?: number;
    height?: number;
  } = {},
): Event {
  const event = new Event(type, { bubbles: true });
  Object.assign(event, {
    pointerId: 1,
    pointerType: "touch",
    clientX: 0,
    clientY: 0,
    width: 20,
    height: 20,
    ...fields,
  });
  return event;
}

/** A 200x100 surface at the origin, so coordinates map predictably. */
function makeSurface(): HTMLElement {
  const surface = document.createElement("div");
  surface.getBoundingClientRect = () =>
    ({ left: 0, top: 0, width: 200, height: 100, right: 200, bottom: 100, x: 0, y: 0 }) as DOMRect;
  document.body.appendChild(surface);
  return surface;
}

describe("TouchInteractionSource", () => {
  let surface: HTMLElement;
  let source: TouchInteractionSource;
  let samples: PointerSample[];

  beforeEach(() => {
    document.body.innerHTML = "";
    surface = makeSurface();
    source = new TouchInteractionSource(surface);
    samples = [];
    source.start((sample) => samples.push(sample));
  });

  it("treats contact as an immediate press, with no hover first", () => {
    surface.dispatchEvent(pointerEvent("pointerdown", { clientX: 100, clientY: 50 }));
    expect(samples).toHaveLength(1);
    expect(samples[0]).toEqual({
      point: { x: 0.5, y: 0.5 },
      engaged: true,
      confidence: 1,
      source: "touch",
    });
  });

  it("reports no pointer at all once the finger lifts", () => {
    surface.dispatchEvent(pointerEvent("pointerdown", { clientX: 50, clientY: 25 }));
    window.dispatchEvent(pointerEvent("pointerup"));
    expect(samples.at(-1)).toEqual({
      point: null,
      engaged: false,
      confidence: 1,
      source: "touch",
    });
  });

  it("treats a cancelled contact the same as a lift", () => {
    surface.dispatchEvent(pointerEvent("pointerdown"));
    window.dispatchEvent(pointerEvent("pointercancel"));
    expect(samples.at(-1)?.point).toBeNull();
  });

  it("tracks the contact while it slides", () => {
    surface.dispatchEvent(pointerEvent("pointerdown", { clientX: 0, clientY: 0 }));
    surface.dispatchEvent(pointerEvent("pointermove", { clientX: 200, clientY: 100 }));
    expect(samples.at(-1)?.point).toEqual({ x: 1, y: 1 });
    expect(samples.at(-1)?.engaged).toBe(true);
  });

  it("rejects a palm-sized contact", () => {
    surface.dispatchEvent(pointerEvent("pointerdown", { width: 120, height: 90 }));
    expect(samples).toHaveLength(0);
  });

  it("ignores a second finger instead of jumping to it", () => {
    surface.dispatchEvent(pointerEvent("pointerdown", { pointerId: 1, clientX: 20, clientY: 10 }));
    surface.dispatchEvent(pointerEvent("pointerdown", { pointerId: 2, clientX: 180, clientY: 90 }));
    surface.dispatchEvent(pointerEvent("pointermove", { pointerId: 2, clientX: 190, clientY: 95 }));
    // Only the first contact was ever reported.
    expect(samples).toHaveLength(1);
    expect(samples[0].point).toEqual({ x: 0.1, y: 0.1 });
  });

  it("accepts the next finger after the first one lifts", () => {
    surface.dispatchEvent(pointerEvent("pointerdown", { pointerId: 1 }));
    window.dispatchEvent(pointerEvent("pointerup", { pointerId: 1 }));
    surface.dispatchEvent(pointerEvent("pointerdown", { pointerId: 2, clientX: 100, clientY: 50 }));
    expect(samples.at(-1)?.point).toEqual({ x: 0.5, y: 0.5 });
  });

  it("leaves mouse input to the mouse driver", () => {
    surface.dispatchEvent(pointerEvent("pointerdown", { pointerType: "mouse" }));
    expect(samples).toHaveLength(0);
  });

  it("accepts a pen as a fingertip", () => {
    surface.dispatchEvent(pointerEvent("pointerdown", { pointerType: "pen" }));
    expect(samples).toHaveLength(1);
  });

  it("detaches every listener on stop", () => {
    const listener = vi.fn();
    source.stop();
    const fresh = new TouchInteractionSource(surface);
    fresh.start(listener);
    fresh.stop();
    surface.dispatchEvent(pointerEvent("pointerdown"));
    window.dispatchEvent(pointerEvent("pointerup"));
    expect(listener).not.toHaveBeenCalled();
  });
});
