import { forwardRef } from "react";
import { elements, getElement } from "../../data/elements";
import { toCssRow } from "../../domain/elementLayout";
import { getCategoryColor, getCategoryLabel } from "../../policy/categoryColors";
import type { InteractionState } from "../../domain/interaction";
import type { ElementRecord } from "../../domain/types";

const GROUPS = Array.from({ length: 18 }, (_, index) => index + 1);
const PERIODS = [1, 2, 3, 4, 5, 6, 7];

/**
 * Repeats the current element inside the table's own empty quadrant. A finger
 * on a cell hides the cell and everything just below it; this readout sits
 * where a hand cannot cover it.
 */
function FocusCard({ element }: { element: ElementRecord | null }) {
  if (!element) {
    return (
      <div className="focus-card focus-card--idle" key="idle" aria-hidden="true">
        <span className="focus-card__symbol">118 elements</span>
        <p className="focus-card__blurb">
          Every atom that makes up you, this room, and everything ever observed anywhere.
        </p>
      </div>
    );
  }

  return (
    <div className="focus-card" key={element.atomicNumber} aria-hidden="true">
      <div className="focus-card__head">
        <span className="focus-card__symbol">{element.symbol}</span>
        <span className="focus-card__name">{element.name}</span>
      </div>
      <div className="focus-card__meta">
        <span className="eyebrow">№ {element.atomicNumber}</span>
        <span className="eyebrow">{element.atomicMass} u</span>
        <span className="eyebrow">{getCategoryLabel(element.category)}</span>
        <span className="eyebrow">{element.phase}</span>
      </div>
      <p className="focus-card__blurb">{element.blurb}</p>
    </div>
  );
}

const F_BLOCK_STANDINS = [
  { row: 6, label: "57–71", category: "lanthanide" as const },
  { row: 7, label: "89–103", category: "actinide" as const },
];

type Props = {
  interaction: InteractionState;
  /** Bumped on every confirmation so the strike animation re-runs. */
  confirmToken: number;
  showReticle: boolean;
};

/**
 * The table surface. It renders interaction state and nothing else — no hit
 * testing, no gesture rules, no knowledge of where the pointer came from.
 */
export const PeriodicTable = forwardRef<HTMLDivElement, Props>(function PeriodicTable(
  { interaction, confirmToken, showReticle },
  ref,
) {
  const { hovered, selected, phase, point, source } = interaction;
  const focus = hovered ?? selected;
  const focusElement = focus === null ? null : (getElement(focus) ?? null);

  return (
    <div className="table-frame">
      <div className="axis axis--groups" aria-hidden="true">
        {GROUPS.map((group) => (
          <span key={group}>{group}</span>
        ))}
      </div>
      <div className="axis axis--periods" aria-hidden="true">
        {PERIODS.map((period) => (
          <span key={period} style={{ gridRow: period }}>
            {period}
          </span>
        ))}
      </div>

      <div
        ref={ref}
        className={`periodic-table${source === "mouse" ? " periodic-table--pointer" : ""}`}
        role="group"
        aria-label="Periodic table of the elements"
      >
        <FocusCard element={focusElement} />

        {/* Conventional f-block stand-ins, so the main block reads correctly. */}
        {F_BLOCK_STANDINS.map((standin) => (
          <div
            key={standin.label}
            className="cell cell--placeholder"
            style={
              {
                gridColumn: 3,
                gridRow: standin.row,
                "--cat": getCategoryColor(standin.category),
              } as React.CSSProperties
            }
            aria-hidden="true"
          >
            <span>{standin.label}</span>
          </div>
        ))}
        <div className="fblock-tether" style={{ gridColumn: "3 / 18" }} aria-hidden="true" />

        {elements.map((element) => {
          const isHovered = hovered === element.atomicNumber;
          const isSelected = selected === element.atomicNumber;
          const isConfirmed = isSelected && phase === "confirmed";
          const isRelated =
            !isHovered &&
            !isSelected &&
            focusElement !== null &&
            (element.period === focusElement.period ||
              (element.group !== null && element.group === focusElement.group));

          const className = [
            "cell",
            isHovered && "cell--hovered",
            isSelected && "cell--selected",
            isConfirmed && "cell--confirmed",
            isHovered && phase === "armed" && "cell--armed",
            isRelated && "cell--related",
          ]
            .filter(Boolean)
            .join(" ");

          return (
            <div
              key={isConfirmed ? `${element.atomicNumber}-${confirmToken}` : element.atomicNumber}
              className={className}
              style={
                {
                  gridColumn: element.gridColumn,
                  gridRow: toCssRow(element.gridRow),
                  "--cat": getCategoryColor(element.category),
                } as React.CSSProperties
              }
              data-symbol={element.symbol}
              aria-current={isSelected ? "true" : undefined}
            >
              <span className="cell__number">{element.atomicNumber}</span>
              <span className="cell__symbol">{element.symbol}</span>
              <span className="cell__name">{element.name}</span>
            </div>
          );
        })}

        {showReticle && point && (
          <div
            className={`reticle${phase === "armed" || phase === "confirmed" ? " reticle--armed" : ""}`}
            style={{ left: `${point.x * 100}%`, top: `${point.y * 100}%` }}
            aria-hidden="true"
          />
        )}
      </div>
    </div>
  );
});
