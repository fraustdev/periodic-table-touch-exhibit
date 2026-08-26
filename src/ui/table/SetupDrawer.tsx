import { HandPreview } from "./HandPreview";
import type { CameraDevice } from "../../adapters/camera";
import { STAGE_LABELS, type HandFrame } from "../../adapters/HandInteractionSource";
import { EXHIBIT_CONFIG } from "../../domain/config";

export type HandStatus =
  | { kind: "off" }
  | { kind: "loading" }
  | { kind: "ready" }
  | { kind: "error"; message: string };

type Props = {
  open: boolean;
  onClose: () => void;
  status: HandStatus;
  devices: CameraDevice[];
  selectedDeviceId: string | null;
  onSelectDevice: (deviceId: string) => void;
  onEnableCamera: () => void;
  onDisableCamera: () => void;
  buildReport: () => string;
  onStartCalibration: () => void;
  onOpenInfoWindow: () => void;
  onClearCalibration: () => void;
  calibrationSource: "default" | "corners" | null;
  frame: HandFrame | null;
  stream: MediaStream | null;
  videoRef: React.RefObject<HTMLVideoElement | null>;
};


/**
 * Operator-only surface. Camera video and landmarks live in here and nowhere
 * else — a visitor must never see a computer-vision debug view.
 */
/**
 * A single readable answer to "is hand tracking working?". Built from the last
 * stage that reached the model, never from the instantaneous tick, which
 * alternates with idle frames too fast to read.
 */
function describeVerdict(frame: HandFrame | null): { text: string; tone: "good" | "warn" | "bad" } {
  if (!frame) return { text: "Not started", tone: "warn" };
  const { activeStage, detectErrors, consecutiveErrors, lastDetectionAt } = frame.diagnostics;

  if (consecutiveErrors > 0 || activeStage === "detect-threw") {
    return { text: `Model is failing (${detectErrors} errors)`, tone: "bad" };
  }
  if (lastDetectionAt > 0 && performance.now() - lastDetectionAt > 1_500) {
    return { text: "Camera has stalled — no new frames", tone: "bad" };
  }
  switch (activeStage) {
    case "tracking":
      return { text: "Working — tracking your hand", tone: "good" };
    case "awaiting-calibration":
      return { text: "Working — calibrate the corners to select", tone: "warn" };
    case "no-hand-found":
      return { text: "Working — no hand in view", tone: "warn" };
    case "confidence-too-low":
      return { text: "Hand seen, but too faint to trust", tone: "warn" };
    case "video-not-ready":
      return { text: "Camera has not produced a frame yet", tone: "bad" };
    case "no-model":
      return { text: "Model is not loaded", tone: "bad" };
    default:
      return { text: "Starting up", tone: "warn" };
  }
}

export function SetupDrawer({
  open,
  onClose,
  status,
  devices,
  selectedDeviceId,
  onSelectDevice,
  onEnableCamera,
  onDisableCamera,
  buildReport,
  onStartCalibration,
  onOpenInfoWindow,
  onClearCalibration,
  calibrationSource,
  frame,
  stream,
  videoRef,
}: Props) {
  const pinch = frame && Number.isFinite(frame.pinch) ? frame.pinch : null;
  const verdict = describeVerdict(frame);

  return (
    <aside className={`drawer${open ? " drawer--open" : ""}`} aria-hidden={!open} aria-label="Exhibit setup">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <h2>Setup</h2>
        <button className="drawer-toggle" onClick={onClose}>
          Close
        </button>
      </div>

      <p>
        The exhibit is fully operable with a mouse. Hand tracking is an optional input driver and can
        be enabled here.
      </p>

      {status.kind === "error" && <div className="notice">{status.message}</div>}
      {frame && frame.diagnostics.detectErrors > 0 && frame.diagnostics.lastError && (
        <div className="notice">
          <strong>Model call failed {frame.diagnostics.detectErrors}×.</strong>{" "}
          {frame.diagnostics.lastError}
        </div>
      )}
      {status.kind === "ready" && calibrationSource === "default" && (
        <div className="notice">
          Using the default camera region: the middle of the frame maps to the whole table. Calibrate
          the corners if the pointer feels offset, or if the camera is off to one side.
        </div>
      )}

      {frame && (
        <p className={`verdict verdict--${verdict.tone}`}>
          <span className="verdict__dot" />
          {verdict.text}
        </p>
      )}

      <div className="drawer__field">
        <span className="eyebrow">Displays</span>
        <div className="drawer__row">
          <button className="button" onClick={onOpenInfoWindow}>
            Open info display
          </button>
        </div>
        <p style={{ fontSize: "0.6875rem" }}>
          Drag the new window to the second monitor and make it full screen. It reconnects on its
          own if it is reloaded.
        </p>
      </div>

      <div className="drawer__row">
        <button
          className="button button--primary"
          onClick={onEnableCamera}
          disabled={status.kind === "loading"}
        >
          {status.kind === "loading"
            ? "Loading model…"
            : status.kind === "ready"
              ? "Restart camera"
              : "Enable camera"}
        </button>
        <button
          className="button"
          onClick={onStartCalibration}
          disabled={status.kind !== "ready"}
        >
          Calibrate corners
        </button>
        {calibrationSource === "corners" && (
          <button className="button" onClick={onClearCalibration}>
            Reset to default
          </button>
        )}
        {status.kind === "ready" && (
          <button className="button" onClick={onDisableCamera}>
            Turn off
          </button>
        )}
      </div>

      {devices.length > 1 && (
        <label className="drawer__field">
          <span className="eyebrow">Camera</span>
          <select
            value={selectedDeviceId ?? ""}
            onChange={(event) => onSelectDevice(event.target.value)}
          >
            {devices.map((device) => (
              <option key={device.deviceId} value={device.deviceId}>
                {device.label}
              </option>
            ))}
          </select>
        </label>
      )}

      <HandPreview stream={stream} frame={frame} videoRef={videoRef} />

      <dl className="readout">
        <dt>Input</dt>
        <dd>{status.kind === "ready" ? "Mouse + hand" : "Mouse"}</dd>
        <dt>Calibration</dt>
        <dd>
          {calibrationSource === "corners"
            ? "Four corners"
            : calibrationSource === "default"
              ? "Default region"
              : "None"}
        </dd>
        <dt>Pipeline</dt>
        <dd>{frame ? STAGE_LABELS[frame.diagnostics.activeStage] : "Not started"}</dd>
        <dt>Tracking</dt>
        <dd>{frame?.landmarks ? `${Math.round((frame.confidence ?? 0) * 100)}%` : "No hand"}</dd>
        <dt>Pinch</dt>
        <dd>
          {pinch === null ? "—" : pinch.toFixed(3)}
          {pinch !== null && pinch <= EXHIBIT_CONFIG.pinchEngage ? " · closed" : ""}
        </dd>
        <dt>Detect rate</dt>
        <dd>
          {frame && frame.fps > 0 ? `${frame.fps.toFixed(0)} fps` : "—"}
          {frame ? ` · ${frame.delegate}` : ""}
        </dd>
      </dl>

      <div className="drawer__row">
        <button
          className="button"
          onClick={() => {
            const report = buildReport();
            void navigator.clipboard?.writeText(report).catch(() => {});
            console.log(report);
          }}
        >
          Copy diagnostics
        </button>
      </div>

      {frame && (
        <details>
          <summary className="eyebrow" style={{ cursor: "pointer" }}>
            Pipeline diagnostics
          </summary>
          <dl className="readout" style={{ marginTop: "0.6rem" }}>
            <dt>Video</dt>
            <dd>
              {frame.diagnostics.videoSize} · ready {frame.diagnostics.videoReadyState} ·{" "}
              {frame.diagnostics.videoPaused ? "paused" : "playing"}
            </dd>
            <dt>Track</dt>
            <dd>{frame.diagnostics.trackState}</dd>
            <dt>Frames</dt>
            <dd>
              {frame.diagnostics.detections} detected / {frame.diagnostics.ticks} ticks
            </dd>
            <dt>No hand found</dt>
            <dd>{frame.diagnostics.emptyResults}</dd>
            <dt>Detect errors</dt>
            <dd>{frame.diagnostics.detectErrors}</dd>
          </dl>
          {frame.diagnostics.lastError && (
            <div className="notice" style={{ marginTop: "0.6rem" }}>
              {frame.diagnostics.lastError}
            </div>
          )}
        </details>
      )}

      <p style={{ fontSize: "0.6875rem" }}>
        Thresholds: engage at {EXHIBIT_CONFIG.pinchEngage}, release at {EXHIBIT_CONFIG.pinchRelease},
        same-cell debounce {EXHIBIT_CONFIG.sameCellDebounceMs} ms. All in{" "}
        <code>src/domain/config.ts</code>.
      </p>
    </aside>
  );
}
