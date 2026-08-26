import { useEffect, useRef } from "react";
import type { CameraDevice } from "../../adapters/camera";
import type { HandFrame } from "../../adapters/HandInteractionSource";
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
  onStartCalibration: () => void;
  onOpenInfoWindow: () => void;
  onClearCalibration: () => void;
  calibrated: boolean;
  frame: HandFrame | null;
  videoRef: React.RefObject<HTMLVideoElement | null>;
};

const CONNECTIONS: [number, number][] = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [17, 18], [18, 19], [19, 20],
  [0, 17],
];

/**
 * Operator-only surface. Camera video and landmarks live in here and nowhere
 * else — a visitor must never see a computer-vision debug view.
 */
export function SetupDrawer({
  open,
  onClose,
  status,
  devices,
  selectedDeviceId,
  onSelectDevice,
  onEnableCamera,
  onStartCalibration,
  onOpenInfoWindow,
  onClearCalibration,
  calibrated,
  frame,
  videoRef,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !open) return;
    const context = canvas.getContext("2d");
    if (!context) return;

    const { width, height } = canvas;
    context.clearRect(0, 0, width, height);
    const landmarks = frame?.landmarks;
    if (!landmarks) return;

    context.strokeStyle = "rgba(217, 182, 84, 0.75)";
    context.lineWidth = 1.5;
    for (const [from, to] of CONNECTIONS) {
      const a = landmarks[from];
      const b = landmarks[to];
      if (!a || !b) continue;
      context.beginPath();
      context.moveTo(a.x * width, a.y * height);
      context.lineTo(b.x * width, b.y * height);
      context.stroke();
    }

    landmarks.forEach((landmark, index) => {
      const isPinchPoint = index === 4 || index === 8;
      context.fillStyle = isPinchPoint ? "#f4eee2" : "rgba(244, 238, 226, 0.45)";
      context.beginPath();
      context.arc(landmark.x * width, landmark.y * height, isPinchPoint ? 4 : 2, 0, Math.PI * 2);
      context.fill();
    });
  }, [frame, open]);

  const pinch = frame && Number.isFinite(frame.pinch) ? frame.pinch : null;

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
      {status.kind === "ready" && !calibrated && (
        <div className="notice">
          Hand tracking is running but the table geometry is unknown. Calibrate the four corners to
          enable pinch selection.
        </div>
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
        {calibrated && (
          <button className="button" onClick={onClearCalibration}>
            Clear
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

      <div className="camera-preview">
        <video ref={videoRef} playsInline muted />
        <canvas ref={canvasRef} width={480} height={360} />
      </div>

      <dl className="readout">
        <dt>Input</dt>
        <dd>{status.kind === "ready" ? "Mouse + hand" : "Mouse"}</dd>
        <dt>Calibration</dt>
        <dd>{calibrated ? "Valid" : "None"}</dd>
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

      <p style={{ fontSize: "0.6875rem" }}>
        Thresholds: engage at {EXHIBIT_CONFIG.pinchEngage}, release at {EXHIBIT_CONFIG.pinchRelease},
        same-cell debounce {EXHIBIT_CONFIG.sameCellDebounceMs} ms. All in{" "}
        <code>src/domain/config.ts</code>.
      </p>
    </aside>
  );
}
