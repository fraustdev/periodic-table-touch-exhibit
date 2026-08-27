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
const LED_COUNT = SEGMENTS.top + SEGMENTS.right + SEGMENTS.bottom + SEGMENTS.left;

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

const THIN = "3px";
const ALONG_X = "min(1.4vw, 22px)";
const ALONG_Y = "min(2.4vh, 22px)";
const pct = (t: number) => `${t * 100}%`;

/**
 * Each edge differs only in which CSS property carries the distance along it.
 * `t` runs 0..1 in the clockwise direction, which is why the bottom and left
 * edges anchor from their far side.
 */
const EDGES = [
  {
    edge: "top",
    style: (t: number) =>
      ({
        top: 0,
        left: pct(t),
        width: ALONG_X,
        height: THIN,
        transform: "translateX(-50%)",
      }) as const,
  },
  {
    edge: "right",
    style: (t: number) =>
      ({
        right: 0,
        top: pct(t),
        width: THIN,
        height: ALONG_Y,
        transform: "translateY(-50%)",
      }) as const,
  },
  {
    edge: "bottom",
    style: (t: number) =>
      ({
        bottom: 0,
        right: pct(t),
        width: ALONG_X,
        height: THIN,
        transform: "translateX(50%)",
      }) as const,
  },
  {
    edge: "left",
    style: (t: number) =>
      ({
        left: 0,
        bottom: pct(t),
        width: THIN,
        height: ALONG_Y,
        transform: "translateY(50%)",
      }) as const,
  },
] as const;

function buildStrip(): Led[] {
  return EDGES.flatMap(({ edge, style }) =>
    Array.from({ length: SEGMENTS[edge] }, (_, index): Led => {
      const t = (index + 0.5) / SEGMENTS[edge];
      return { loop: START[edge] + t * SPAN[edge], style: style(t) };
    }),
  );
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
