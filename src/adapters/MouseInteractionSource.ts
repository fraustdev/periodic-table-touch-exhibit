import type { InteractionSource, PointerSample } from "../domain/types";

/**
 * Turns pointer movement over the table surface into normalized samples. The
 * surface element defines table space, so the same normalized coordinates work
 * at any window size.
 */
export class MouseInteractionSource implements InteractionSource {
  private listener: ((sample: PointerSample) => void) | null = null;
  private engaged = false;

  constructor(private readonly surface: HTMLElement) {}

  start(listener: (sample: PointerSample) => void): void {
    this.listener = listener;
    this.surface.addEventListener("pointermove", this.handleMove);
    this.surface.addEventListener("pointerdown", this.handleDown);
    window.addEventListener("pointerup", this.handleUp);
    this.surface.addEventListener("pointerleave", this.handleLeave);
  }

  stop(): void {
    this.surface.removeEventListener("pointermove", this.handleMove);
    this.surface.removeEventListener("pointerdown", this.handleDown);
    window.removeEventListener("pointerup", this.handleUp);
    this.surface.removeEventListener("pointerleave", this.handleLeave);
    this.listener = null;
  }

  private emit(event: PointerEvent, engaged: boolean): void {
    const bounds = this.surface.getBoundingClientRect();
    if (bounds.width === 0 || bounds.height === 0) return;
    this.listener?.({
      point: {
        x: (event.clientX - bounds.left) / bounds.width,
        y: (event.clientY - bounds.top) / bounds.height,
      },
      engaged,
      confidence: 1,
      source: "mouse",
    });
  }

  private readonly handleMove = (event: PointerEvent) => this.emit(event, this.engaged);

  private readonly handleDown = (event: PointerEvent) => {
    this.engaged = true;
    this.emit(event, true);
  };

  private readonly handleUp = (event: PointerEvent) => {
    if (!this.engaged) return;
    this.engaged = false;
    this.emit(event, false);
  };

  private readonly handleLeave = () => {
    this.engaged = false;
    this.listener?.({ point: null, engaged: false, confidence: 1, source: "mouse" });
  };
}
