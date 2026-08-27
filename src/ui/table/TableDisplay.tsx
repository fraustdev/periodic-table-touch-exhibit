import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PeriodicTable } from "./PeriodicTable";
import { PerimeterLights, perimeterOrigin, type Pulse } from "./PerimeterLights";
import { SetupDrawer } from "./SetupDrawer";
import { HandPreview } from "./HandPreview";
import { MouseInteractionSource } from "../../adapters/MouseInteractionSource";
import { TouchInteractionSource } from "../../adapters/TouchInteractionSource";
import { useExhibitEventBus } from "../../hooks/useExhibitEventBus";
import { useHandTracking } from "../../hooks/useHandTracking";
import { useCalibrationRun } from "../../hooks/useCalibrationRun";
import {
  initialInteractionState,
  reduceInteraction,
  type InteractionState,
} from "../../domain/interaction";
import { getCellCenter } from "../../domain/elementLayout";
import type { Matrix3 } from "../../domain/calibration";
import { CATEGORY_ORDER, getCategoryColor, getCategoryLabel } from "../../policy/categoryColors";
import {
  getTrend,
  normalizeTrend,
  trendColor,
  scaleTicks,
  trendGradient,
  trendInk,
  trendRange,
  TRENDS,
  type TrendKey,
} from "../../policy/trends";
import { getElement } from "../../data/elements";
import type { ElementRecord, Point, PointerSample } from "../../domain/types";

export function TableDisplay() {
  const surfaceRef = useRef<HTMLDivElement>(null);

  const [interaction, setInteraction] = useState<InteractionState>(initialInteractionState);
  const [confirmToken, setConfirmToken] = useState(0);
  const [pulse, setPulse] = useState<Pulse | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [handHasSelected, setHandHasSelected] = useState(false);
  const [trendKey, setTrendKey] = useState<TrendKey>("category");

  const interactionRef = useRef(interaction);
  interactionRef.current = interaction;

  const bus = useExhibitEventBus((event, replyTo) => {
    // The table owns the selection, so it answers state requests from a display
    // that has just opened or reloaded. It ignores its own selection echoes.
    if (event.type !== "requestState") return;
    const selected = interactionRef.current.selected;
    if (selected === null) return;
    replyTo.publish({
      type: "elementSelected",
      atomicNumber: selected,
      timestamp: performance.now(),
    });
  });

  /** The one path from a pointer sample to exhibit state and events. */
  const handleSample = useCallback(
    (sample: PointerSample) => {
      const { state, events } = reduceInteraction(
        interactionRef.current,
        sample,
        performance.now(),
      );
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

  // Mouse and touch are both always live, and neither is a shortcut around the
  // controller. On a laptop only the mouse ever fires; on a panel only touch
  // does. Each driver claims its own pointerType, so they never double-report.
  useEffect(() => {
    const surface = surfaceRef.current;
    if (!surface) return;
    const sources = [new MouseInteractionSource(surface), new TouchInteractionSource(surface)];
    for (const source of sources) source.start(handleSample);
    return () => {
      for (const source of sources) source.stop();
    };
  }, [handleSample]);

  /**
   * Calibration and the camera need each other: calibration maps camera space
   * to table space, and it is keyed to the camera's label. This ref is the one
   * seam between them — the hand driver reads the transform through it, so the
   * hooks can be created in either order.
   */
  const transformRef = useRef<() => Matrix3 | null>(() => null);

  const hand = useHandTracking({
    onSample: handleSample,
    onCameraPoint: (point) => calibrationRef.current?.(point),
    getTransform: transformRef,
  });

  const calibration = useCalibrationRun({
    surfaceRef,
    cameraLabel: hand.cameraLabel,
    onError: hand.reportError,
  });

  transformRef.current = calibration.getTransform;

  /** Same reason as transformRef, in the other direction. */
  const calibrationRef = useRef<((point: Point | null) => void) | null>(null);
  calibrationRef.current = calibration.observeCameraPoint;

  // ---- presentation --------------------------------------------------------

  const focus = interaction.hovered ?? interaction.selected;
  const focusElement = focus === null ? null : (getElement(focus) ?? null);
  const accent = focusElement ? getCategoryColor(focusElement.category) : "#d9b654";
  const activeCategory = focusElement?.category ?? null;

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setDrawerOpen(false);
        calibration.cancel();
      }
      if (event.metaKey || event.ctrlKey) return;
      if (event.key.toLowerCase() === "s") {
        setDrawerOpen((open) => !open);
      }
      if (event.key.toLowerCase() === "t") {
        setTrendKey((current) => {
          const at = TRENDS.findIndex((option) => option.key === current);
          return TRENDS[(at + 1) % TRENDS.length].key;
        });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [calibration]);

  const { run, target, pending, effective } = calibration;

  const trend = getTrend(trendKey);
  const trendActive = trendKey !== "category";
  // The range is a property of the dataset, not of the render.
  const range = useMemo(() => trendRange(trend), [trend]);
  const colorFor = useCallback(
    (element: ElementRecord) =>
      trendActive
        ? trendColor(normalizeTrend(trend, range, element))
        : getCategoryColor(element.category),
    [range, trend, trendActive],
  );
  const inkFor = useCallback(
    (element: ElementRecord) =>
      trendActive ? trendInk(normalizeTrend(trend, range, element)) : "var(--bone-100)",
    [range, trend, trendActive],
  );
  const focused = interaction.hovered ?? interaction.selected;
  const focusedElement = focused === null ? null : (getElement(focused) ?? null);

  /** Everything the table's quadrant needs in order to explain the active mode. */
  const trendView = useMemo(() => {
    if (!trendActive) return null;
    const raw = focusedElement ? trend.value(focusedElement) : null;
    return {
      label: trend.label,
      note: trend.note,
      gradient: trendGradient(),
      ticks: scaleTicks(trend, range),
      missing: range.missing,
      reading: focusedElement
        ? {
            value: raw === null ? "Not measured" : trend.format(raw),
            position: raw === null ? null : normalizeTrend(trend, range, focusedElement),
          }
        : null,
    };
  }, [focusedElement, range, trend, trendActive]);

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
          <span className={`status${hand.status.kind === "ready" ? " status--live" : ""}`}>
            <span className="status__dot" />
            <span className="eyebrow">
              {hand.status.kind === "ready"
                ? effective.source === "corners"
                  ? "Hand + mouse"
                  : "Hand · default region"
                : "Mouse input"}
            </span>
          </span>
          <span className="eyebrow">Station 01</span>
          <button
            className={`drawer-toggle${hand.status.kind === "error" ? " drawer-toggle--alert" : ""}`}
            onClick={() => setDrawerOpen(true)}
            aria-expanded={drawerOpen}
          >
            Setup
          </button>
        </div>
      </header>

      <PeriodicTable
        ref={surfaceRef}
        colorFor={colorFor}
        inkFor={inkFor}
        trendView={trendView}
        trendActive={trendActive}
        interaction={interaction}
        confirmToken={confirmToken}
        showReticle={interaction.source === "hand"}
      />

      <footer className="footer">
        <div className="footer__left">
          <div className="trend-switch" role="group" aria-label="Colour the table by">
            <span className="trend-switch__label">Coloured by</span>
            {TRENDS.map((option) => (
              <button
                key={option.key}
                className={`trend-switch__option${option.key === trendKey ? " trend-switch__option--active" : ""}`}
                onClick={() => setTrendKey(option.key)}
                aria-pressed={option.key === trendKey}
              >
                {option.label}
              </button>
            ))}
          </div>

          {!trendActive && (
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
          )}
        </div>
        <p className={`prompt${handHasSelected ? " prompt--hidden" : ""}`}>
          {hand.status.kind === "ready"
            ? "Point, then pinch to choose."
            : trendActive
              ? "Hover an element to read its value."
              : "Choose an element — or press T to colour the table by a property."}
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
            <HandPreview stream={hand.stream} frame={hand.frame} className="calibration__preview" />

            <div className="calibration__caption">
              <p className="eyebrow" style={{ margin: 0 }}>
                Calibration · point {run.step + 1} of {calibration.cornerCount}
              </p>
              <strong>Hold your fingertip on the {target.label.toLowerCase()} marker</strong>
              <p style={{ margin: 0, color: "var(--bone-400)", fontSize: "0.8125rem" }}>
                Keep still until the marker fills. Press Escape to cancel.
              </p>
              {!hand.frame?.landmarks && (
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
            <button className="button button--primary" onClick={calibration.accept}>
              Looks right
            </button>
            <button className="button" onClick={calibration.redo}>
              Redo
            </button>
          </div>
        </div>
      )}

      <SetupDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        status={hand.status}
        devices={hand.devices}
        selectedDeviceId={hand.deviceId}
        onSelectDevice={hand.setDeviceId}
        onEnableCamera={hand.enable}
        onDisableCamera={hand.disable}
        onOpenInfoWindow={() => {
          window.open("/info", "exhibit-info", "popup=yes,width=1280,height=800");
        }}
        onStartCalibration={() => {
          calibration.start();
          setDrawerOpen(false);
        }}
        onClearCalibration={calibration.resetToDefault}
        calibrationSource={effective.source}
        frame={hand.frame}
        stream={hand.stream}
        videoRef={hand.videoRef}
        buildReport={() =>
          JSON.stringify(
            {
              when: new Date().toISOString(),
              userAgent: navigator.userAgent,
              calibrationSource: effective.source,
              calibrationViewport: effective.viewport,
              calibrationCamera: effective.cameraLabel,
              ...hand.describe(),
            },
            null,
            2,
          )
        }
      />
    </main>
  );
}
