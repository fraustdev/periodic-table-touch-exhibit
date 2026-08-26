import { describe, expect, it, vi } from "vitest";
import { BrowserEventBus, parseExhibitEvent } from "./BrowserEventBus";

describe("exhibit event validation", () => {
  it("accepts both valid event shapes", () => {
    expect(parseExhibitEvent({ type: "elementSelected", atomicNumber: 6, timestamp: 1 })).toEqual({
      type: "elementSelected",
      atomicNumber: 6,
      timestamp: 1,
    });
    expect(parseExhibitEvent({ type: "lightsPulse", category: "halogen", intensity: 0.5 })).toEqual({
      type: "lightsPulse",
      category: "halogen",
      intensity: 0.5,
    });
  });

  it("rejects malformed messages", () => {
    const rejected = [
      null,
      "elementSelected",
      { type: "somethingElse", atomicNumber: 6, timestamp: 1 },
      { type: "elementSelected", atomicNumber: 0, timestamp: 1 },
      { type: "elementSelected", atomicNumber: 119, timestamp: 1 },
      { type: "elementSelected", atomicNumber: 6, timestamp: Number.NaN },
      { type: "elementSelected", atomicNumber: 6 },
      { type: "lightsPulse", category: "plasma", intensity: 0.5 },
      { type: "lightsPulse", category: "halogen", intensity: 1.5 },
      { type: "lightsPulse", category: "halogen", intensity: -0.1 },
      { type: "lightsPulse", category: "halogen" },
    ];
    for (const value of rejected) expect(parseExhibitEvent(value), JSON.stringify(value)).toBeNull();
  });
});

describe("BrowserEventBus", () => {
  it("delivers published events to local subscribers", () => {
    const bus = new BrowserEventBus("test-local");
    const listener = vi.fn();
    bus.subscribe(listener);
    bus.publish({ type: "elementSelected", atomicNumber: 79, timestamp: 42 });
    expect(listener).toHaveBeenCalledWith({
      type: "elementSelected",
      atomicNumber: 79,
      timestamp: 42,
    });
    bus.close();
  });

  it("stops delivering after unsubscribe and drops invalid publishes", () => {
    const bus = new BrowserEventBus("test-unsub");
    const listener = vi.fn();
    const unsubscribe = bus.subscribe(listener);
    bus.publish({ type: "lightsPulse", category: "noble-gas", intensity: 2 } as never);
    expect(listener).not.toHaveBeenCalled();
    unsubscribe();
    bus.publish({ type: "elementSelected", atomicNumber: 1, timestamp: 1 });
    expect(listener).not.toHaveBeenCalled();
    bus.close();
  });
});

describe("state request", () => {
  it("accepts a bare request and rejects lookalikes", () => {
    expect(parseExhibitEvent({ type: "requestState" })).toEqual({ type: "requestState" });
    expect(parseExhibitEvent({ type: "requeststate" })).toBeNull();
    expect(parseExhibitEvent({ type: "" })).toBeNull();
  });

  it("carries no payload, so nothing can be spoofed through it", () => {
    expect(parseExhibitEvent({ type: "requestState", atomicNumber: 999 })).toEqual({
      type: "requestState",
    });
  });
});
