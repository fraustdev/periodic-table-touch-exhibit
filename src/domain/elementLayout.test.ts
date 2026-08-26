import { describe, expect, it } from "vitest";
import { elements } from "../data/elements";
import { getCellCenter, getElementPosition, hitTestElement, toCssRow } from "./elementLayout";

describe("periodic table layout", () => {
  it("places recognizable edge and series elements", () => {
    expect(getElementPosition(1)).toEqual({ row: 1, column: 1 });
    expect(getElementPosition(2)).toEqual({ row: 1, column: 18 });
    expect(getElementPosition(57)).toEqual({ row: 8, column: 3 });
    expect(getElementPosition(89)).toEqual({ row: 9, column: 3 });
    expect(getElementPosition(118)).toEqual({ row: 7, column: 18 });
  });

  it("leaves a rendered gap between the main block and the f-block", () => {
    expect(toCssRow(7)).toBe(7);
    expect(toCssRow(8)).toBe(9);
    expect(toCssRow(9)).toBe(10);
  });

  it("hit-tests normalized table coordinates", () => {
    expect(hitTestElement({ x: 0.01, y: 0.01 })).toBe(1);
    expect(hitTestElement({ x: 0.99, y: 0.01 })).toBe(2);
    expect(hitTestElement({ x: 0.99, y: 0.7 })).toBe(118); // main block, not the f-block rows
  });

  it("returns null outside the grid, in empty cells, and in the block spacer", () => {
    expect(hitTestElement({ x: -0.1, y: 0.5 })).toBeNull();
    expect(hitTestElement({ x: 0.5, y: 1.2 })).toBeNull();
    expect(hitTestElement({ x: 0.99, y: 0.99 })).toBeNull(); // actinide row stops at group 17
    expect(hitTestElement({ x: 0.5, y: 0.01 })).toBeNull(); // period 1 has no group 10
    expect(hitTestElement({ x: Number.NaN, y: 0.5 })).toBeNull();
  });

  it("round-trips every element through its own cell center", () => {
    for (const element of elements) {
      expect(hitTestElement(getCellCenter(element.atomicNumber))).toBe(element.atomicNumber);
    }
  });
});
