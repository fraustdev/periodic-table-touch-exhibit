import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PeriodicTable } from "./PeriodicTable";
import { initialInteractionState } from "../../domain/interaction";
import { elements } from "../../data/elements";

function renderTable(interaction = initialInteractionState) {
  return render(
    <PeriodicTable interaction={interaction} confirmToken={0} showReticle={false} />,
  );
}

describe("PeriodicTable", () => {
  it("renders all 118 element cells", () => {
    const { container } = renderTable();
    expect(container.querySelectorAll(".cell[data-symbol]")).toHaveLength(118);
  });

  it("adds the two conventional f-block stand-ins, which are not selectable", () => {
    const { container } = renderTable();
    const standins = container.querySelectorAll(".cell--placeholder");
    expect(standins).toHaveLength(2);
    expect([...standins].map((node) => node.textContent)).toEqual(["57–71", "89–103"]);
    for (const standin of standins) expect(standin.getAttribute("data-symbol")).toBeNull();
  });

  it("renders every symbol exactly once", () => {
    const { container } = renderTable();
    for (const element of elements) {
      expect(container.querySelectorAll(`[data-symbol="${element.symbol}"]`)).toHaveLength(1);
    }
  });

  it("marks the hovered cell and illuminates its group and period", () => {
    const { container } = renderTable({
      ...initialInteractionState,
      phase: "hover",
      hovered: 6,
      point: { x: 0.5, y: 0.2 },
    });
    const carbon = container.querySelector('[data-symbol="C"]')!;
    expect(carbon.className).toContain("cell--hovered");
    // Group 14 and period 2 both light up passively.
    expect(container.querySelector('[data-symbol="Si"]')!.className).toContain("cell--related");
    expect(container.querySelector('[data-symbol="N"]')!.className).toContain("cell--related");
    expect(container.querySelector('[data-symbol="Au"]')!.className).not.toContain("cell--related");
  });

  it("marks the selected cell for assistive technology", () => {
    const { container } = renderTable({
      ...initialInteractionState,
      phase: "confirmed",
      selected: 79,
    });
    const gold = container.querySelector('[data-symbol="Au"]')!;
    expect(gold.getAttribute("aria-current")).toBe("true");
    expect(gold.className).toContain("cell--confirmed");
  });

  it("draws the reticle only when a pointer is present and requested", () => {
    const { container: without } = renderTable({
      ...initialInteractionState,
      point: { x: 0.5, y: 0.5 },
    });
    expect(without.querySelector(".reticle")).toBeNull();

    const { container: with_ } = render(
      <PeriodicTable
        interaction={{ ...initialInteractionState, point: { x: 0.5, y: 0.5 }, source: "hand" }}
        confirmToken={0}
        showReticle
      />,
    );
    expect(with_.querySelector(".reticle")).not.toBeNull();
  });

  it("exposes the table as a labelled group", () => {
    renderTable();
    expect(screen.getByRole("group", { name: /periodic table of the elements/i })).toBeInTheDocument();
  });
});
