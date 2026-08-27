import { FilesetResolver, HandLandmarker } from "@mediapipe/tasks-vision";
import { EXHIBIT_CONFIG } from "../domain/config";
import { applyHomography, type Matrix3 } from "../domain/calibration";
import { resolvePinchEngaged } from "../domain/interaction";
import { fingertipPoint, pinchRatio, smoothPoint, type Landmark } from "./handMath";
import type { InteractionSource, Point, PointerSample } from "../domain/types";

const WASM_PATH = "/mediapipe/wasm";

/**
 * MediaPipe uploads every frame as a GL texture, so a WebGL context is required
 * even with CPU inference. Without one, the GPU delegate fails to build its
 * graph ("kGpuService ... required by node") and the CPU delegate builds fine
 * but throws on the first frame ("Cannot read properties of undefined (reading
 * 'activeTexture')"). Checking up front turns both into one clear message.
 */
export function detectWebGLSupport(): { supported: boolean; reason: string } {
  try {
    const canvas = document.createElement("canvas");
    const context =
      canvas.getContext("webgl2") ??
      canvas.getContext("webgl") ??
      canvas.getContext("experimental-webgl");
    if (!context) {
      return {
        supported: false,
        reason:
          "This browser cannot create a WebGL context, which MediaPipe requires for every frame. " +
          "Hand tracking is unavailable until it is restored — the mouse exhibit is unaffected. " +
          'In Chrome: Settings → System → "Use graphics acceleration when available", then fully ' +
          "restart the browser. Check chrome://gpu if it stays off.",
      };
    }
    return { supported: true, reason: "" };
  } catch (error) {
    return {
      supported: false,
      reason: `WebGL could not be initialized (${error instanceof Error ? error.message : String(error)}). Hand tracking is unavailable; the mouse exhibit is unaffected.`,
    };
  }
}
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

type Delegate = "GPU" | "CPU";

/**
 * Where the last tick stopped. Every early return in detect() names itself, so
 * a stalled pipeline reports its own cause instead of looking like "no hand".
 */
type PipelineStage =
  | "starting"
  | "no-model"
  | "video-not-ready"
  | "frame-not-advanced"
  | "detect-threw"
  | "no-hand-found"
  | "confidence-too-low"
  | "awaiting-calibration"
  | "tracking";

export const STAGE_LABELS: Record<PipelineStage, string> = {
  starting: "Starting up",
  "no-model": "Model not loaded",
  "video-not-ready": "Camera has no frames yet",
  "frame-not-advanced": "Waiting for the next camera frame",
  "detect-threw": "Model call failed",
  "no-hand-found": "Model ran, found no hand",
  "confidence-too-low": "Hand found, confidence below threshold",
  "awaiting-calibration": "Tracking — needs corner calibration",
  tracking: "Tracking",
};

/** Enough to tell where the pipeline stopped, without opening a debugger. */
type HandDiagnostics = {
  /** The most recent tick's stage. Flickers at animation-frame rate. */
  stage: PipelineStage;
  /**
   * The last stage that actually reached the model. "frame-not-advanced" is a
   * normal idle tick, not a stop, so it never overwrites this — which is what
   * makes the value readable by a human.
   */
  activeStage: PipelineStage;
  /** performance.now() of the last successful model call, or 0. */
  lastDetectionAt: number;
  /** Frames the render loop has attempted. */
  ticks: number;
  /** Frames actually handed to the model. */
  detections: number;
  videoReadyState: number;
  videoSize: string;
  videoPaused: boolean;
  trackState: string;
  detectErrors: number;
  /** Consecutive failures; the loop gives up rather than crashing the wasm. */
  consecutiveErrors: number;
  lastError: string | null;
  /** Frames where the model ran but found no hand. */
  emptyResults: number;
};

/** After this many consecutive failures the driver stops itself. */
const ERROR_LIMIT = 8;

type Options = {
  video: HTMLVideoElement;
  /** Camera-space → table-space transform. Null while uncalibrated. */
  getTransform: () => Matrix3 | null;
  onFrame?: (frame: HandFrame) => void;
  /** Called once when the driver shuts itself down after repeated failures. */
  onFatal?: (message: string) => void;
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
    stage: "starting",
    activeStage: "starting",
    lastDetectionAt: 0,
    ticks: 0,
    detections: 0,
    videoReadyState: 0,
    videoSize: "0×0",
    videoPaused: true,
    trackState: "none",
    detectErrors: 0,
    consecutiveErrors: 0,
    lastError: null,
    emptyResults: 0,
  };

  /** Current diagnostics, for callers that want them outside a frame. */
  getDiagnostics(): HandDiagnostics {
    return { ...this.diagnostics };
  }

  constructor(private readonly options: Options) {}

  async start(listener: (sample: PointerSample) => void): Promise<void> {
    const webgl = detectWebGLSupport();
    if (!webgl.supported) throw new Error(webgl.reason);

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
    diagnostics.trackState = track
      ? `${track.readyState}${track.enabled ? "" : " (disabled)"}`
      : "none";

    /** Always report, even on an early return, so the readout proves liveness. */
    const report = (stage: PipelineStage, over: Partial<HandFrame> = {}) => {
      diagnostics.stage = stage;
      if (stage !== "frame-not-advanced") diagnostics.activeStage = stage;
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
    };

    const clear = (confidence: number) => {
      this.engaged = false;
      this.smoothed = null;
      listener({ point: null, engaged: false, confidence, source: "hand" });
    };

    if (!this.landmarker) {
      report("no-model");
      return;
    }

    if (video.readyState < 2) {
      report("video-not-ready");
      return;
    }

    // MediaPipe rejects a repeated timestamp, so skip frames the camera has not
    // advanced. A frozen currentTime means no frames are arriving at all.
    if (video.currentTime === this.lastVideoTime) {
      report("frame-not-advanced");
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
      diagnostics.consecutiveErrors = 0;
      diagnostics.lastDetectionAt = now;
    } catch (error) {
      diagnostics.detectErrors += 1;
      diagnostics.consecutiveErrors += 1;
      diagnostics.lastError = error instanceof Error ? error.message : String(error);
      report("detect-threw");

      // A failing graph does not recover, and hammering it piles up queued
      // frames until the wasm faults and takes the page down with it.
      if (diagnostics.consecutiveErrors >= ERROR_LIMIT) {
        const message = `Hand tracking stopped after ${ERROR_LIMIT} consecutive failures: ${diagnostics.lastError}. The mouse exhibit is unaffected.`;
        this.stop();
        this.options.onFatal?.(message);
      }
      return;
    }

    const landmarks = result.landmarks?.[0] ?? null;
    const confidence =
      result.handedness?.[0]?.[0]?.score ?? result.handednesses?.[0]?.[0]?.score ?? 0;

    if (!landmarks) {
      diagnostics.emptyResults += 1;
      report("no-hand-found", { confidence });
      clear(confidence);
      return;
    }

    if (confidence < EXHIBIT_CONFIG.minConfidence) {
      report("confidence-too-low", { confidence, landmarks });
      clear(confidence);
      return;
    }

    const cameraPoint = fingertipPoint(landmarks);
    const pinch = pinchRatio(landmarks);
    const transform = getTransform();
    report(transform ? "tracking" : "awaiting-calibration", {
      cameraPoint,
      pinch,
      confidence,
      landmarks,
    });

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
