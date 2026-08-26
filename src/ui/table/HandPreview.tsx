import { useEffect, useRef } from "react";
import type { HandFrame } from "../../adapters/HandInteractionSource";

/** MediaPipe's 21-landmark hand skeleton. */
const CONNECTIONS: [number, number][] = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [17, 18], [18, 19], [19, 20],
  [0, 17],
];

type Props = {
  stream: MediaStream | null;
  frame: HandFrame | null;
  /**
   * When provided, this element is the one the hand driver reads from. The
   * component still owns playback so a preview mounted anywhere stays live.
   */
  videoRef?: React.RefObject<HTMLVideoElement | null>;
  className?: string;
};

/**
 * The camera view with the tracked hand drawn over it. Shared by the setup
 * drawer and the calibration overlay — during calibration the visitor needs to
 * see where their hand actually is, or they are aiming blind.
 */
export function HandPreview({ stream, frame, videoRef, className }: Props) {
  const localRef = useRef<HTMLVideoElement>(null);
  const ref = videoRef ?? localRef;
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const video = ref.current;
    if (!video || !stream) return;
    if (video.srcObject !== stream) {
      video.srcObject = stream;
      void video.play().catch(() => {
        // Autoplay of a muted local stream is permitted; a rejection here only
        // means the element was torn down mid-assignment.
      });
    }
  }, [stream, ref]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;

    const { width, height } = canvas;
    context.clearRect(0, 0, width, height);
    const landmarks = frame?.landmarks;
    if (!landmarks) return;

    context.strokeStyle = "rgba(217, 182, 84, 0.8)";
    context.lineWidth = 2;
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
      context.fillStyle = isPinchPoint ? "#f4eee2" : "rgba(244, 238, 226, 0.5)";
      context.beginPath();
      context.arc(landmark.x * width, landmark.y * height, isPinchPoint ? 4 : 2, 0, Math.PI * 2);
      context.fill();
    });

    // Ring the index fingertip: it is the point calibration actually samples.
    const tip = landmarks[8];
    if (tip) {
      const engaged = Number.isFinite(frame!.pinch) && frame!.pinch <= 0.28;
      context.strokeStyle = engaged ? "#f4eee2" : "rgba(217, 182, 84, 0.9)";
      context.lineWidth = 2;
      context.beginPath();
      context.arc(tip.x * width, tip.y * height, engaged ? 8 : 14, 0, Math.PI * 2);
      context.stroke();
    }
  }, [frame]);

  return (
    <div className={`camera-preview${className ? ` ${className}` : ""}`}>
      <video ref={ref} playsInline muted />
      <canvas ref={canvasRef} width={480} height={360} />
      {!stream && <span className="camera-preview__empty eyebrow">Camera off</span>}
    </div>
  );
}
