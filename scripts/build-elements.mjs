// Regenerates src/data/elements.json from the normalized source dataset plus
// the authored exhibit copy. Run with: npm run data:build
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const source = JSON.parse(readFileSync(join(here, "source-elements.json"), "utf8"));
const copy = JSON.parse(readFileSync(join(here, "element-copy.json"), "utf8"));

const CATEGORY_MAP = {
  "alkali metal": "alkali-metal",
  "alkaline earth metal": "alkaline-earth-metal",
  "transition metal": "transition-metal",
  "post-transition metal": "post-transition-metal",
  metalloid: "metalloid",
  "diatomic nonmetal": "nonmetal",
  "polyatomic nonmetal": "nonmetal",
  "noble gas": "noble-gas",
  lanthanide: "lanthanide",
  actinide: "actinide",
};

/** Group 17 reads as a halogen column even where the source hedges. */
function resolveCategory(raw) {
  if (raw.group === 17) return "halogen";
  const mapped = CATEGORY_MAP[raw.category];
  return mapped ?? "unknown";
}

/** Standard 18-column layout: f-block occupies rows 8 and 9, below a visual gap. */
function resolveGrid(raw) {
  return { gridRow: raw.ypos >= 9 ? raw.ypos - 1 : raw.ypos, gridColumn: raw.xpos };
}

function formatMass(mass, atomicNumber) {
  const precise = atomicNumber <= 83 && atomicNumber !== 43 && atomicNumber !== 61;
  const value = precise ? Number(mass.toFixed(3)) : Math.round(mass);
  return precise ? String(value) : `[${value}]`;
}

const elements = source
  .slice()
  .sort((a, b) => a.number - b.number)
  .map((raw) => {
    const authored = copy[String(raw.number)];
    if (!authored) throw new Error(`Missing exhibit copy for element ${raw.number}`);
    const { gridRow, gridColumn } = resolveGrid(raw);
    return {
      atomicNumber: raw.number,
      symbol: raw.symbol,
      name: raw.name,
      atomicMass: formatMass(raw.atomic_mass, raw.number),
      category: resolveCategory(raw),
      blurb: authored[0],
      funFact: authored[1],
      gridRow,
      gridColumn,
      group: raw.group ?? null,
      period: raw.period,
      block: raw.block,
      phase: raw.phase,
      appearance: raw.appearance ?? null,
      electronConfiguration: raw.electron_configuration_semantic ?? raw.electron_configuration,
      electronegativity: raw.electronegativity_pauling ?? null,
      meltK: raw.melt ?? null,
      boilK: raw.boil ?? null,
      density: raw.density ?? null,
      discoveredBy: raw.discovered_by ?? null,
    };
  });

if (elements.length !== 118) throw new Error(`Expected 118 elements, built ${elements.length}`);

const occupied = new Set();
for (const element of elements) {
  const key = `${element.gridRow}:${element.gridColumn}`;
  if (occupied.has(key)) throw new Error(`Grid collision at ${key} (${element.symbol})`);
  occupied.add(key);
}

writeFileSync(join(here, "..", "src", "data", "elements.json"), `${JSON.stringify(elements, null, 1)}\n`);
console.log(`Wrote ${elements.length} elements.`);
const counts = elements.reduce((acc, e) => ({ ...acc, [e.category]: (acc[e.category] ?? 0) + 1 }), {});
console.log(counts);
