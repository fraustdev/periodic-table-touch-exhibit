import { EXHIBIT_CONFIG } from "../domain/config";
import { isValidAtomicNumber } from "../data/elements";
import { isCategory } from "../policy/categoryColors";
import type { ExhibitEvent, ExhibitEventBus } from "../domain/types";

/**
 * Validates at the boundary so a malformed cross-window message can never reach
 * a display. Anything unrecognized is dropped silently — an exhibit does not
 * show error dialogs to visitors.
 */
export function parseExhibitEvent(value: unknown): ExhibitEvent | null {
  if (typeof value !== "object" || value === null) return null;
  const candidate = value as Record<string, unknown>;

  if (candidate.type === "elementSelected") {
    if (!isValidAtomicNumber(candidate.atomicNumber)) return null;
    if (typeof candidate.timestamp !== "number" || !Number.isFinite(candidate.timestamp)) return null;
    return {
      type: "elementSelected",
      atomicNumber: candidate.atomicNumber,
      timestamp: candidate.timestamp,
    };
  }

  if (candidate.type === "requestState") return { type: "requestState" };

  if (candidate.type === "lightsPulse") {
    if (!isCategory(candidate.category)) return null;
    const { intensity } = candidate;
    if (typeof intensity !== "number" || !Number.isFinite(intensity)) return null;
    if (intensity < 0 || intensity > 1) return null;
    return { type: "lightsPulse", category: candidate.category, intensity };
  }

  return null;
}

/**
 * Delivers every event to local subscribers and, when the browser supports it,
 * to the other window. The table's own light output is a local subscriber; the
 * info window is a remote one.
 */
export class BrowserEventBus implements ExhibitEventBus {
  private readonly listeners = new Set<(event: ExhibitEvent) => void>();
  private readonly channel: BroadcastChannel | null;

  constructor(channelName: string = EXHIBIT_CONFIG.channelName) {
    this.channel = typeof BroadcastChannel === "function" ? new BroadcastChannel(channelName) : null;
    if (this.channel) {
      this.channel.onmessage = (message: MessageEvent<unknown>) => {
        const event = parseExhibitEvent(message.data);
        if (event) this.deliver(event);
      };
    }
  }

  publish(event: ExhibitEvent): void {
    const valid = parseExhibitEvent(event);
    if (!valid) return;
    this.deliver(valid);
    this.channel?.postMessage(valid);
  }

  subscribe(listener: (event: ExhibitEvent) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  close(): void {
    this.listeners.clear();
    this.channel?.close();
  }

  private deliver(event: ExhibitEvent): void {
    for (const listener of this.listeners) listener(event);
  }
}
