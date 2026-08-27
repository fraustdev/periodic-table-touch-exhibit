import { useEffect, useMemo, useState } from "react";
import { getCategoryColor } from "../../policy/categoryColors";
import type { LightCue, Point } from "../../domain/types";

/**
 * A virtual addressable strip: a fixed number of discrete pixels laid around
 * the display edge, each with a position on a 0..1 loop. Effects address
 * normalized arc length, never an index, so the same model maps onto a real
 * WS2812-class strip without rewriting the effect.
 */
const SEGMENTS = { top: 40, right: 20, bottom: 40, left: 20 } as const;
export const LED_COUNT = SEGMENTS.top + SEGMENTS.right + SEGMENTS.bottom + SEGMENTS.left;

const SPAN = {
  top: SEGMENTS.top / LED_COUNT,
  right: SEGMENTS.right / LED_COUNT,
  bottom: SEGMENTS.bottom / LED_COUNT,
  left: SEGMENTS.left / LED_COUNT,
};

const START = {
  top: 0,
  right: SPAN.top,
  bottom: SPAN.top + SPAN.right,
  left: SPAN.top + SPAN.right + SPAN.bottom,
};

type Led = { loop: number; style: React.CSSProperties };

function buildStrip(): Led[] {
  const leds: Led[] = [];
  const thin = "3px";

  for (let i = 0; i < SEGMENTS.top; i += 1) {
    const t = (i + 0.5) / SEGMENTS.top;
    leds.push({
      loop: START.top + t * SPAN.top,
      style: {
        top: 0,
        left: `${t * 100}%`,
        width: `min(1.4vw, 22px)`,
        height: thin,
        transform: "translateX(-50%)",
      },
    });
  }
  for (let i = 0; i < SEGMENTS.right; i += 1) {
    const t = (i + 0.5) / SEGMENTS.right;
    leds.push({
      loop: START.right + t * SPAN.right,
      style: {
        right: 0,
        top: `${t * 100}%`,
        width: thin,
        height: `min(2.4vh, 22px)`,
        transform: "translateY(-50%)",
      },
    });
  }
  for (let i = 0; i < SEGMENTS.bottom; i += 1) {
    const t = (i + 0.5) / SEGMENTS.bottom;
    leds.push({
      loop: START.bottom + t * SPAN.bottom,
      style: {
        bottom: 0,
        right: `${t * 100}%`,
        width: `min(1.4vw, 22px)`,
        height: thin,
        transform: "translateX(50%)",
      },
    });
  }
  for (let i = 0; i < SEGMENTS.left; i += 1) {
    const t = (i + 0.5) / SEGMENTS.left;
    leds.push({
      loop: START.left + t * SPAN.left,
      style: {
        left: 0,
        bottom: `${t * 100}%`,
        width: thin,
        height: `min(2.4vh, 22px)`,
        transform: "translateY(50%)",
      },
    });
  }
  return leds;
}

/** Nearest point on the loop to a normalized table-space point. */
export function perimeterOrigin(point: Point | null): number {
  if (!point) return 0;
  const { x, y } = point;
  const nearest = Math.min(x, 1 - x, y, 1 - y);
  if (nearest === y) return START.top + x * SPAN.top;
  if (nearest === 1 - x) return START.right + y * SPAN.right;
  if (nearest === 1 - y) return START.bottom + (1 - x) * SPAN.bottom;
  return START.left + (1 - y) * SPAN.left;
}

/** Shortest distance around the loop, so the pulse travels both ways at once. */
function loopLag(led: number, origin: number): number {
  const raw = Math.abs(led - origin);
  return Math.min(raw, 1 - raw) * 2;
}

export type Pulse = { id: number; cue: LightCue; origin: number };

export function PerimeterLights({ pulse }: { pulse: Pulse | null }) {
  const strip = useMemo(buildStrip, []);
  const [active, setActive] = useState<Pulse | null>(null);

  useEffect(() => {
    if (!pulse) return;
    setActive(pulse);
    const timer = window.setTimeout(() => setActive(null), 1_400);
    return () => window.clearTimeout(timer);
  }, [pulse]);

  const color = active ? getCategoryColor(active.cue.category) : undefined;

  return (
    <div
      className={`leds${active ? " leds--pulsing" : ""}`}
      key={active?.id ?? "idle"}
      aria-hidden="true"
      style={
        active
          ? ({ "--accent": color, "--pulse-i": active.cue.intensity } as React.CSSProperties)
          : undefined
      }
    >
      {strip.map((led, index) => (
        <span
          key={index}
          className="led"
          style={
            {
              ...led.style,
              "--lag": active ? loopLag(led.loop, active.origin) : 0,
            } as React.CSSProperties
          }
        />
      ))}
    </div>
  );
}
