import { describe, expect, it, vi } from "vitest";
import { detectWebGLSupport } from "./HandInteractionSource";

describe("WebGL preflight", () => {
  it("reports supported when a context can be created", () => {
    const spy = vi
      .spyOn(HTMLCanvasElement.prototype, "getContext")
      .mockReturnValue({} as unknown as RenderingContext);
    expect(detectWebGLSupport().supported).toBe(true);
    spy.mockRestore();
  });

  it("explains the fix when no context is available", () => {
    const spy = vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
    const result = detectWebGLSupport();
    expect(result.supported).toBe(false);
    expect(result.reason).toMatch(/graphics acceleration/i);
    // The operator must know the demo still works.
    expect(result.reason).toMatch(/mouse exhibit is unaffected/i);
    spy.mockRestore();
  });

  it("treats a throwing getContext as unsupported rather than crashing", () => {
    const spy = vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(() => {
      throw new Error("blocked by policy");
    });
    const result = detectWebGLSupport();
    expect(result.supported).toBe(false);
    expect(result.reason).toMatch(/blocked by policy/);
    spy.mockRestore();
  });
});
