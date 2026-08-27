import { useCallback, useEffect, useRef, useState } from "react";
import {
  detectWebGLSupport,
  HandInteractionSource,
  type HandFrame,
} from "../adapters/HandInteractionSource";
import {
  describeCameraError,
  listCameras,
  openCamera,
  stopStream,
  streamLabel,
  type CameraDevice,
} from "../adapters/camera";
import type { Matrix3 } from "../domain/calibration";
import type { Point, PointerSample } from "../domain/types";

export type HandStatus =
  { kind: "off" } | { kind: "loading" } | { kind: "ready" } | { kind: "error"; message: string };

const HAND_ENABLED_KEY = "periodic-exhibit.hand-enabled.v1";

function wasHandEnabled(): boolean {
  try {
    return localStorage.getItem(HAND_ENABLED_KEY) === "1";
  } catch {
    return false;
  }
}

function remember(enabled: boolean): void {
  try {
    if (enabled) localStorage.setItem(HAND_ENABLED_KEY, "1");
    else localStorage.removeItem(HAND_ENABLED_KEY);
  } catch {
    // A locked-down browser loses the convenience, not the exhibit.
  }
}

type Options = {
  /** Receives every pointer sample the hand driver produces. */
  onSample: (sample: PointerSample) => void;
  /** Raw camera-space fingertip, for whatever is calibrating. */
  onCameraPoint: (point: Point | null) => void;
  /**
   * Camera-space to table-space transform, read fresh on every frame. A ref
   * rather than a value because calibration and the camera are mutually
   * dependent: calibration needs the camera's label, the camera needs
   * calibration's transform.
   */
  getTransform: React.RefObject<() => Matrix3 | null>;
};

/**
 * Owns the camera and the hand driver: permission, device selection, model
 * startup, teardown, resume across reloads, and the diagnostics the setup
 * drawer reads.
 *
 * Nothing here knows what a periodic table is.
 */
export function useHandTracking({ onSample, onCameraPoint, getTransform }: Options) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const sourceRef = useRef<HandInteractionSource | null>(null);

  const [status, setStatus] = useState<HandStatus>({ kind: "off" });
  const [frame, setFrame] = useState<HandFrame | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [devices, setDevices] = useState<CameraDevice[]>([]);
  const [deviceId, setDeviceId] = useState<string | null>(null);

  /**
   * Auto-resume and a manual click can both call enable(). Without a generation
   * token the later call tears down the earlier call's stream after it has
   * already been attached, leaving a landmarker reading a dead video — a camera
   * that looks on but never advances a frame.
   */
  const generationRef = useRef(0);

  const handleFrame = useCallback(
    (next: HandFrame) => {
      setFrame(next);
      onCameraPoint(next.cameraPoint);
    },
    [onCameraPoint],
  );

  const release = useCallback(() => {
    sourceRef.current?.stop();
    sourceRef.current = null;
    stopStream(streamRef.current);
    streamRef.current = null;
  }, []);

  const enable = useCallback(async () => {
    const webgl = detectWebGLSupport();
    if (!webgl.supported) {
      setStatus({ kind: "error", message: webgl.reason });
      return;
    }

    const generation = (generationRef.current += 1);
    const superseded = () => generation !== generationRef.current;

    // Tear down synchronously, so nothing below can adopt a stale handle.
    release();
    setStream(null);
    setFrame(null);
    setStatus({ kind: "loading" });

    let opened: MediaStream | null = null;
    let source: HandInteractionSource | null = null;
    try {
      opened = await openCamera(deviceId ?? undefined);
      if (superseded()) return stopStream(opened);

      const video = videoRef.current;
      if (!video) throw new Error("The camera preview is not mounted.");
      video.srcObject = opened;
      await video.play();
      if (superseded()) return stopStream(opened);

      source = new HandInteractionSource({
        video,
        getTransform: () => getTransform.current(),
        onFrame: handleFrame,
        onFatal: (message) => {
          if (superseded()) return;
          release();
          setStream(null);
          setStatus({ kind: "error", message });
        },
      });
      await source.start(onSample);
      if (superseded()) {
        source.stop();
        return stopStream(opened);
      }

      streamRef.current = opened;
      sourceRef.current = source;
      setStream(opened);
      setDevices(await listCameras());
      setStatus({ kind: "ready" });
      remember(true);
    } catch (error) {
      source?.stop();
      stopStream(opened);
      if (superseded()) return;
      streamRef.current = null;
      setStream(null);
      setStatus({ kind: "error", message: describeCameraError(error) });
    }
  }, [deviceId, getTransform, handleFrame, onSample, release]);

  const disable = useCallback(() => {
    generationRef.current += 1; // cancel anything in flight
    release();
    setStream(null);
    setFrame(null);
    setStatus({ kind: "off" });
    remember(false);
  }, [release]);

  useEffect(() => release, [release]);

  // Release the device before the page goes away, so a reload does not find its
  // own previous instance still holding the camera.
  useEffect(() => {
    window.addEventListener("pagehide", release);
    return () => window.removeEventListener("pagehide", release);
  }, [release]);

  // Come back up the way it went down. Permission is already granted at this
  // point, so this does not prompt; if it fails, the mouse exhibit is intact.
  const autoStarted = useRef(false);
  useEffect(() => {
    if (autoStarted.current || !wasHandEnabled()) return;
    autoStarted.current = true;
    void enable();
  }, [enable]);

  const reportError = useCallback((message: string) => {
    setStatus({ kind: "error", message });
  }, []);

  /** Everything a diagnostic report needs from the camera side. */
  const describe = useCallback(() => {
    const video = videoRef.current;
    const track = streamRef.current?.getVideoTracks()[0];
    return {
      webgl: detectWebGLSupport(),
      handStatus: status,
      devices,
      selectedDeviceId: deviceId,
      stream: streamRef.current
        ? {
            active: streamRef.current.active,
            tracks: streamRef.current.getTracks().length,
            label: track?.label,
            readyState: track?.readyState,
            enabled: track?.enabled,
            muted: track?.muted,
            settings: track?.getSettings?.(),
          }
        : null,
      video: video
        ? {
            readyState: video.readyState,
            size: `${video.videoWidth}x${video.videoHeight}`,
            paused: video.paused,
            currentTime: video.currentTime,
            hasSrcObject: !!video.srcObject,
            srcMatchesStream: video.srcObject === streamRef.current,
          }
        : null,
      driverAttached: !!sourceRef.current,
      frame: frame
        ? {
            fps: Math.round(frame.fps),
            delegate: frame.delegate,
            confidence: frame.confidence,
            pinch: frame.pinch,
            hasLandmarks: !!frame.landmarks,
            diagnostics: frame.diagnostics,
          }
        : null,
    };
  }, [deviceId, devices, frame, status]);

  return {
    videoRef,
    status,
    frame,
    stream,
    devices,
    deviceId,
    setDeviceId,
    /** Label the current calibration is keyed to. */
    cameraLabel: streamLabel(stream),
    enable,
    disable,
    reportError,
    describe,
  };
}
