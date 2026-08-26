export type ElementCategory =
  | "alkali-metal"
  | "alkaline-earth-metal"
  | "transition-metal"
  | "post-transition-metal"
  | "metalloid"
  | "nonmetal"
  | "halogen"
  | "noble-gas"
  | "lanthanide"
  | "actinide"
  | "unknown";

export type Point = { x: number; y: number };
export type GridPosition = { row: number; column: number };

export type ElementRecord = {
  atomicNumber: number;
  symbol: string;
  name: string;
  atomicMass: string;
  category: ElementCategory;
  blurb: string;
  funFact: string;
  gridRow: number;
  gridColumn: number;
  group: number | null;
  period: number;
  block: string;
  phase: string;
  appearance: string | null;
  electronConfiguration: string;
  electronegativity: number | null;
  meltK: number | null;
  boilK: number | null;
  density: number | null;
  discoveredBy: string | null;
};

export type ElementSelectedEvent = {
  type: "elementSelected";
  atomicNumber: number;
  timestamp: number;
};

export type LightsPulseEvent = {
  type: "lightsPulse";
  category: ElementCategory;
  intensity: number;
};

/**
 * Asks whoever owns the selection to re-announce it. A display that opens or
 * reloads mid-session catches up immediately instead of sitting in its attract
 * state until the next visitor touch.
 */
export type RequestStateEvent = { type: "requestState" };

export type ExhibitEvent = ElementSelectedEvent | LightsPulseEvent | RequestStateEvent;

export type LightCue = { category: ElementCategory; intensity: number };

/** A single normalized reading from whatever is currently acting as the pointer. */
export type PointerSample = {
  /** Normalized table-space position, or null when the pointer is absent. */
  point: Point | null;
  /** True while the source reports an active press intent (mouse down, pinch closed). */
  engaged: boolean;
  /** 0..1 tracking confidence. Mouse input always reports 1. */
  confidence: number;
  source: "mouse" | "hand";
};

export type InteractionPhase = "idle" | "hover" | "armed" | "confirmed" | "cooldown";

export interface InteractionSource {
  start(listener: (sample: PointerSample) => void): Promise<void> | void;
  stop(): void;
}

export interface ExhibitEventBus {
  publish(event: ExhibitEvent): void;
  subscribe(listener: (event: ExhibitEvent) => void): () => void;
}

export interface LightOutput {
  pulse(cue: LightCue): void;
  reset(): void;
}
