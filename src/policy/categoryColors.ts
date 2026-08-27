import type { ElementCategory } from "../domain/types";

/**
 * One source of truth for category color, consumed by both displays and the
 * light output. Color never carries meaning alone — every surface also prints
 * the category name.
 */
export const CATEGORY_COLORS: Record<ElementCategory, string> = {
  "alkali-metal": "#e8613c",
  "alkaline-earth-metal": "#e8933c",
  "transition-metal": "#d9b654",
  "post-transition-metal": "#7fae7a",
  metalloid: "#4fa89c",
  nonmetal: "#5b9bd6",
  halogen: "#7d7ad4",
  "noble-gas": "#c96f9e",
  lanthanide: "#a97fc4",
  actinide: "#d1657a",
  unknown: "#7d7772",
};

const CATEGORY_LABELS: Record<ElementCategory, string> = {
  "alkali-metal": "Alkali metal",
  "alkaline-earth-metal": "Alkaline earth metal",
  "transition-metal": "Transition metal",
  "post-transition-metal": "Post-transition metal",
  metalloid: "Metalloid",
  nonmetal: "Nonmetal",
  halogen: "Halogen",
  "noble-gas": "Noble gas",
  lanthanide: "Lanthanide",
  actinide: "Actinide",
  unknown: "Unknown / predicted",
};

export const CATEGORY_ORDER: ElementCategory[] = [
  "alkali-metal",
  "alkaline-earth-metal",
  "transition-metal",
  "post-transition-metal",
  "metalloid",
  "nonmetal",
  "halogen",
  "noble-gas",
  "lanthanide",
  "actinide",
  "unknown",
];

export function getCategoryColor(category: ElementCategory): string {
  return CATEGORY_COLORS[category] ?? CATEGORY_COLORS.unknown;
}

export function getCategoryLabel(category: ElementCategory): string {
  return CATEGORY_LABELS[category] ?? CATEGORY_LABELS.unknown;
}

export function isCategory(value: unknown): value is ElementCategory {
  return typeof value === "string" && value in CATEGORY_COLORS;
}
