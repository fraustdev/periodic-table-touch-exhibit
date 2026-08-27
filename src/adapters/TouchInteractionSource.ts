import type { InteractionSource, PointerSample } from "../domain/types";

/**
 * Largest contact patch treated as a fingertip. A resting palm or forearm
 * reports a much wider region, and on a table-mounted panel it will happen
 * constantly.
 */
const MAX_CONTACT_PX = 60;

/**
 * Native touch input for a panel installation.
 *
 * This is deliberately *not* the mouse driver with a different name. Touch
 * differs in three ways that matter to the exhibit:
 *
 * 1. **There is no hover.** A mouse leaves a cursor resting over a cell after
 *    a click; a finger leaves nothing behind. Release therefore reports an
 *    absent pointer, not a hovering one.
 * 2. **Contact *is* the press.** There is no separate button, so the first
 *    sample of a contact is already engaged.
 * 3. **Extra contacts arrive uninvited.** A panel reports every touch it sees,
 *    including a resting forearm, so one primary contact is tracked and the
 *    rest are ignored.
 *
 * What it emits is identical in shape to every other driver: a `PointerSample`
 * in normalized table space. A test asserts the resulting exhibit events match
 * mouse and hand input exactly.
 */
export class TouchInteractionSource implements InteractionSource {
  private listener: ((sample: PointerSample) => void) | null = null;
  /** The one contact being tracked, or null between touches. */
  private activeId: number | null = null;

  constructor(private readonly surface: HTMLElement) {}

  start(listener: (sample: PointerSample) => void): void {
    this.listener = listener;
    this.surface.addEventListener("pointerdown", this.handleDown);
    this.surface.addEventListener("pointermove", this.handleMove);
    window.addEventListener("pointerup", this.handleUp);
    window.addEventListener("pointercancel", this.handleUp);
  }

  stop(): void {
    this.surface.removeEventListener("pointerdown", this.handleDown);
    this.surface.removeEventListener("pointermove", this.handleMove);
    window.removeEventListener("pointerup", this.handleUp);
    window.removeEventListener("pointercancel", this.handleUp);
    this.listener = null;
    this.activeId = null;
  }

  /** Pen counts as a fingertip; mouse belongs to the other driver. */
  private isTouchLike(event: PointerEvent): boolean {
    return event.pointerType === "touch" || event.pointerType === "pen";
  }

  private isPalm(event: PointerEvent): boolean {
    return event.width > MAX_CONTACT_PX || event.height > MAX_CONTACT_PX;
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
      source: "touch",
    });
  }

  private readonly handleDown = (event: PointerEvent) => {
    if (!this.isTouchLike(event) || this.isPalm(event)) return;
    // A second finger while one is already down is ignored, not swapped to.
    if (this.activeId !== null) return;
    this.activeId = event.pointerId;
    this.emit(event, true);
  };

  private readonly handleMove = (event: PointerEvent) => {
    if (event.pointerId !== this.activeId) return;
    this.emit(event, true);
  };

  private readonly handleUp = (event: PointerEvent) => {
    if (event.pointerId !== this.activeId) return;
    this.activeId = null;
    // Nothing hovers after a finger lifts.
    this.listener?.({ point: null, engaged: false, confidence: 1, source: "touch" });
  };
}
