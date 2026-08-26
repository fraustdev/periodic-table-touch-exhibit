import "@testing-library/jest-dom/vitest";
import { afterEach, vi } from "vitest";
import { cleanup } from "@testing-library/react";

class BroadcastChannelStub {
  onmessage: ((event: MessageEvent<unknown>) => void) | null = null;
  constructor(public name: string) {}
  postMessage() {}
  close() {}
  addEventListener() {}
  removeEventListener() {}
}

if (typeof globalThis.BroadcastChannel === "undefined") {
  vi.stubGlobal("BroadcastChannel", BroadcastChannelStub);
}

// Vitest runs without globals, so Testing Library's automatic cleanup hook is
// never registered. Without this, renders leak between tests.
afterEach(() => {
  cleanup();
});
