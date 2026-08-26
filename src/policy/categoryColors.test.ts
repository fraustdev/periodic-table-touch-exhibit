import { describe, expect, it } from "vitest";
import { elements } from "../data/elements";
import { CATEGORY_ORDER, getCategoryColor, getCategoryLabel, isCategory } from "./categoryColors";

describe("category color policy", () => {
  it("maps every dataset category to a CSS hex color", () => {
    for (const element of elements) {
      expect(getCategoryColor(element.category)).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  it("labels every category for non-color readability", () => {
    for (const category of CATEGORY_ORDER) {
      expect(getCategoryLabel(category).length).toBeGreaterThan(3);
    }
  });

  it("covers every category the dataset actually uses", () => {
    const used = new Set(elements.map((element) => element.category));
    for (const category of used) expect(CATEGORY_ORDER).toContain(category);
  });

  it("rejects unknown category strings at the boundary", () => {
    expect(isCategory("halogen")).toBe(true);
    expect(isCategory("plasma-metal")).toBe(false);
    expect(isCategory(7)).toBe(false);
  });
});
