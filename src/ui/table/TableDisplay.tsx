import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PeriodicTable } from "./PeriodicTable";
import { PerimeterLights, perimeterOrigin, type Pulse } from "./PerimeterLights";
import { SetupDrawer, type HandStatus } from "./SetupDrawer";
import { HandPreview } from "./HandPreview";
import { MouseInteractionSource } from "../../adapters/MouseInteractionSource";
import {
  detectWebGLSupport,
  HandInteractionSource,
  type HandFrame,
} from "../../adapters/HandInteractionSource";
import {
  describeCameraError,
  listCameras,
  openCamera,
  stopStream,
  streamLabel,
  type CameraDevice,
} from "../../adapters/camera";
import { useExhibitEventBus } from "../../hooks/useExhibitEventBus";
import { initialInteractionState, reduceInteraction, type InteractionState } from "../../domain/interaction";
import { getCellCenter } from "../../domain/elementLayout";
import {
  CALIBRATION_CORNERS,
  clearCalibration,
  createCalibration,
  createDefaultCalibration,
  isCalibrationValid,
  loadCalibration,
  saveCalibration,
  validateCapturedQuad,
  type Calibration,
} from "../../domain/calibration";
import { reduceDwell, type DwellState } from "../../domain/calibrationDwell";
import { CATEGORY_ORDER, getCategoryColor, getCategoryLabel } from "../../policy/categoryColors";
import { getElement } from "../../data/elements";
import type { Point } from "../../domain/types";

type CalibrationRun = { step: number; captured: Point[]; progress: number };

const HAND_ENABLED_KEY = "periodic-exhibit.hand-enabled.v1";

function wasHandEnabled(): boolean {
  try {
    return localStorage.getItem(HAND_ENABLED_KEY) === "1";
  } catch {
    return false;
  }
}

export function TableDisplay() {
  const surfaceRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  const [interaction, setInteraction] = useState<InteractionState>(initialInteractionState);
  const [confirmToken, setConfirmToken] = useState(0);
  const [pulse, setPulse] = useState<Pulse | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [handStatus, setHandStatus] = useState<HandStatus>({ kind: "off" });
  const [devices, setDevices] = useState<CameraDevice[]>([]);
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [frame, setFrame] = useState<HandFrame | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [calibration, setCalibration] = useState<Calibration | null>(
    () => loadCalibration() ?? createDefaultCalibration(),
  );
  /** A finished capture awaiting the operator's confirmation. */
  const [pending, setPending] = useState<Calibration | null>(null);
  const [run, setRun] = useState<CalibrationRun | null>(null);
  const [handHasSelected, setHandHasSelected] = useState(false);

  const bus = useExhibitEventBus(() => {
    // The table is the authority here; it does not act on its own broadcasts.
  });

  const interactionRef = useRef(interaction);
  interactionRef.current = interaction;

  /** The one path from a pointer sample to exhibit state and events. */
  const handleSample = useCallback(
    (sample: Parameters<Parameters<MouseInteractionSource["start"]>[0]>[0]) => {
      const { state, events } = reduceInteraction(interactionRef.current, sample, performance.now());
      interactionRef.current = state;
      setInteraction(state);

      for (const event of events) {
        bus.publish(event);
        if (event.type === "lightsPulse") {
          setPulse({
            id: performance.now(),
            cue: { category: event.category, intensity: event.intensity },
            origin: perimeterOrigin(state.selected === null ? null : getCellCenter(state.selected)),
          });
        }
        if (event.type === "elementSelected") {
          setConfirmToken((token) => token + 1);
          if (sample.source === "hand") setHandHasSelected(true);
        }
      }
    },
    [bus],
  );

  // Mouse is always live. It is never a shortcut around the controller.
  useEffect(() => {
    const surface = surfaceRef.current;
    if (!surface) return;
    const source = new MouseInteractionSource(surface);
    source.start(handleSample);
    return () => source.stop();
  }, [handleSample]);

  // ---- calibration capture -------------------------------------------------

  const runRef = useRef<CalibrationRun | null>(null);
  runRef.current = run;
  const dwellRef = useRef<DwellState | null>(null);

  const observeFrame = useCallback((next: HandFrame) => {
    setFrame(next);

    const active = runRef.current;
    if (!active) return;

    const result = reduceDwell(dwellRef.current, next.cameraPoint, performance.now());
    dwellRef.current = result.state;

    if (result.kind === "idle") {
      setRun((current) => (current && current.progress !== 0 ? { ...current, progress: 0 } : current));
      return;
    }

    if (result.kind === "holding") {
      setRun((current) =>
        current && Math.abs(current.progress - result.progress) > 0.02
          ? { ...current, progress: result.progress }
          : current,
      );
      return;
    }

    const captured = [...active.captured, result.point];
    if (captured.length < CALIBRATION_CORNERS.length) {
      setRun({ step: captured.length, captured, progress: 0 });
      return;
    }

    setRun(null);

    // Reject a capture that solves but maps to nonsense, with the reason.
    const check = validateCapturedQuad(captured);
    if (!check.ok) {
      setHandStatus({ kind: "error", message: check.reason });
      return;
    }

    const surface = surfaceRef.current;
    const built = createCalibration(captured, {
      cameraLabel: streamLabel(streamRef.current),
      viewport: {
        width: surface?.clientWidth ?? window.innerWidth,
        height: surface?.clientHeight ?? window.innerHeight,
      },
      capturedAt: Date.now(),
    });

    if (!built) {
      setHandStatus({
        kind: "error",
        message: "Those four points did not form a usable transform. Try again, tracing a larger rectangle.",
      });
      return;
    }

    // Nothing is persisted until it has been seen working.
    setPending(built);
  }, []);

  // ---- hand input ----------------------------------------------------------

  const streamRef = useRef<MediaStream | null>(null);
  const sourceRef = useRef<HandInteractionSource | null>(null);
  /**
   * Auto-resume and a manual click can both call enableCamera. Without a
   * generation token the later call tears down the earlier call's stream after
   * the earlier call has already attached it, leaving a landmarker reading a
   * dead video — a camera that looks on but never advances a frame.
   */
  const startGeneration = useRef(0);

  const pendingRef = useRef(pending);
  pendingRef.current = pending;

  const enableCamera = useCallback(async () => {
    const webgl = detectWebGLSupport();
    if (!webgl.supported) {
      setHandStatus({ kind: "error", message: webgl.reason });
      return;
    }

    const generation = (startGeneration.current += 1);
    const superseded = () => generation !== startGeneration.current;

    // Tear down synchronously, so nothing that follows can adopt stale handles.
    sourceRef.current?.stop();
    sourceRef.current = null;
    stopStream(streamRef.current);
    streamRef.current = null;
    setStream(null);
    setFrame(null);
    setHandStatus({ kind: "loading" });

    let stream: MediaStream | null = null;
    let source: HandInteractionSource | null = null;
    try {
      stream = await openCamera(deviceId ?? undefined);
      if (superseded()) return stopStream(stream);

      const video = videoRef.current;
      if (!video) throw new Error("The camera preview is not mounted.");
      video.srcObject = stream;
      await video.play();
      if (superseded()) return stopStream(stream);

      source = new HandInteractionSource({
        video,
        getTransform: () =>
          runRef.current ? null : (pendingRef.current ?? effectiveRef.current).matrix,
        onFrame: observeFrame,
        onFatal: (message) => {
          if (superseded()) return;
          sourceRef.current = null;
          stopStream(streamRef.current);
          streamRef.current = null;
          setStream(null);
          setHandStatus({ kind: "error", message });
        },
      });
      await source.start(handleSample);
      if (superseded()) {
        source.stop();
        return stopStream(stream);
      }

      streamRef.current = stream;
      sourceRef.current = source;
      setStream(stream);
      setDevices(await listCameras());
      setHandStatus({ kind: "ready" });
      try {
        localStorage.setItem(HAND_ENABLED_KEY, "1");
      } catch {
        // A locked-down browser just loses the convenience, not the exhibit.
      }
    } catch (error) {
      source?.stop();
      stopStream(stream);
      if (superseded()) return;
      streamRef.current = null;
      setStream(null);
      setHandStatus({ kind: "error", message: describeCameraError(error) });
    }
  }, [deviceId, handleSample, observeFrame]);

  useEffect(
    () => () => {
      sourceRef.current?.stop();
      stopStream(streamRef.current);
    },
    [],
  );

  // Release the device before the page goes away, so a reload does not find its
  // own previous instance still holding the camera.
  useEffect(() => {
    const release = () => {
      sourceRef.current?.stop();
      stopStream(streamRef.current);
    };
    window.addEventListener("pagehide", release);
    return () => window.removeEventListener("pagehide", release);
  }, []);

  // Come back up the way it went down. Permission is already granted at this
  // point, so this does not prompt; if it fails, the mouse exhibit is intact.
  const autoStarted = useRef(false);
  useEffect(() => {
    if (autoStarted.current || !wasHandEnabled()) return;
    autoStarted.current = true;
    void enableCamera();
  }, [enableCamera]);

  // A corner calibration only holds while the camera and table geometry match.
  // When it no longer does, fall back to the default region rather than quietly
  // applying a mapping that was measured against different geometry.
  const effective = useMemo(() => {
    const surface = surfaceRef.current;
    const valid = isCalibrationValid(calibration, {
      cameraLabel: streamLabel(streamRef.current),
      viewport: {
        width: surface?.clientWidth ?? window.innerWidth,
        height: surface?.clientHeight ?? window.innerHeight,
      },
    });
    return valid && calibration ? calibration : createDefaultCalibration();
  }, [calibration, handStatus]);

  const effectiveRef = useRef(effective);
  effectiveRef.current = effective;

  // ---- presentation --------------------------------------------------------

  const focus = interaction.hovered ?? interaction.selected;
  const focusElement = focus === null ? null : getElement(focus) ?? null;
  const accent = focusElement ? getCategoryColor(focusElement.category) : "#d9b654";
  const activeCategory = focusElement?.category ?? null;

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setDrawerOpen(false);
        setRun(null);
        setPending(null);
        dwellRef.current = null;
      }
      if (event.key.toLowerCase() === "s" && event.metaKey === false && event.ctrlKey === false) {
        setDrawerOpen((open) => !open);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const target = run ? CALIBRATION_CORNERS[run.step] : null;
  const surfaceBox = surfaceRef.current?.getBoundingClientRect();

  return (
    <main
      aria-label="Periodic table display"
      className="stage"
      style={{ ["--accent" as string]: accent }}
    >
      <div className="atmosphere" aria-hidden="true" />
      <PerimeterLights pulse={pulse} />

      <header className="masthead">
        <h1 className="masthead__title">
          The Periodic Table <em>— an interactive exhibit</em>
        </h1>
        <div className="masthead__meta">
          <span className={`status${handStatus.kind === "ready" ? " status--live" : ""}`}>
            <span className="status__dot" />
            <span className="eyebrow">
              {handStatus.kind === "ready"
                ? effective.source === "corners"
                  ? "Hand + mouse"
                  : "Hand · default region"
                : "Mouse input"}
            </span>
          </span>
          <span className="eyebrow">Station 01</span>
          <button
            className={`drawer-toggle${handStatus.kind === "error" ? " drawer-toggle--alert" : ""}`}
            onClick={() => setDrawerOpen(true)}
            aria-expanded={drawerOpen}
          >
            Setup
          </button>
        </div>
      </header>

      <PeriodicTable
        ref={surfaceRef}
        interaction={interaction}
        confirmToken={confirmToken}
        showReticle={interaction.source === "hand"}
      />

      <footer className="footer">
        <div className="legend">
          {CATEGORY_ORDER.map((category) => (
            <span
              key={category}
              className={`legend__item${activeCategory === category ? " legend__item--active" : ""}`}
            >
              <span
                className="legend__swatch"
                style={{ ["--swatch" as string]: getCategoryColor(category) }}
              />
              {getCategoryLabel(category)}
            </span>
          ))}
        </div>
        <p className={`prompt${handHasSelected ? " prompt--hidden" : ""}`}>
          {handStatus.kind === "ready"
            ? "Point, then pinch to choose."
            : "Choose an element to begin."}
        </p>
      </footer>

      {run && target && surfaceBox && (
        <div className="calibration">
          <div
            className="calibration__target"
            style={{
              left: surfaceBox.left + target.target.x * surfaceBox.width,
              top: surfaceBox.top + target.target.y * surfaceBox.height,
              ["--fill" as string]: run.progress,
            }}
          />
          <div className="calibration__center">
            <HandPreview stream={stream} frame={frame} className="calibration__preview" />

            <div className="calibration__caption">
              <p className="eyebrow" style={{ margin: 0 }}>
                Calibration · point {run.step + 1} of {CALIBRATION_CORNERS.length}
              </p>
              <strong>Hold your fingertip on the {target.label.toLowerCase()} marker</strong>
              <p style={{ margin: 0, color: "var(--bone-400)", fontSize: "0.8125rem" }}>
                Keep still until the marker fills. Press Escape to cancel.
              </p>
              {!frame?.landmarks && (
                <p className="calibration__warn eyebrow">
                  No hand visible — move into the camera view
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {pending && (
        <div className="verify">
          <div className="verify__copy">
            <p className="eyebrow" style={{ margin: 0 }}>
              Check the calibration
            </p>
            <strong>Point around the table — the marker should follow your finger</strong>
            <p style={{ margin: 0, color: "var(--bone-400)", fontSize: "0.8125rem" }}>
              Nothing is saved until you confirm. Try a corner and the middle.
            </p>
          </div>
          <div className="verify__actions">
            <button
              className="button button--primary"
              onClick={() => {
                saveCalibration(pending);
                setCalibration(pending);
                setPending(null);
              }}
            >
              Looks right
            </button>
            <button
              className="button"
              onClick={() => {
                setPending(null);
                dwellRef.current = null;
                setRun({ step: 0, captured: [], progress: 0 });
              }}
            >
              Redo
            </button>
          </div>
        </div>
      )}

      <SetupDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        status={handStatus}
        devices={devices}
        selectedDeviceId={deviceId}
        onSelectDevice={(next) => setDeviceId(next)}
        onEnableCamera={enableCamera}
        onOpenInfoWindow={() => {
          window.open("/info", "exhibit-info", "popup=yes,width=1280,height=800");
        }}
        onStartCalibration={() => {
          dwellRef.current = null;
          setPending(null);
          setRun({ step: 0, captured: [], progress: 0 });
          setDrawerOpen(false);
        }}
        onClearCalibration={() => {
          clearCalibration();
          setPending(null);
          setCalibration(createDefaultCalibration());
        }}
        buildReport={() => {
          const video = videoRef.current;
          const track = streamRef.current?.getVideoTracks()[0];
          return JSON.stringify(
            {
              when: new Date().toISOString(),
              userAgent: navigator.userAgent,
              webgl: detectWebGLSupport(),
              handStatus,
              calibrationSource: effective.source,
              calibration: calibration
                ? { cameraLabel: calibration.cameraLabel, viewport: calibration.viewport }
                : null,
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
            },
            null,
            2,
          );
        }}
        onDisableCamera={() => {
          sourceRef.current?.stop();
          sourceRef.current = null;
          stopStream(streamRef.current);
          streamRef.current = null;
          setStream(null);
          setFrame(null);
          setHandStatus({ kind: "off" });
          try {
            localStorage.removeItem(HAND_ENABLED_KEY);
          } catch {
            // ignored
          }
        }}
        calibrationSource={effective.source}
        frame={frame}
        stream={stream}
        videoRef={videoRef}
      />
    </main>
  );
}
