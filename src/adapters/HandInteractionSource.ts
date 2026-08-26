import { FilesetResolver, HandLandmarker } from "@mediapipe/tasks-vision";
import { EXHIBIT_CONFIG } from "../domain/config";
import { applyHomography, type Matrix3 } from "../domain/calibration";
import { resolvePinchEngaged } from "../domain/interaction";
import { fingertipPoint, pinchRatio, smoothPoint, type Landmark } from "./handMath";
import type { InteractionSource, Point, PointerSample } from "../domain/types";

const WASM_PATH = "/mediapipe/wasm";
const MODEL_PATH = "/mediapipe/models/hand_landmarker.task";

/** What the setup drawer needs to show, before any calibration is applied. */
export type HandFrame = {
  cameraPoint: Point | null;
  pinch: number;
  confidence: number;
  landmarks: readonly Landmark[] | null;
  fps: number;
  delegate: Delegate;
};

export type Delegate = "GPU" | "CPU";

type Options = {
  video: HTMLVideoElement;
  /** Camera-space → table-space transform. Null while uncalibrated. */
  getTransform: () => Matrix3 | null;
  onFrame?: (frame: HandFrame) => void;
};

/**
 * MediaPipe is a prototype input driver, not the shipping sensor. Everything
 * landmark-shaped stops here: the only thing that leaves is a PointerSample in
 * normalized table space, exactly like a native touch driver would emit.
 */
export class HandInteractionSource implements InteractionSource {
  private landmarker: HandLandmarker | null = null;
  private delegate: Delegate = "GPU";
  private frameHandle = 0;
  private running = false;
  private engaged = false;
  private smoothed: Point | null = null;
  private lastVideoTime = -1;
  private lastFrameAt = 0;
  private fps = 0;

  constructor(private readonly options: Options) {}

  async start(listener: (sample: PointerSample) => void): Promise<void> {
    const fileset = await FilesetResolver.forVisionTasks(WASM_PATH);

    const create = (delegate: Delegate) =>
      HandLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: MODEL_PATH, delegate },
        runningMode: "VIDEO",
        numHands: 1,
        minHandDetectionConfidence: 0.5,
        minHandPresenceConfidence: 0.5,
        minTrackingConfidence: 0.5,
      });

    // The GPU delegate needs a WebGL context, which a browser with hardware
    // acceleration disabled will refuse. CPU inference is slower but works
    // everywhere, and a slower demo beats no demo.
    try {
      this.landmarker = await create("GPU");
      this.delegate = "GPU";
    } catch (gpuError) {
      console.warn("MediaPipe GPU delegate unavailable, falling back to CPU.", gpuError);
      this.landmarker = await create("CPU");
      this.delegate = "CPU";
    }

    this.running = true;
    const tick = () => {
      if (!this.running) return;
      this.detect(listener);
      this.frameHandle = requestAnimationFrame(tick);
    };
    this.frameHandle = requestAnimationFrame(tick);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.frameHandle);
    this.landmarker?.close();
    this.landmarker = null;
    this.smoothed = null;
    this.engaged = false;
  }

  private detect(listener: (sample: PointerSample) => void): void {
    const { video, getTransform, onFrame } = this.options;
    if (!this.landmarker || video.readyState < 2) return;

    // MediaPipe rejects a repeated timestamp, so skip frames the camera has not advanced.
    if (video.currentTime === this.lastVideoTime) return;
    this.lastVideoTime = video.currentTime;

    const now = performance.now();
    if (this.lastFrameAt > 0) {
      const delta = now - this.lastFrameAt;
      if (delta > 0) this.fps = this.fps * 0.85 + (1000 / delta) * 0.15;
    }
    this.lastFrameAt = now;

    let result;
    try {
      result = this.landmarker.detectForVideo(video, now);
    } catch {
      return; // a dropped frame is not a fault
    }

    const landmarks = result.landmarks?.[0] ?? null;
    const confidence = result.handedness?.[0]?.[0]?.score ?? 0;

    if (!landmarks || confidence < EXHIBIT_CONFIG.minConfidence) {
      this.engaged = false;
      this.smoothed = null;
      onFrame?.({
        cameraPoint: null,
        pinch: Number.NaN,
        confidence,
        landmarks: null,
        fps: this.fps,
        delegate: this.delegate,
      });
      listener({ point: null, engaged: false, confidence, source: "hand" });
      return;
    }

    const cameraPoint = fingertipPoint(landmarks);
    const pinch = pinchRatio(landmarks);
    onFrame?.({ cameraPoint, pinch, confidence, landmarks, fps: this.fps, delegate: this.delegate });

    const transform = getTransform();
    if (!cameraPoint || !transform) {
      // Tracking works but the table geometry is unknown: stay out of the way.
      listener({ point: null, engaged: false, confidence, source: "hand" });
      return;
    }

    const tablePoint = applyHomography(transform, cameraPoint);
    if (!tablePoint) {
      listener({ point: null, engaged: false, confidence, source: "hand" });
      return;
    }

    this.smoothed = smoothPoint(this.smoothed, tablePoint);
    this.engaged = resolvePinchEngaged(this.engaged, pinch);
    listener({ point: this.smoothed, engaged: this.engaged, confidence, source: "hand" });
  }
}
