import { describe, expect, it } from "vitest";
import { elements, getElement, isValidAtomicNumber } from "./elements";
import { CATEGORY_COLORS } from "../policy/categoryColors";

describe("element data", () => {
  it("contains exactly 118 unique atomic numbers", () => {
    expect(elements).toHaveLength(118);
    expect(new Set(elements.map((element) => element.atomicNumber)).size).toBe(118);
  });

  it("resolves representative elements", () => {
    expect(getElement(1)?.symbol).toBe("H");
    expect(getElement(79)?.name).toBe("Gold");
    expect(getElement(118)?.symbol).toBe("Og");
    expect(getElement(0)).toBeUndefined();
  });

  it("provides exhibit copy for every element", () => {
    for (const element of elements) {
      expect(element.blurb.length, `blurb for ${element.symbol}`).toBeGreaterThan(20);
      expect(element.funFact.length, `fun fact for ${element.symbol}`).toBeGreaterThan(20);
    }
  });

  it("uses only known categories", () => {
    for (const element of elements) {
      expect(Object.keys(CATEGORY_COLORS)).toContain(element.category);
    }
  });

  it("validates atomic numbers at the boundary", () => {
    expect(isValidAtomicNumber(1)).toBe(true);
    expect(isValidAtomicNumber(118)).toBe(true);
    expect(isValidAtomicNumber(119)).toBe(false);
    expect(isValidAtomicNumber(1.5)).toBe(false);
    expect(isValidAtomicNumber("6")).toBe(false);
  });
});
