---
name: add-trend
description: Add a trend overlay that recolours the periodic table by a measured property. Use when asked to add, change, or remove a trend, heatmap, or property colouring — for example colouring by boiling point, atomic radius, or abundance.
---

# Add a trend overlay

A trend recolours all 118 cells by a measured property. Adding one is **a single entry in `TRENDS`
in `src/policy/trends.ts`** — the switcher, the calibrated scale, the tick labels, the hero value,
the marker, and the legible-ink calculation all read from that entry. Do not touch the UI.

## 1. Check coverage before writing anything

A trend covering little of the table is not worth showing. Run this for the candidate field:

```bash
node -e "
const e=require('./src/data/elements.json');
const f='FIELD';
const have=e.filter(x=>x[f]!=null); const v=have.map(x=>x[f]);
console.log(f, 'have', have.length+'/118', 'min', Math.min(...v), 'max', Math.max(...v));
console.log('missing:', e.filter(x=>x[f]==null).map(x=>x.symbol).join(','));
"
```

**Stop and say so if coverage is under ~89/118.** The existing tests enforce that floor. If the
property is not in the dataset at all, that is a dataset change first — `scripts/element-copy.json`
plus `scripts/build-elements.mjs`, then `npm run data:build` — and it needs its own discussion,
because authoring 118 values invites errors.

Available numeric fields: `meltK`, `boilK`, `density`, `electronegativity`, `atomicNumber`, `period`,
`group`.

## 2. Decide linear or log — this is the real judgement call

**If the range spans more than about two orders of magnitude, use `log`.** Density runs 0.09 to 40,
and on a linear ramp every element except the heavy metals renders identically. Melting point runs
0.95 K to 3695 K and reads fine linearly.

Compute `max/min` and decide deliberately. Say which you chose and why.

## 3. Add the entry

```ts
{
  key: "boiling",                        // add to the TrendKey union too
  label: "Boiling point",                // appears on the pill and in the panel heading
  value: (element) => element.boilK,     // null where unmeasured — never substitute
  format: (k) => `${Math.round(k - 273.15)} °C`,
  scale: "linear",
  lowLabel: "Helium · −269 °C",          // name the actual extreme element
  highLabel: "Tungsten · 5555 °C",
  note: "One sentence on what the pattern shows.",
}
```

Rules that the surrounding code depends on:

- **`value` returns `null` for unmeasured, never a substitute.** That the superheavies have no
  measured value is a fact worth showing; a fabricated midpoint is lying with colour.
- **`format` carries units.** The value is read as a hero number with no other context.
- **`lowLabel` / `highLabel` name the real extremes**, verified against the data, not guessed.
- **`note` is one sentence** and says what the pattern means, not what the feature does.

## 4. Test it

Add a block to `src/policy/trends.test.ts` alongside the existing ones. Assert:

- the extremes land at 0 and 1
- a known ordering holds (three elements you can reason about)
- `format` produces the expected string for one real value
- for a log scale, that successive ticks are spaced by ratio rather than difference

The generic tests already cover colour validity, ink contrast across the ramp, and that no element
is left without a colour, so do not duplicate those.

## 5. Verify

```bash
npm test
npm run verify:browser
```

The browser suite checks every trend recolours, names itself, labels four ticks, and handles an
unmeasured element. A new trend is covered automatically **only if you added it to `TRENDS`** —
which is the point.
