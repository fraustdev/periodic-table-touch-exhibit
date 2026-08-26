export type CameraDevice = { deviceId: string; label: string };

export async function listCameras(): Promise<CameraDevice[]> {
  if (!navigator.mediaDevices?.enumerateDevices) return [];
  const devices = await navigator.mediaDevices.enumerateDevices();
  return devices
    .filter((device) => device.kind === "videoinput")
    .map((device, index) => ({
      deviceId: device.deviceId,
      label: device.label || `Camera ${index + 1}`,
    }));
}

export async function openCamera(deviceId?: string): Promise<MediaStream> {
  return navigator.mediaDevices.getUserMedia({
    video: {
      deviceId: deviceId ? { exact: deviceId } : undefined,
      width: { ideal: 1280 },
      height: { ideal: 720 },
      frameRate: { ideal: 30 },
    },
    audio: false,
  });
}

/**
 * getUserMedia failures are indistinguishable to an operator unless they are
 * named. "Another tab is holding the camera" is by far the most common one
 * during a demo, and the least obvious.
 */
export function describeCameraError(error: unknown): string {
  const name = error instanceof DOMException ? error.name : "";
  switch (name) {
    case "NotAllowedError":
    case "SecurityError":
      return "Camera access was denied. Allow it in the address-bar camera icon, then try again. The mouse exhibit is unaffected.";
    case "NotFoundError":
    case "DevicesNotFoundError":
      return "No camera was found on this machine. The mouse exhibit is unaffected.";
    case "NotReadableError":
    case "TrackStartError":
      return "The camera is already in use — usually another browser tab of this page, or an app like Zoom or Photo Booth. Close the others and try again. The mouse exhibit is unaffected.";
    case "OverconstrainedError":
      return "This camera cannot provide the requested video format. Pick a different camera below. The mouse exhibit is unaffected.";
    case "AbortError":
      return "The camera stopped unexpectedly. Try again. The mouse exhibit is unaffected.";
    default:
      return `The camera could not start: ${error instanceof Error ? error.message : String(error)}. The mouse exhibit is unaffected.`;
  }
}

export function stopStream(stream: MediaStream | null): void {
  stream?.getTracks().forEach((track) => track.stop());
}

/** The label the calibration is keyed to, so swapping cameras invalidates it. */
export function streamLabel(stream: MediaStream | null): string {
  return stream?.getVideoTracks()[0]?.label ?? "unknown-camera";
}
