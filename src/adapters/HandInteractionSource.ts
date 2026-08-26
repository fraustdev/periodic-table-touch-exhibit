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
  diagnostics: HandDiagnostics;
};

export type Delegate = "GPU" | "CPU";

/** Enough to tell where the pipeline stopped, without opening a debugger. */
export type HandDiagnostics = {
  /** Frames the render loop has attempted. */
  ticks: number;
  /** Frames actually handed to the model. */
  detections: number;
  videoReadyState: number;
  videoSize: string;
  videoPaused: boolean;
  trackState: string;
  detectErrors: number;
  lastError: string | null;
  /** Frames where the model ran but found no hand. */
  emptyResults: number;
};

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
  private diagnostics: HandDiagnostics = {
    ticks: 0,
    detections: 0,
    videoReadyState: 0,
    videoSize: "0×0",
    videoPaused: true,
    trackState: "none",
    detectErrors: 0,
    lastError: null,
    emptyResults: 0,
  };

  /** Current diagnostics, for callers that want them outside a frame. */
  getDiagnostics(): HandDiagnostics {
    return { ...this.diagnostics };
  }

  constructor(private readonly options: Options) {}

  async start(listener: (sample: PointerSample) => void): Promise<void> {
    const fileset = await FilesetResolver.forVisionTasks(WASM_PATH);

    const create = (delegate: Delegate) =>
      HandLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: MODEL_PATH, delegate },
        runningMode: "VIDEO",
        numHands: 1,
        minHandDetectionConfidence: 0.35,
        minHandPresenceConfidence: 0.35,
        minTrackingConfidence: 0.35,
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
    const diagnostics = this.diagnostics;

    diagnostics.ticks += 1;
    diagnostics.videoReadyState = video.readyState;
    diagnostics.videoSize = `${video.videoWidth}×${video.videoHeight}`;
    diagnostics.videoPaused = video.paused;
    const track = (video.srcObject as MediaStream | null)?.getVideoTracks?.()[0];
    diagnostics.trackState = track ? `${track.readyState}${track.enabled ? "" : " (disabled)"}` : "none";

    /** Always report, even on an early return, so the readout proves liveness. */
    const report = (over: Partial<HandFrame> = {}) =>
      onFrame?.({
        cameraPoint: null,
        pinch: Number.NaN,
        confidence: 0,
        landmarks: null,
        fps: this.fps,
        delegate: this.delegate,
        diagnostics: { ...diagnostics },
        ...over,
      });

    const clear = (confidence: number) => {
      this.engaged = false;
      this.smoothed = null;
      listener({ point: null, engaged: false, confidence, source: "hand" });
    };

    if (!this.landmarker) {
      report();
      return;
    }

    if (video.readyState < 2) {
      report();
      return;
    }

    // MediaPipe rejects a repeated timestamp, so skip frames the camera has not
    // advanced. A frozen currentTime means no frames are arriving at all.
    if (video.currentTime === this.lastVideoTime) {
      report();
      return;
    }
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
      diagnostics.detections += 1;
    } catch (error) {
      diagnostics.detectErrors += 1;
      diagnostics.lastError = error instanceof Error ? error.message : String(error);
      report();
      return;
    }

    const landmarks = result.landmarks?.[0] ?? null;
    const confidence = result.handedness?.[0]?.[0]?.score ?? result.handednesses?.[0]?.[0]?.score ?? 0;

    if (!landmarks) {
      diagnostics.emptyResults += 1;
      report({ confidence });
      clear(confidence);
      return;
    }

    if (confidence < EXHIBIT_CONFIG.minConfidence) {
      report({ confidence, landmarks });
      clear(confidence);
      return;
    }

    const cameraPoint = fingertipPoint(landmarks);
    const pinch = pinchRatio(landmarks);
    report({ cameraPoint, pinch, confidence, landmarks });

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
