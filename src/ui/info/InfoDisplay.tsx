import { useEffect, useState } from "react";
import { getElement } from "../../data/elements";
import { getCategoryColor, getCategoryLabel } from "../../policy/categoryColors";
import { useExhibitEventBus } from "../../hooks/useExhibitEventBus";
import type { ElementRecord } from "../../domain/types";
import type { LandmarkProps } from "../landmark";

/** Pauling electronegativity runs from cesium at 0.79 to fluorine at 3.98. */
const EN_MIN = 0.79;
const EN_MAX = 3.98;

function kelvinToCelsius(kelvin: number | null): string {
  if (kelvin === null) return "—";
  const celsius = kelvin - 273.15;
  return `${celsius >= 0 ? "" : "−"}${Math.abs(celsius).toFixed(celsius > 100 ? 0 : 1)} °C`;
}

function formatDensity(density: number | null, phase: string): string {
  if (density === null) return "—";
  return phase === "Gas" ? `${density.toFixed(3)} g/L` : `${density} g/cm³`;
}

export function InfoDisplay({ landmark: Landmark = "main" }: LandmarkProps = {}) {
  const [element, setElement] = useState<ElementRecord | null>(null);

  const bus = useExhibitEventBus((event) => {
    if (event.type !== "elementSelected") return;
    setElement(getElement(event.atomicNumber) ?? null);
  });

  // Ask the table what is currently selected, so a reload does not strand this
  // display in its attract state until someone touches the table again.
  useEffect(() => {
    bus.publish({ type: "requestState" });
  }, [bus]);

  const accent = element ? getCategoryColor(element.category) : "#d9b654";

  useEffect(() => {
    document.title = element
      ? `${element.name} — Periodic Table Exhibit`
      : "Periodic Table Exhibit";
  }, [element]);

  return (
    <Landmark
      aria-label="Element information display"
      className="label"
      style={{ ["--accent" as string]: accent }}
    >
      <div className="atmosphere" aria-hidden="true" />

      <header className="masthead">
        <p className="eyebrow" style={{ margin: 0 }}>
          Interpretation panel
        </p>
        <p className="eyebrow" style={{ margin: 0 }}>
          {element
            ? `Group ${element.group ?? "f-block"} · Period ${element.period}`
            : "Awaiting selection"}
        </p>
      </header>

      {!element ? (
        <div className="label__attract">
          <p className="eyebrow">The periodic table</p>
          <h1>Choose an element at the table</h1>
          <p style={{ margin: 0, color: "var(--bone-400)", fontSize: "1rem" }}>
            Point at any of the 118 elements, then pinch to select.
          </p>
        </div>
      ) : (
        <>
          <article className="specimen enter" key={element.atomicNumber}>
            <div className="specimen__glyph">
              <span className="specimen__z">{String(element.atomicNumber).padStart(3, "0")}</span>
              <h1 className="specimen__symbol">{element.symbol}</h1>
              <p className="specimen__name">{element.name}</p>
              <span className="chip">
                <span className="chip__dot" />
                {getCategoryLabel(element.category)}
              </span>
            </div>

            <div className="specimen__copy">
              <p className="specimen__blurb">{element.blurb}</p>

              <div className="factbox">
                <p className="eyebrow" style={{ margin: 0 }}>
                  Worth knowing
                </p>
                <p>{element.funFact}</p>
              </div>

              {element.electronegativity !== null && (
                <div className="scale">
                  <p className="eyebrow" style={{ margin: 0 }}>
                    Electronegativity · {element.electronegativity.toFixed(2)}
                  </p>
                  <div className="scale__track">
                    <span
                      className="scale__fill"
                      style={{
                        ["--fill" as string]: `${Math.min(
                          100,
                          Math.max(
                            2,
                            ((element.electronegativity - EN_MIN) / (EN_MAX - EN_MIN)) * 100,
                          ),
                        )}%`,
                      }}
                    />
                  </div>
                  <div className="scale__ends">
                    <span>Cesium · gives electrons away</span>
                    <span>Fluorine · takes them</span>
                  </div>
                </div>
              )}

              <dl className="datarail">
                <div>
                  <dt>Atomic mass</dt>
                  <dd>{element.atomicMass}</dd>
                </div>
                <div>
                  <dt>At room temp.</dt>
                  <dd>{element.phase}</dd>
                </div>
                <div>
                  <dt>Melts at</dt>
                  <dd>{kelvinToCelsius(element.meltK)}</dd>
                </div>
                <div>
                  <dt>Density</dt>
                  <dd>{formatDensity(element.density, element.phase)}</dd>
                </div>
                <div>
                  <dt>Electrons</dt>
                  <dd>{element.electronConfiguration}</dd>
                </div>
                <div>
                  <dt>Discovery</dt>
                  <dd>{element.discoveredBy ?? "Unrecorded"}</dd>
                </div>
              </dl>
            </div>
          </article>

          <footer className="label__footer">
            <p className="eyebrow" style={{ margin: 0 }}>
              {element.appearance ? element.appearance : `${element.block}-block`}
            </p>
            <p className="eyebrow" style={{ margin: 0 }}>
              {element.symbol} · {element.atomicNumber} / 118
            </p>
          </footer>
        </>
      )}
    </Landmark>
  );
}
