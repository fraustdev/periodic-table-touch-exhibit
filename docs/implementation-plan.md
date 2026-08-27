# Periodic Table Touch Exhibit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a polished two-display periodic-table proof of concept with reliable mouse interaction, calibrated MediaPipe pinch selection, cross-window element stories, and virtual perimeter lighting.

**Architecture:** A single React/Vite bundle selects `/table` or `/info` at the route boundary. Pure TypeScript modules own element data, table geometry, gesture state, calibration, event validation, and category colors; browser adapters own mouse/MediaPipe input, `BroadcastChannel`, and CSS light output. The mouse-complete experience lands before webcam work so camera failure never blocks the demo.

**Tech Stack:** React, TypeScript, Vite, Vitest, Testing Library, MediaPipe `@mediapipe/tasks-vision`, browser `BroadcastChannel`, CSS Grid, SVG/canvas debug overlay.

## Global Constraints

- Work only in `/Users/frida/projects/periodic-table-touch-exhibit`.
- Optimize for a working proof of concept in roughly two hours.
- Keep `/table` fully usable by mouse when camera access, MediaPipe, or calibration is unavailable.
- Preserve the exact `elementSelected` and `lightsPulse` message shapes from the approved design.
- Use exactly one tracked hand; dwell, multi-hand support, WebSocket, MQTT, physical LEDs, replay, sequencing, and late-display state recovery are out of scope.
- Keep webcam video and landmarks inside the setup drawer, never in normal exhibit mode.
- Keep pinch engagement at `0.28`, release at `0.38`, minimum confidence at `0.5`, and same-cell debounce at `1_000` ms in one configuration module.
- Prefer the polished mouse-driven two-display experience if the timebox expires before webcam tuning is complete.
- Use the official MediaPipe web pattern: `FilesetResolver`, `HandLandmarker.createFromOptions`, `runningMode: "VIDEO"`, and `detectForVideo`.

## File map

```text
index.html                              Vite HTML shell
package.json                            scripts and dependencies
tsconfig.json                           strict TypeScript configuration
vite.config.ts                          React and Vitest configuration
scripts/fetch-elements.mjs              one-time PubChem-to-local-JSON generator
src/main.tsx                            React entry point
src/app/App.tsx                         route selection and adapter composition
src/domain/types.ts                     shared element, input, event, and light types
src/domain/config.ts                    gesture thresholds and channel name
src/domain/elementLayout.ts             canonical 18-column grid positions and hit test
src/domain/elementLayout.test.ts        grid-position and hit-test tests
src/domain/interaction.ts               pure hover/pinch/cooldown state machine
src/domain/interaction.test.ts          gesture and fallback tests
src/domain/calibration.ts               four-point homography and persistence rules
src/domain/calibration.test.ts          transform and invalidation tests
src/data/elements.json                  generated, committed 118-element dataset
src/data/elements.ts                    typed lookup and dataset validation
src/data/elements.test.ts               count, uniqueness, and category coverage tests
src/policy/categoryColors.ts            shared category color policy
src/policy/categoryColors.test.ts       policy coverage tests
src/adapters/BrowserEventBus.ts          local plus BroadcastChannel transport
src/adapters/BrowserEventBus.test.ts     validation and local-delivery tests
src/adapters/MouseInteractionSource.ts   normalized mouse samples
src/adapters/HandInteractionSource.ts    webcam and MediaPipe samples
src/adapters/handMath.ts                 landmark-to-pointer and pinch calculations
src/adapters/handMath.test.ts            scale-independent pinch tests
src/hooks/useExhibitEventBus.ts          React subscription lifecycle
src/ui/table/TableDisplay.tsx            table route orchestration
src/ui/table/PeriodicTable.tsx           semantic grid and cursor
src/ui/table/PeriodicTable.test.tsx      all-cell and state rendering tests
src/ui/table/SetupDrawer.tsx              permission, preview, calibration, debug UI
src/ui/table/VirtualLights.tsx            perimeter pulse renderer
src/ui/info/InfoDisplay.tsx               attract state and element portrait
src/ui/info/InfoDisplay.test.tsx          receiver and transition tests
src/styles/global.css                     full visual system and reduced-motion rules
src/test/setup.ts                         Testing Library matchers
```

---

### Task 1: Application shell and route boundary

**Files:**

- Create: `package.json`
- Create: `tsconfig.json`
- Create: `vite.config.ts`
- Create: `index.html`
- Create: `src/main.tsx`
- Create: `src/app/App.tsx`
- Create: `src/app/App.test.tsx`
- Create: `src/test/setup.ts`
- Create: `src/styles/global.css`

**Interfaces:**

- Produces: `App({ path?: string }): JSX.Element`, stable `/table` and `/info` route shells, `npm run dev`, `npm test`, and `npm run build`.

- [ ] **Step 1: Install the application and test dependencies**

Run:

```bash
npm install react react-dom @mediapipe/tasks-vision
npm install --save-dev vite @vitejs/plugin-react typescript vitest jsdom @testing-library/react @testing-library/jest-dom @types/react @types/react-dom
npm pkg set type=module
npm pkg set scripts.dev=vite
npm pkg set scripts.build="tsc --noEmit && vite build"
npm pkg set scripts.test="vitest"
npm pkg set scripts.data:refresh="node scripts/fetch-elements.mjs"
```

Expected: `package.json` and `package-lock.json` exist, and `npm ls --depth=0` exits successfully.

- [ ] **Step 2: Add strict Vite and test configuration**

Create `tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "useDefineForClassFields": true,
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "allowJs": false,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "allowSyntheticDefaultImports": true,
    "strict": true,
    "forceConsistentCasingInFileNames": true,
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx"
  },
  "include": ["src", "vite.config.ts"]
}
```

Create `vite.config.ts`:

```ts
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    css: true,
  },
});
```

Create `src/test/setup.ts`:

```ts
import "@testing-library/jest-dom/vitest";
import { vi } from "vitest";

class BroadcastChannelStub {
  onmessage: ((event: MessageEvent<unknown>) => void) | null = null;
  postMessage() {}
  close() {}
}

vi.stubGlobal("BroadcastChannel", BroadcastChannelStub);
```

- [ ] **Step 3: Write the failing route test**

Create `src/app/App.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { App } from "./App";

describe("App routes", () => {
  it("renders the table display", () => {
    render(<App path="/table" />);
    expect(screen.getByRole("main", { name: /periodic table display/i })).toBeInTheDocument();
  });

  it("renders the info display", () => {
    render(<App path="/info" />);
    expect(screen.getByRole("main", { name: /element information display/i })).toBeInTheDocument();
  });

  it("redirects unknown paths to the table experience", () => {
    render(<App path="/" />);
    expect(screen.getByRole("main", { name: /periodic table display/i })).toBeInTheDocument();
  });
});
```

- [ ] **Step 4: Run the route test and verify the red state**

Run: `npm test -- --run src/app/App.test.tsx`

Expected: FAIL because `src/app/App.tsx` does not exist.

- [ ] **Step 5: Implement the minimal route shell**

Create `src/app/App.tsx`:

```tsx
type AppProps = { path?: string };

export function App({ path = window.location.pathname }: AppProps) {
  if (path === "/info") {
    return <main aria-label="Element information display">Choose an element at the table</main>;
  }

  return <main aria-label="Periodic table display">Point, then pinch to choose.</main>;
}
```

Create `src/main.tsx`:

```tsx
import { createRoot } from "react-dom/client";
import { App } from "./app/App";
import "./styles/global.css";

createRoot(document.getElementById("root")!).render(<App />);
```

Create `index.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="theme-color" content="#080b10" />
    <title>Periodic Table Touch Exhibit</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

Create `src/styles/global.css`:

```css
:root {
  color: #f4efe6;
  background: #080b10;
  font-family: Inter, ui-sans-serif, system-ui, sans-serif;
}
* {
  box-sizing: border-box;
}
html,
body,
#root {
  min-height: 100%;
  margin: 0;
}
button,
input {
  font: inherit;
}
```

- [ ] **Step 6: Verify and commit the route shell**

Run:

```bash
npm test -- --run src/app/App.test.tsx
npm run build
git add package.json package-lock.json tsconfig.json vite.config.ts index.html src
git commit -m "feat: scaffold exhibit display routes"
```

Expected: 3 route tests pass; TypeScript and Vite build succeed.

---

### Task 2: Local element dataset, layout, and category policy

**Files:**

- Create: `scripts/fetch-elements.mjs`
- Create: `src/domain/types.ts`
- Create: `src/domain/elementLayout.ts`
- Create: `src/domain/elementLayout.test.ts`
- Create: `src/data/elements.json`
- Create: `src/data/elements.ts`
- Create: `src/data/elements.test.ts`
- Create: `src/policy/categoryColors.ts`
- Create: `src/policy/categoryColors.test.ts`

**Interfaces:**

- Produces: `ElementRecord`, `elements`, `getElement(atomicNumber)`, `getElementPosition(atomicNumber)`, `hitTestElement(point)`, `CATEGORY_COLORS`, and `getCategoryColor(category)`.
- Consumes: PubChem’s one-request periodic-table JSON endpoint only during dataset generation; the shipped app reads local JSON only.

- [ ] **Step 1: Define shared domain types**

Create `src/domain/types.ts`:

```ts
export type ElementCategory =
  | "alkali-metal"
  | "alkaline-earth-metal"
  | "transition-metal"
  | "post-transition-metal"
  | "metalloid"
  | "nonmetal"
  | "halogen"
  | "noble-gas"
  | "lanthanide"
  | "actinide"
  | "unknown";

export type Point = { x: number; y: number };
export type GridPosition = { row: number; column: number };

export type ElementRecord = {
  atomicNumber: number;
  symbol: string;
  name: string;
  atomicMass: string;
  category: ElementCategory;
  blurb: string;
  funFact: string;
  gridRow: number;
  gridColumn: number;
};

export type ElementSelectedEvent = {
  type: "elementSelected";
  atomicNumber: number;
  timestamp: number;
};

export type LightsPulseEvent = {
  type: "lightsPulse";
  category: ElementCategory;
  intensity: number;
};

export type ExhibitEvent = ElementSelectedEvent | LightsPulseEvent;
export type LightCue = { category: ElementCategory; intensity: number };
```

- [ ] **Step 2: Write failing data, layout, and policy tests**

Create `src/data/elements.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { elements, getElement } from "./elements";

describe("element data", () => {
  it("contains exactly 118 unique atomic numbers", () => {
    expect(elements).toHaveLength(118);
    expect(new Set(elements.map((element) => element.atomicNumber)).size).toBe(118);
  });

  it("resolves representative elements", () => {
    expect(getElement(1)?.symbol).toBe("H");
    expect(getElement(79)?.name).toBe("Gold");
    expect(getElement(118)?.symbol).toBe("Og");
  });

  it("provides portfolio copy for every element", () => {
    expect(
      elements.every((element) => element.blurb.length > 10 && element.funFact.length > 10),
    ).toBe(true);
  });
});
```

Create `src/domain/elementLayout.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { getElementPosition, hitTestElement } from "./elementLayout";

describe("periodic table layout", () => {
  it("places recognizable edge and series elements", () => {
    expect(getElementPosition(1)).toEqual({ row: 1, column: 1 });
    expect(getElementPosition(2)).toEqual({ row: 1, column: 18 });
    expect(getElementPosition(57)).toEqual({ row: 8, column: 3 });
    expect(getElementPosition(118)).toEqual({ row: 7, column: 18 });
  });

  it("hit-tests normalized table coordinates", () => {
    expect(hitTestElement({ x: 0.01, y: 0.01 })).toBe(1);
    expect(hitTestElement({ x: 0.99, y: 0.01 })).toBe(2);
  });
});
```

Create `src/policy/categoryColors.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { elements } from "../data/elements";
import { getCategoryColor } from "./categoryColors";

describe("category color policy", () => {
  it("maps every dataset category to a CSS hex color", () => {
    for (const element of elements)
      expect(getCategoryColor(element.category)).toMatch(/^#[0-9a-f]{6}$/i);
  });
});
```

- [ ] **Step 3: Run the tests and verify the red state**

Run: `npm test -- --run src/data/elements.test.ts src/domain/elementLayout.test.ts src/policy/categoryColors.test.ts`

Expected: FAIL because the data, layout, and policy modules do not exist.

- [ ] **Step 4: Implement the canonical grid and category policy**

Create `src/domain/elementLayout.ts`:

```ts
import type { GridPosition, Point } from "./types";

export function getElementPosition(n: number): GridPosition {
  if (n === 1) return { row: 1, column: 1 };
  if (n === 2) return { row: 1, column: 18 };
  if (n >= 3 && n <= 4) return { row: 2, column: n - 2 };
  if (n >= 5 && n <= 10) return { row: 2, column: n + 8 };
  if (n >= 11 && n <= 12) return { row: 3, column: n - 10 };
  if (n >= 13 && n <= 18) return { row: 3, column: n };
  if (n >= 19 && n <= 36) return { row: 4, column: n - 18 };
  if (n >= 37 && n <= 54) return { row: 5, column: n - 36 };
  if (n >= 55 && n <= 56) return { row: 6, column: n - 54 };
  if (n >= 57 && n <= 71) return { row: 8, column: n - 54 };
  if (n >= 72 && n <= 86) return { row: 6, column: n - 68 };
  if (n >= 87 && n <= 88) return { row: 7, column: n - 86 };
  if (n >= 89 && n <= 103) return { row: 9, column: n - 86 };
  if (n >= 104 && n <= 118) return { row: 7, column: n - 100 };
  throw new RangeError(`Atomic number out of range: ${n}`);
}

const atomicNumberByCell = new Map(
  Array.from({ length: 118 }, (_, index) => index + 1).map((atomicNumber) => {
    const { row, column } = getElementPosition(atomicNumber);
    return [`${row}:${column}`, atomicNumber] as const;
  }),
);

export function hitTestElement(point: Point): number | undefined {
  if (point.x < 0 || point.x > 1 || point.y < 0 || point.y > 1) return undefined;
  const column = Math.min(18, Math.floor(point.x * 18) + 1);
  const row = Math.min(9, Math.floor(point.y * 9) + 1);
  return atomicNumberByCell.get(`${row}:${column}`);
}
```

Create `src/policy/categoryColors.ts`:

```ts
import type { ElementCategory } from "../domain/types";

export const CATEGORY_COLORS: Record<ElementCategory, string> = {
  "alkali-metal": "#ff6b6b",
  "alkaline-earth-metal": "#ff9f43",
  "transition-metal": "#feca57",
  "post-transition-metal": "#54a0ff",
  metalloid: "#5fdfb2",
  nonmetal: "#48dbfb",
  halogen: "#a66cff",
  "noble-gas": "#ff7ac6",
  lanthanide: "#e7a7ff",
  actinide: "#ff8f70",
  unknown: "#aab4c0",
};

export function getCategoryColor(category: ElementCategory) {
  return CATEGORY_COLORS[category];
}
```

- [ ] **Step 5: Generate and commit the local 118-element JSON file**

Create `scripts/fetch-elements.mjs`:

```js
import { mkdir, writeFile } from "node:fs/promises";

const sourceUrl = "https://pubchem.ncbi.nlm.nih.gov/rest/pug/periodictable/JSON";
const categoryMap = new Map([
  ["Alkali metal", "alkali-metal"],
  ["Alkaline earth metal", "alkaline-earth-metal"],
  ["Transition metal", "transition-metal"],
  ["Post-transition metal", "post-transition-metal"],
  ["Metalloid", "metalloid"],
  ["Nonmetal", "nonmetal"],
  ["Halogen", "halogen"],
  ["Noble gas", "noble-gas"],
  ["Lanthanide", "lanthanide"],
  ["Actinide", "actinide"],
]);

function position(n) {
  if (n === 1) return [1, 1];
  if (n === 2) return [1, 18];
  if (n <= 4) return [2, n - 2];
  if (n <= 10) return [2, n + 8];
  if (n <= 12) return [3, n - 10];
  if (n <= 18) return [3, n];
  if (n <= 36) return [4, n - 18];
  if (n <= 54) return [5, n - 36];
  if (n <= 56) return [6, n - 54];
  if (n <= 71) return [8, n - 54];
  if (n <= 86) return [6, n - 68];
  if (n <= 88) return [7, n - 86];
  if (n <= 103) return [9, n - 86];
  return [7, n - 100];
}

const response = await fetch(sourceUrl);
if (!response.ok) throw new Error(`PubChem request failed: ${response.status}`);
const payload = await response.json();
const elements = payload.Table.Row.map(({ Cell: cell }) => {
  const atomicNumber = Number(cell[0]);
  const [gridRow, gridColumn] = position(atomicNumber);
  const groupBlock = cell[15] || "Unknown category";
  const category = categoryMap.get(groupBlock) ?? "unknown";
  const state = cell[11] ? cell[11].toLowerCase() : "not assigned";
  const discovery =
    cell[16] === "Ancient"
      ? "Known to people since ancient times."
      : cell[16]
        ? `First identified in ${cell[16]}.`
        : "Its discovery date has not been assigned.";
  return {
    atomicNumber,
    symbol: cell[1],
    name: cell[2],
    atomicMass: cell[3],
    category,
    blurb: `${cell[2]} is classified as ${groupBlock.toLowerCase()}. Its standard state is ${state}.`,
    funFact: discovery,
    gridRow,
    gridColumn,
  };
});
if (elements.length !== 118) throw new Error(`Expected 118 elements, received ${elements.length}`);
await mkdir("src/data", { recursive: true });
await writeFile("src/data/elements.json", `${JSON.stringify(elements, null, 2)}\n`);
```

Run: `npm run data:refresh`

Expected: one PubChem request succeeds and `src/data/elements.json` contains 118 records. Runtime code must never call PubChem. PubChem documents this periodic-table endpoint at `https://pubchem.ncbi.nlm.nih.gov/docs/pug-rest`.

Create `src/data/elements.ts`:

```ts
import rawElements from "./elements.json";
import type { ElementRecord } from "../domain/types";

export const elements = rawElements as ElementRecord[];
const byAtomicNumber = new Map(elements.map((element) => [element.atomicNumber, element]));

export function getElement(atomicNumber: number) {
  return byAtomicNumber.get(atomicNumber);
}
```

- [ ] **Step 6: Verify and commit data behavior**

Run:

```bash
npm test -- --run src/data/elements.test.ts src/domain/elementLayout.test.ts src/policy/categoryColors.test.ts
npm run build
git add scripts src/domain src/data src/policy package.json package-lock.json
git commit -m "feat: add local periodic element data"
```

Expected: all data/layout/color tests pass and the build succeeds.

---

### Task 3: Event transport and information display

**Files:**

- Create: `src/domain/config.ts`
- Create: `src/adapters/BrowserEventBus.ts`
- Create: `src/adapters/BrowserEventBus.test.ts`
- Create: `src/hooks/useExhibitEventBus.ts`
- Create: `src/ui/info/InfoDisplay.tsx`
- Create: `src/ui/info/InfoDisplay.test.tsx`
- Modify: `src/app/App.tsx`
- Modify: `src/styles/global.css`

**Interfaces:**

- Produces: `BrowserEventBus`, `isExhibitEvent(value)`, `useExhibitEventBus(onEvent)`, and `InfoDisplay`.
- Consumes: `ExhibitEvent`, `getElement`, and `getCategoryColor` from Task 2.

- [ ] **Step 1: Write failing event-bus and receiver tests**

Create `src/adapters/BrowserEventBus.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { BrowserEventBus, isExhibitEvent, type ChannelLike } from "./BrowserEventBus";

function fakeChannel(): ChannelLike {
  return { postMessage: vi.fn(), close: vi.fn(), onmessage: null };
}

describe("BrowserEventBus", () => {
  it("validates the stable contracts", () => {
    expect(isExhibitEvent({ type: "elementSelected", atomicNumber: 79, timestamp: 10 })).toBe(true);
    expect(isExhibitEvent({ type: "lightsPulse", category: "noble-gas", intensity: 0.8 })).toBe(
      true,
    );
    expect(isExhibitEvent({ type: "elementSelected", atomicNumber: 0, timestamp: 10 })).toBe(false);
    expect(isExhibitEvent({ type: "lightsPulse", category: "laser", intensity: 2 })).toBe(false);
  });

  it("delivers published events locally and to the browser channel", () => {
    const channel = fakeChannel();
    const bus = new BrowserEventBus(channel);
    const listener = vi.fn();
    bus.subscribe(listener);
    const event = { type: "elementSelected", atomicNumber: 79, timestamp: 10 } as const;
    bus.publish(event);
    expect(listener).toHaveBeenCalledWith(event);
    expect(channel.postMessage).toHaveBeenCalledWith(event);
  });
});
```

Create `src/ui/info/InfoDisplay.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { InfoDisplay } from "./InfoDisplay";

describe("InfoDisplay", () => {
  it("shows the attract state without a selection", () => {
    render(<InfoDisplay selectedAtomicNumber={null} />);
    expect(screen.getByText(/choose an element at the table/i)).toBeInTheDocument();
  });

  it("renders an element portrait", () => {
    render(<InfoDisplay selectedAtomicNumber={79} />);
    expect(screen.getByRole("heading", { name: "Gold" })).toBeInTheDocument();
    expect(screen.getByText("Au")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run both tests and verify the red state**

Run: `npm test -- --run src/adapters/BrowserEventBus.test.ts src/ui/info/InfoDisplay.test.tsx`

Expected: FAIL because the adapter and display do not exist.

- [ ] **Step 3: Implement validation and local-plus-channel delivery**

Create `src/domain/config.ts`:

```ts
export const EXHIBIT_CHANNEL = "periodic-table-touch-exhibit";
export const PINCH_ENGAGE = 0.28;
export const PINCH_RELEASE = 0.38;
export const MIN_TRACKING_CONFIDENCE = 0.5;
export const SAME_CELL_DEBOUNCE_MS = 1_000;
```

Create `src/adapters/BrowserEventBus.ts`:

```ts
import { CATEGORY_COLORS } from "../policy/categoryColors";
import type { ExhibitEvent } from "../domain/types";

export type ChannelLike = {
  postMessage(value: unknown): void;
  close(): void;
  onmessage: ((event: MessageEvent<unknown>) => void) | null;
};

export function isExhibitEvent(value: unknown): value is ExhibitEvent {
  if (!value || typeof value !== "object") return false;
  const event = value as Record<string, unknown>;
  if (event.type === "elementSelected") {
    return (
      Number.isInteger(event.atomicNumber) &&
      Number(event.atomicNumber) >= 1 &&
      Number(event.atomicNumber) <= 118 &&
      Number.isFinite(event.timestamp)
    );
  }
  if (event.type === "lightsPulse") {
    return (
      typeof event.category === "string" &&
      event.category in CATEGORY_COLORS &&
      typeof event.intensity === "number" &&
      event.intensity >= 0 &&
      event.intensity <= 1
    );
  }
  return false;
}

export class BrowserEventBus {
  private listeners = new Set<(event: ExhibitEvent) => void>();

  constructor(private channel: ChannelLike) {
    channel.onmessage = ({ data }) => {
      if (isExhibitEvent(data)) this.emit(data);
    };
  }

  publish(event: ExhibitEvent) {
    this.emit(event);
    this.channel.postMessage(event);
  }
  subscribe(listener: (event: ExhibitEvent) => void) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
  close() {
    this.channel.close();
    this.listeners.clear();
  }
  private emit(event: ExhibitEvent) {
    for (const listener of this.listeners) listener(event);
  }
}
```

Create `src/hooks/useExhibitEventBus.ts`:

```ts
import { useEffect } from "react";
import type { ExhibitEvent } from "../domain/types";
import { type BrowserEventBus } from "../adapters/BrowserEventBus";

export function useExhibitEventBus(bus: BrowserEventBus, onEvent: (event: ExhibitEvent) => void) {
  useEffect(() => bus.subscribe(onEvent), [bus, onEvent]);
}
```

- [ ] **Step 4: Implement the information portrait and route composition**

Create `src/ui/info/InfoDisplay.tsx`:

```tsx
import type { CSSProperties } from "react";
import { getElement } from "../../data/elements";
import { getCategoryColor } from "../../policy/categoryColors";

export function InfoDisplay({ selectedAtomicNumber }: { selectedAtomicNumber: number | null }) {
  const element = selectedAtomicNumber ? getElement(selectedAtomicNumber) : undefined;
  if (!element)
    return (
      <main className="info-display info-attract" aria-label="Element information display">
        <p>Choose an element at the table</p>
      </main>
    );
  const accent = getCategoryColor(element.category);
  return (
    <main
      className="info-display"
      aria-label="Element information display"
      style={{ "--accent": accent } as CSSProperties}
    >
      <article className="element-portrait" key={element.atomicNumber}>
        <p className="element-kicker">Element {element.atomicNumber}</p>
        <div className="element-symbol" aria-hidden="true">
          {element.symbol}
        </div>
        <h1>{element.name}</h1>
        <p className="element-category">{element.category.replaceAll("-", " ")}</p>
        <p className="element-blurb">{element.blurb}</p>
        <dl>
          <div>
            <dt>Atomic mass</dt>
            <dd>{element.atomicMass}</dd>
          </div>
        </dl>
        <p className="element-fact">{element.funFact}</p>
      </article>
    </main>
  );
}
```

Replace `src/app/App.tsx` with one bus per window, a child receiver component, and the temporary table shell:

```tsx
import { useCallback, useEffect, useState } from "react";
import { BrowserEventBus } from "../adapters/BrowserEventBus";
import { EXHIBIT_CHANNEL } from "../domain/config";
import type { ExhibitEvent } from "../domain/types";
import { useExhibitEventBus } from "../hooks/useExhibitEventBus";
import { InfoDisplay } from "../ui/info/InfoDisplay";

function InfoRoute({ bus }: { bus: BrowserEventBus }) {
  const [selectedAtomicNumber, setSelectedAtomicNumber] = useState<number | null>(null);
  const onEvent = useCallback((event: ExhibitEvent) => {
    if (event.type === "elementSelected") setSelectedAtomicNumber(event.atomicNumber);
  }, []);
  useExhibitEventBus(bus, onEvent);
  return <InfoDisplay selectedAtomicNumber={selectedAtomicNumber} />;
}

export function App({ path = window.location.pathname }: { path?: string }) {
  const [bus] = useState(() => new BrowserEventBus(new BroadcastChannel(EXHIBIT_CHANNEL)));
  useEffect(() => () => bus.close(), [bus]);
  if (path === "/info") return <InfoRoute bus={bus} />;
  return <main aria-label="Periodic table display">Point, then pinch to choose.</main>;
}
```

Add an `info-display` section to `src/styles/global.css` with full-viewport layout, `--accent` glow, oversized `.element-symbol`, and a `@media (prefers-reduced-motion: reduce)` rule that disables transforms and uses opacity-only transitions.

- [ ] **Step 5: Verify and commit messaging and info display**

Run:

```bash
npm test -- --run src/adapters/BrowserEventBus.test.ts src/ui/info/InfoDisplay.test.tsx src/app/App.test.tsx
npm run build
git add src
git commit -m "feat: add cross-display element stories"
```

Expected: contract, receiver, and route tests pass; build succeeds.

---

### Task 4: Pure interaction controller and mouse-complete table

**Files:**

- Create: `src/domain/interaction.ts`
- Create: `src/domain/interaction.test.ts`
- Create: `src/adapters/MouseInteractionSource.ts`
- Create: `src/ui/table/PeriodicTable.tsx`
- Create: `src/ui/table/PeriodicTable.test.tsx`
- Create: `src/ui/table/TableDisplay.tsx`
- Create: `src/ui/table/VirtualLights.tsx`
- Modify: `src/app/App.tsx`
- Modify: `src/styles/global.css`

**Interfaces:**

- Produces: `InteractionState`, `PointerSample`, `createInteractionState()`, `stepInteraction(state, sample)`, `MouseInteractionSource`, and a complete mouse-driven `/table` route.
- Consumes: `hitTestElement`, `elements`, `BrowserEventBus`, and category colors.

- [ ] **Step 1: Write failing state-machine tests**

Create `src/domain/interaction.test.ts` with cases for hover, mouse confirmation, pinch hysteresis, tracking loss, and debounce:

```ts
import { describe, expect, it } from "vitest";
import { createInteractionState, stepInteraction } from "./interaction";

const hand = (pinchRatio: number, timestamp: number) => ({
  x: 0.01,
  y: 0.01,
  source: "hand" as const,
  tracked: true,
  confidence: 0.9,
  pinchRatio,
  confirm: false,
  timestamp,
});

describe("interaction controller", () => {
  it("hovers then confirms on a pinch edge", () => {
    const hover = stepInteraction(createInteractionState(), hand(0.5, 0));
    const selected = stepInteraction(hover.state, hand(0.2, 16));
    expect(hover.state.phase).toBe("hover");
    expect(selected.event?.atomicNumber).toBe(1);
  });

  it("requires release and debounces the same cell", () => {
    const first = stepInteraction(createInteractionState(), hand(0.2, 0));
    const held = stepInteraction(first.state, hand(0.2, 100));
    const released = stepInteraction(held.state, hand(0.5, 200));
    const blocked = stepInteraction(released.state, hand(0.2, 500));
    const allowed = stepInteraction(blocked.state, hand(0.5, 1_100));
    const second = stepInteraction(allowed.state, hand(0.2, 1_200));
    expect(held.event).toBeUndefined();
    expect(blocked.event).toBeUndefined();
    expect(second.event?.atomicNumber).toBe(1);
  });

  it("uses the same path for mouse confirmation and clears hover on tracking loss", () => {
    const mouse = stepInteraction(createInteractionState(), {
      x: 0.01,
      y: 0.01,
      source: "mouse",
      tracked: true,
      confidence: 1,
      confirm: true,
      timestamp: 0,
    });
    const lost = stepInteraction(mouse.state, {
      x: 0,
      y: 0,
      source: "hand",
      tracked: false,
      confidence: 0,
      confirm: false,
      timestamp: 10,
    });
    expect(mouse.event?.atomicNumber).toBe(1);
    expect(lost.state.hoveredAtomicNumber).toBeUndefined();
  });
});
```

Create `src/ui/table/PeriodicTable.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { createRef } from "react";
import { describe, expect, it } from "vitest";
import { createInteractionState } from "../../domain/interaction";
import { PeriodicTable } from "./PeriodicTable";

describe("PeriodicTable", () => {
  it("renders every element as an accessible cell", () => {
    render(<PeriodicTable ref={createRef<HTMLDivElement>()} state={createInteractionState()} />);
    expect(screen.getAllByRole("button", { name: /atomic number/i })).toHaveLength(118);
    expect(screen.getByRole("button", { name: /hydrogen, atomic number 1/i })).toHaveAttribute(
      "data-phase",
      "rest",
    );
  });
});
```

- [ ] **Step 2: Run the controller test and verify the red state**

Run: `npm test -- --run src/domain/interaction.test.ts src/ui/table/PeriodicTable.test.tsx`

Expected: FAIL because `interaction.ts` and `PeriodicTable.tsx` do not exist.

- [ ] **Step 3: Implement the pure controller**

Create `src/domain/interaction.ts`:

```ts
import { hitTestElement } from "./elementLayout";
import {
  MIN_TRACKING_CONFIDENCE,
  PINCH_ENGAGE,
  PINCH_RELEASE,
  SAME_CELL_DEBOUNCE_MS,
} from "./config";
import type { ElementSelectedEvent } from "./types";

export type PointerSample = {
  x: number;
  y: number;
  source: "mouse" | "hand";
  tracked: boolean;
  confidence: number;
  pinchRatio?: number;
  confirm: boolean;
  timestamp: number;
};
export type InteractionState = {
  phase: "idle" | "hover" | "armed" | "confirmed" | "cooldown";
  hoveredAtomicNumber?: number;
  selectedAtomicNumber?: number;
  selectedAt?: number;
  pinchEngaged: boolean;
};

export function createInteractionState(): InteractionState {
  return { phase: "idle", pinchEngaged: false };
}

export function stepInteraction(
  state: InteractionState,
  sample: PointerSample,
): { state: InteractionState; event?: ElementSelectedEvent } {
  if (!sample.tracked || sample.confidence < MIN_TRACKING_CONFIDENCE)
    return {
      state: { ...state, phase: "idle", hoveredAtomicNumber: undefined, pinchEngaged: false },
    };
  const hoveredAtomicNumber = hitTestElement(sample);
  const released =
    sample.source === "hand" &&
    sample.pinchRatio !== undefined &&
    sample.pinchRatio >= PINCH_RELEASE;
  const pinchEdge =
    sample.source === "hand" &&
    sample.pinchRatio !== undefined &&
    sample.pinchRatio <= PINCH_ENGAGE &&
    !state.pinchEngaged;
  const pinchEngaged = released ? false : state.pinchEngaged || pinchEdge;
  const confirm = sample.confirm || pinchEdge;
  const blocked =
    hoveredAtomicNumber === state.selectedAtomicNumber &&
    state.selectedAt !== undefined &&
    sample.timestamp - state.selectedAt < SAME_CELL_DEBOUNCE_MS;
  if (hoveredAtomicNumber && confirm && !blocked) {
    const event = {
      type: "elementSelected",
      atomicNumber: hoveredAtomicNumber,
      timestamp: sample.timestamp,
    } as const;
    return {
      state: {
        phase: "confirmed",
        hoveredAtomicNumber,
        selectedAtomicNumber: hoveredAtomicNumber,
        selectedAt: sample.timestamp,
        pinchEngaged,
      },
      event,
    };
  }
  return {
    state: {
      ...state,
      phase: blocked ? "cooldown" : pinchEngaged ? "armed" : hoveredAtomicNumber ? "hover" : "idle",
      hoveredAtomicNumber,
      pinchEngaged,
    },
  };
}
```

- [ ] **Step 4: Implement the mouse adapter and table UI**

Create `src/adapters/MouseInteractionSource.ts`:

```ts
import type { PointerSample } from "../domain/interaction";

export class MouseInteractionSource {
  private onMove?: (event: PointerEvent) => void;
  private onDown?: (event: PointerEvent) => void;

  start(element: HTMLElement, listener: (sample: PointerSample) => void) {
    const emit = (event: PointerEvent, confirm: boolean) => {
      const rect = element.getBoundingClientRect();
      listener({
        x: (event.clientX - rect.left) / rect.width,
        y: (event.clientY - rect.top) / rect.height,
        source: "mouse",
        tracked: true,
        confidence: 1,
        confirm,
        timestamp: performance.now(),
      });
    };
    this.onMove = (event) => emit(event, false);
    this.onDown = (event) => {
      if (event.button === 0) emit(event, true);
    };
    element.addEventListener("pointermove", this.onMove);
    element.addEventListener("pointerdown", this.onDown);
  }

  stop(element: HTMLElement) {
    if (this.onMove) element.removeEventListener("pointermove", this.onMove);
    if (this.onDown) element.removeEventListener("pointerdown", this.onDown);
  }
}
```

Create `src/ui/table/PeriodicTable.tsx`:

```tsx
import { forwardRef, type CSSProperties } from "react";
import type { InteractionState } from "../../domain/interaction";
import type { Point } from "../../domain/types";
import { elements } from "../../data/elements";
import { getCategoryColor } from "../../policy/categoryColors";

type PeriodicTableProps = { state: InteractionState; handPoint?: Point };

export const PeriodicTable = forwardRef<HTMLDivElement, PeriodicTableProps>(function PeriodicTable(
  { state, handPoint },
  ref,
) {
  return (
    <div className="periodic-table" ref={ref}>
      {elements.map((element) => {
        const phase = state.hoveredAtomicNumber === element.atomicNumber ? state.phase : "rest";
        const style = {
          gridRow: element.gridRow,
          gridColumn: element.gridColumn,
          "--accent": getCategoryColor(element.category),
        } as CSSProperties;
        return (
          <button
            type="button"
            className="element-cell"
            style={style}
            data-phase={phase}
            data-selected={state.selectedAtomicNumber === element.atomicNumber}
            aria-label={`${element.name}, atomic number ${element.atomicNumber}`}
            key={element.atomicNumber}
          >
            <span className="cell-number">{element.atomicNumber}</span>
            <strong className="cell-symbol">{element.symbol}</strong>
          </button>
        );
      })}
      {handPoint ? (
        <span
          className="hand-cursor"
          style={{ left: `${handPoint.x * 100}%`, top: `${handPoint.y * 100}%` }}
        />
      ) : null}
    </div>
  );
});
```

Create `src/ui/table/VirtualLights.tsx`:

```tsx
import type { CSSProperties } from "react";
import type { LightCue } from "../../domain/types";
import { getCategoryColor } from "../../policy/categoryColors";

export function VirtualLights({ cue, pulseId }: { cue: LightCue | null; pulseId: number }) {
  const accent = cue ? getCategoryColor(cue.category) : "#6b7280";
  return (
    <div
      key={pulseId}
      className="virtual-lights"
      data-pulsing={Boolean(cue)}
      style={{ "--accent": accent } as CSSProperties}
      aria-hidden="true"
    />
  );
}
```

Create `src/ui/table/TableDisplay.tsx`:

```tsx
import { useCallback, useEffect, useRef, useState } from "react";
import { MouseInteractionSource } from "../../adapters/MouseInteractionSource";
import type { BrowserEventBus } from "../../adapters/BrowserEventBus";
import {
  createInteractionState,
  stepInteraction,
  type InteractionState,
  type PointerSample,
} from "../../domain/interaction";
import type { LightCue, Point } from "../../domain/types";
import { getElement } from "../../data/elements";
import { PeriodicTable } from "./PeriodicTable";
import { VirtualLights } from "./VirtualLights";

export function TableDisplay({ bus }: { bus: BrowserEventBus }) {
  const tableRef = useRef<HTMLDivElement>(null);
  const stateRef = useRef<InteractionState>(createInteractionState());
  const [state, setState] = useState(stateRef.current);
  const [handPoint, setHandPoint] = useState<Point>();
  const [lightCue, setLightCue] = useState<LightCue | null>(null);
  const [pulseId, setPulseId] = useState(0);

  const handleSample = useCallback(
    (sample: PointerSample) => {
      const result = stepInteraction(stateRef.current, sample);
      stateRef.current = result.state;
      setState(result.state);
      setHandPoint(
        sample.source === "hand" && sample.tracked ? { x: sample.x, y: sample.y } : undefined,
      );
      if (!result.event) return;
      const element = getElement(result.event.atomicNumber)!;
      bus.publish(result.event);
      bus.publish({ type: "lightsPulse", category: element.category, intensity: 1 });
    },
    [bus],
  );

  useEffect(
    () =>
      bus.subscribe((event) => {
        if (event.type === "lightsPulse") {
          setLightCue(event);
          setPulseId((value) => value + 1);
        }
      }),
    [bus],
  );

  useEffect(() => {
    const element = tableRef.current;
    if (!element) return;
    const source = new MouseInteractionSource();
    source.start(element, handleSample);
    return () => source.stop(element);
  }, [handleSample]);

  return (
    <main className="table-display" aria-label="Periodic table display">
      <p className="interaction-instruction">Point, then pinch to choose.</p>
      <PeriodicTable ref={tableRef} state={state} handPoint={handPoint} />
      <VirtualLights cue={lightCue} pulseId={pulseId} />
    </main>
  );
}
```

Attach no independent `onClick` handlers to cells. In `App.tsx`, render `<TableDisplay bus={bus} />` for every route except `/info`.

- [ ] **Step 5: Add the gallery table styling**

In `src/styles/global.css`, add:

```css
.table-display {
  min-height: 100vh;
  padding: 2.5rem;
  background: radial-gradient(circle at 50% 40%, #141b27, #07090d 70%);
  overflow: hidden;
}
.periodic-table {
  position: relative;
  display: grid;
  grid-template-columns: repeat(18, minmax(0, 1fr));
  grid-template-rows: repeat(9, minmax(0, 1fr));
  gap: clamp(3px, 0.45vw, 10px);
  aspect-ratio: 18 / 9;
}
.element-cell {
  border: 1px solid color-mix(in srgb, var(--accent) 38%, transparent);
  background: #111722;
  color: #f4efe6;
  border-radius: 0.55rem;
  transition:
    transform 140ms ease,
    box-shadow 140ms ease,
    background 140ms ease;
}
.element-cell[data-phase="hover"] {
  transform: translateY(-4px);
  box-shadow: 0 0 24px color-mix(in srgb, var(--accent) 52%, transparent);
}
.element-cell[data-phase="armed"] {
  transform: scale(0.96);
  background: color-mix(in srgb, var(--accent) 24%, #111722);
}
.element-cell[data-phase="confirmed"] {
  animation: confirm-cell 380ms ease;
}
.virtual-lights {
  position: fixed;
  inset: 1rem;
  pointer-events: none;
  border: 2px solid color-mix(in srgb, var(--accent, #6b7280) 30%, transparent);
  border-radius: 1.5rem;
}
.virtual-lights[data-pulsing="true"] {
  animation: light-pulse 900ms ease-out;
}
@keyframes confirm-cell {
  45% {
    transform: scale(0.9);
  }
  70% {
    box-shadow: 0 0 38px var(--accent);
  }
}
@keyframes light-pulse {
  35% {
    border-color: var(--accent);
    box-shadow:
      inset 0 0 42px var(--accent),
      0 0 34px var(--accent);
  }
}
```

- [ ] **Step 6: Verify the mouse-complete milestone and commit**

Run:

```bash
npm test -- --run src/domain/interaction.test.ts src/adapters/BrowserEventBus.test.ts src/ui/info/InfoDisplay.test.tsx
npm run build
git add src
git commit -m "feat: complete mouse-driven exhibit flow"
```

Then run `npm run dev -- --host 127.0.0.1` and manually open `/table` and `/info`; click Hydrogen, Gold, and Oganesson and confirm both displays and the border respond.

Expected: the entire portfolio story works without camera permission.

---

### Task 5: Four-point calibration and persistence

**Files:**

- Create: `src/domain/calibration.ts`
- Create: `src/domain/calibration.test.ts`
- Create: `src/ui/table/SetupDrawer.tsx`

**Interfaces:**

- Produces: `solveHomography(sourcePoints)`, `applyHomography(transform, point)`, `saveCalibration`, `loadCalibration`, and `SetupDrawer`.
- Consumes: raw mirrored camera-space fingertip samples from Task 6; mouse behavior remains independent.

- [ ] **Step 1: Write failing transform and persistence tests**

Create `src/domain/calibration.test.ts`:

```ts
import { beforeEach, describe, expect, it } from "vitest";
import { applyHomography, loadCalibration, saveCalibration, solveHomography } from "./calibration";

describe("four-point calibration", () => {
  beforeEach(() => localStorage.clear());

  it("maps corners and center through a projective transform", () => {
    const transform = solveHomography([
      { x: 0.1, y: 0.2 },
      { x: 0.9, y: 0.1 },
      { x: 0.8, y: 0.9 },
      { x: 0.2, y: 0.8 },
    ]);
    expect(applyHomography(transform, { x: 0.1, y: 0.2 })).toEqual(
      expect.objectContaining({ x: expect.closeTo(0, 5), y: expect.closeTo(0, 5) }),
    );
    expect(applyHomography(transform, { x: 0.8, y: 0.9 })).toEqual(
      expect.objectContaining({ x: expect.closeTo(1, 5), y: expect.closeTo(1, 5) }),
    );
  });

  it("loads only matching camera and viewport data", () => {
    saveCalibration({
      cameraLabel: "Demo Cam",
      width: 1920,
      height: 1080,
      matrix: [1, 0, 0, 0, 1, 0, 0, 0, 1],
    });
    expect(loadCalibration("Demo Cam", 1920, 1080)).not.toBeNull();
    expect(loadCalibration("Other Cam", 1920, 1080)).toBeNull();
  });
});
```

- [ ] **Step 2: Run the calibration tests and verify the red state**

Run: `npm test -- --run src/domain/calibration.test.ts`

Expected: FAIL because `calibration.ts` does not exist.

- [ ] **Step 3: Implement the homography solver and storage contract**

Create `src/domain/calibration.ts`:

```ts
import type { Point } from "./types";

export type CalibrationRecord = {
  cameraLabel: string;
  width: number;
  height: number;
  matrix: number[];
};
const STORAGE_KEY = "periodic-table-calibration-v1";
const targets: Point[] = [
  { x: 0, y: 0 },
  { x: 1, y: 0 },
  { x: 1, y: 1 },
  { x: 0, y: 1 },
];

function solveLinear(matrix: number[][], values: number[]) {
  const size = values.length;
  for (let column = 0; column < size; column += 1) {
    let pivot = column;
    for (let row = column + 1; row < size; row += 1)
      if (Math.abs(matrix[row][column]) > Math.abs(matrix[pivot][column])) pivot = row;
    if (Math.abs(matrix[pivot][column]) < 1e-9)
      throw new Error("Calibration points do not define a transform");
    [matrix[column], matrix[pivot]] = [matrix[pivot], matrix[column]];
    [values[column], values[pivot]] = [values[pivot], values[column]];
    const divisor = matrix[column][column];
    for (let index = column; index < size; index += 1) matrix[column][index] /= divisor;
    values[column] /= divisor;
    for (let row = 0; row < size; row += 1) {
      if (row === column) continue;
      const factor = matrix[row][column];
      for (let index = column; index < size; index += 1)
        matrix[row][index] -= factor * matrix[column][index];
      values[row] -= factor * values[column];
    }
  }
  return values;
}

export function solveHomography(source: Point[]) {
  if (source.length !== 4) throw new Error("Four calibration points are required");
  const matrix: number[][] = [];
  const values: number[] = [];
  source.forEach(({ x, y }, index) => {
    const { x: u, y: v } = targets[index];
    matrix.push([x, y, 1, 0, 0, 0, -u * x, -u * y]);
    values.push(u);
    matrix.push([0, 0, 0, x, y, 1, -v * x, -v * y]);
    values.push(v);
  });
  return [...solveLinear(matrix, values), 1];
}

export function applyHomography(h: number[], point: Point): Point {
  const denominator = h[6] * point.x + h[7] * point.y + h[8];
  if (Math.abs(denominator) < 1e-9) throw new Error("Calibration transform is singular");
  return {
    x: (h[0] * point.x + h[1] * point.y + h[2]) / denominator,
    y: (h[3] * point.x + h[4] * point.y + h[5]) / denominator,
  };
}

export function saveCalibration(record: CalibrationRecord) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, record }));
}

export function loadCalibration(
  cameraLabel: string,
  width: number,
  height: number,
): CalibrationRecord | null {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null");
    const record = stored?.version === 1 ? (stored.record as CalibrationRecord) : null;
    if (
      !record ||
      record.cameraLabel !== cameraLabel ||
      record.width !== width ||
      record.height !== height
    )
      return null;
    if (
      !Array.isArray(record.matrix) ||
      record.matrix.length !== 9 ||
      !record.matrix.every(Number.isFinite)
    )
      return null;
    return record;
  } catch {
    return null;
  }
}

export function clearCalibration() {
  localStorage.removeItem(STORAGE_KEY);
}
```

- [ ] **Step 4: Implement the operator calibration drawer**

Create `src/ui/table/SetupDrawer.tsx`:

```tsx
import type { RefObject } from "react";

export type CameraStatus = "idle" | "loading" | "ready" | "error";
type SetupDrawerProps = {
  open: boolean;
  cameraStatus: CameraStatus;
  error: string | null;
  calibrationStep: number | null;
  videoRef: RefObject<HTMLVideoElement | null>;
  canvasRef: RefObject<HTMLCanvasElement | null>;
  onOpen(): void;
  onClose(): void;
  onEnableCamera(): void;
  onBeginCalibration(): void;
  onClearCalibration(): void;
};

const targetNames = ["top-left", "top-right", "bottom-right", "bottom-left"];

export function SetupDrawer(props: SetupDrawerProps) {
  return (
    <>
      <button className="setup-trigger" type="button" onClick={props.onOpen}>
        Setup
      </button>
      <aside
        className="setup-drawer"
        hidden={!props.open}
        aria-label="Camera and calibration setup"
      >
        <header>
          <h2>Interaction setup</h2>
          <button type="button" onClick={props.onClose}>
            Close setup
          </button>
        </header>
        <p>Mouse input is always available.</p>
        {props.error ? <p role="alert">{props.error}</p> : null}
        <div className="camera-debug">
          <video ref={props.videoRef} muted playsInline />
          <canvas ref={props.canvasRef} aria-label="Hand landmark debug view" />
        </div>
        {props.calibrationStep !== null ? (
          <div className="calibration-copy">
            <p>Aim your fingertip at the glowing target, hold steady, then press Space.</p>
            <p>
              Target {props.calibrationStep + 1} of 4: {targetNames[props.calibrationStep]}
            </p>
          </div>
        ) : null}
        <div className="setup-actions">
          <button
            type="button"
            disabled={props.cameraStatus === "loading"}
            onClick={props.onEnableCamera}
          >
            Enable camera
          </button>
          <button
            type="button"
            disabled={props.cameraStatus !== "ready"}
            onClick={props.onBeginCalibration}
          >
            Calibrate
          </button>
          <button type="button" onClick={props.onClearCalibration}>
            Clear calibration
          </button>
        </div>
      </aside>
    </>
  );
}
```

Task 6 connects camera observations, the setup drawer, and Space capture to this presentational component.

- [ ] **Step 5: Verify and commit calibration**

Run:

```bash
npm test -- --run src/domain/calibration.test.ts
npm run build
git add src
git commit -m "feat: add four-point hand calibration"
```

Expected: transform/storage tests pass and the app builds.

---

### Task 6: MediaPipe hand and pinch adapter

**Files:**

- Create: `src/adapters/handMath.ts`
- Create: `src/adapters/handMath.test.ts`
- Create: `src/adapters/HandInteractionSource.ts`
- Modify: `src/ui/table/TableDisplay.tsx`
- Modify: `src/ui/table/SetupDrawer.tsx`

**Interfaces:**

- Produces: `pinchRatio(landmarks)`, `HandInteractionSource.start`, raw observation callbacks for calibration/debug, and calibrated hand `PointerSample` delivery.
- Consumes: `HandLandmarker`, `applyHomography`, saved calibration, and the existing `handleSample` controller path.

- [ ] **Step 1: Write failing hand-math tests**

Create `src/adapters/handMath.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { pinchRatio } from "./handMath";

const landmarks = Array.from({ length: 21 }, () => ({ x: 0, y: 0, z: 0 }));

describe("pinch ratio", () => {
  it("normalizes thumb-index distance by wrist-to-middle-MCP scale", () => {
    const hand = landmarks.map((point) => ({ ...point }));
    hand[0] = { x: 0, y: 0, z: 0 };
    hand[9] = { x: 0, y: 1, z: 0 };
    hand[4] = { x: 0.4, y: 0.5, z: 0 };
    hand[8] = { x: 0.6, y: 0.5, z: 0 };
    expect(pinchRatio(hand)).toBeCloseTo(0.2);
  });
});
```

- [ ] **Step 2: Run the hand-math test and verify the red state**

Run: `npm test -- --run src/adapters/handMath.test.ts`

Expected: FAIL because `handMath.ts` does not exist.

- [ ] **Step 3: Implement scale-independent hand math**

Create `src/adapters/handMath.ts`:

```ts
export type Landmark = { x: number; y: number; z: number };
const distance = (a: Landmark, b: Landmark) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

export function pinchRatio(landmarks: Landmark[]) {
  const handScale = distance(landmarks[0], landmarks[9]);
  return handScale <= 1e-6
    ? Number.POSITIVE_INFINITY
    : distance(landmarks[4], landmarks[8]) / handScale;
}
```

- [ ] **Step 4: Implement the MediaPipe source with graceful fallback**

Create `src/adapters/HandInteractionSource.ts`:

```ts
import { FilesetResolver, HandLandmarker, type NormalizedLandmark } from "@mediapipe/tasks-vision";
import { applyHomography } from "../domain/calibration";
import type { PointerSample } from "../domain/interaction";
import type { Point } from "../domain/types";
import { pinchRatio } from "./handMath";

const wasmRoot = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm";
const modelPath =
  "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";

export type HandObservation = {
  rawPoint?: Point;
  landmarks: NormalizedLandmark[];
  confidence: number;
};
type HandSourceOptions = {
  video: HTMLVideoElement;
  onObservation(observation: HandObservation): void;
  onError(message: string): void;
};

export class HandInteractionSource {
  private landmarker?: HandLandmarker;
  private stream?: MediaStream;
  private matrix: number[] | null = null;
  private running = false;
  private lastVideoTime = -1;
  private frameId?: number;
  private videoFrameId?: number;
  private hadHand = false;

  constructor(private options: HandSourceOptions) {}

  setCalibration(matrix: number[] | null) {
    this.matrix = matrix;
  }

  async start(listener: (sample: PointerSample) => void) {
    try {
      const vision = await FilesetResolver.forVisionTasks(wasmRoot);
      const common = {
        runningMode: "VIDEO" as const,
        numHands: 1,
        minHandDetectionConfidence: 0.5,
        minHandPresenceConfidence: 0.5,
        minTrackingConfidence: 0.5,
      };
      try {
        this.landmarker = await HandLandmarker.createFromOptions(vision, {
          ...common,
          baseOptions: { modelAssetPath: modelPath, delegate: "GPU" },
        });
      } catch {
        this.landmarker = await HandLandmarker.createFromOptions(vision, {
          ...common,
          baseOptions: { modelAssetPath: modelPath },
        });
      }
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      this.options.video.srcObject = this.stream;
      await this.options.video.play();
      this.running = true;
      this.schedule(listener);
    } catch (error) {
      this.options.onError(error instanceof Error ? error.message : "Camera setup failed");
      this.stop();
      throw error;
    }
  }

  private schedule(listener: (sample: PointerSample) => void) {
    if (!this.running) return;
    const run = () => {
      this.processFrame(listener);
      this.schedule(listener);
    };
    if (typeof this.options.video.requestVideoFrameCallback === "function")
      this.videoFrameId = this.options.video.requestVideoFrameCallback(run);
    else this.frameId = requestAnimationFrame(run);
  }

  private processFrame(listener: (sample: PointerSample) => void) {
    if (
      !this.landmarker ||
      this.options.video.readyState < 2 ||
      this.options.video.currentTime === this.lastVideoTime
    )
      return;
    this.lastVideoTime = this.options.video.currentTime;
    const timestamp = performance.now();
    const result = this.landmarker.detectForVideo(this.options.video, timestamp);
    const landmarks = result.landmarks[0];
    const confidence = result.handedness[0]?.[0]?.score ?? 0;
    if (!landmarks) {
      this.options.onObservation({ landmarks: [], confidence: 0 });
      if (this.hadHand)
        listener({
          x: 0,
          y: 0,
          source: "hand",
          tracked: false,
          confidence: 0,
          confirm: false,
          timestamp,
        });
      this.hadHand = false;
      return;
    }
    this.hadHand = true;
    const rawPoint = { x: 1 - landmarks[8].x, y: landmarks[8].y };
    this.options.onObservation({ rawPoint, landmarks, confidence });
    if (!this.matrix) return;
    const point = applyHomography(this.matrix, rawPoint);
    listener({
      ...point,
      source: "hand",
      tracked: true,
      confidence,
      pinchRatio: pinchRatio(landmarks),
      confirm: false,
      timestamp,
    });
  }

  stop() {
    this.running = false;
    if (this.videoFrameId !== undefined)
      this.options.video.cancelVideoFrameCallback(this.videoFrameId);
    if (this.frameId !== undefined) cancelAnimationFrame(this.frameId);
    this.stream?.getTracks().forEach((track) => track.stop());
    this.landmarker?.close();
    this.options.video.srcObject = null;
    this.stream = undefined;
    this.landmarker = undefined;
  }
}
```

Use `requestVideoFrameCallback` in Chromium with `requestAnimationFrame` as fallback. MediaPipe documents that `detectForVideo` is synchronous; do not queue work while a frame is processing.

- [ ] **Step 5: Wire hand samples into the existing controller**

In `TableDisplay.tsx`, keep exactly one `handleSample` callback for both sources and add these refs/state/callbacks around the Task 4 implementation:

```tsx
const videoRef = useRef<HTMLVideoElement>(null);
const canvasRef = useRef<HTMLCanvasElement>(null);
const handSourceRef = useRef<HandInteractionSource | null>(null);
const observationBuffer = useRef<Point[]>([]);
const capturedPoints = useRef<Point[]>([]);
const [setupOpen, setSetupOpen] = useState(false);
const [cameraStatus, setCameraStatus] = useState<CameraStatus>("idle");
const [cameraError, setCameraError] = useState<string | null>(null);
const [calibrationStep, setCalibrationStep] = useState<number | null>(null);
const [instructionVisible, setInstructionVisible] = useState(true);

const onObservation = useCallback((observation: HandObservation) => {
  if (observation.rawPoint)
    observationBuffer.current = [...observationBuffer.current.slice(-7), observation.rawPoint];
  const canvas = canvasRef.current;
  const video = videoRef.current;
  if (!canvas || !video) return;
  canvas.width = video.videoWidth || 640;
  canvas.height = video.videoHeight || 360;
  const context = canvas.getContext("2d");
  if (!context) return;
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "#48dbfb";
  for (const landmark of observation.landmarks)
    context.fillRect((1 - landmark.x) * canvas.width - 2, landmark.y * canvas.height - 2, 4, 4);
}, []);

const enableCamera = useCallback(async () => {
  if (!videoRef.current || !tableRef.current) return;
  handSourceRef.current?.stop();
  setCameraStatus("loading");
  setCameraError(null);
  const source = new HandInteractionSource({
    video: videoRef.current,
    onObservation,
    onError: setCameraError,
  });
  handSourceRef.current = source;
  try {
    await source.start(handleSample);
    const track = (videoRef.current.srcObject as MediaStream).getVideoTracks()[0];
    const saved = loadCalibration(
      track.label,
      tableRef.current.clientWidth,
      tableRef.current.clientHeight,
    );
    source.setCalibration(saved?.matrix ?? null);
    setCameraStatus("ready");
  } catch {
    setCameraStatus("error");
  }
}, [handleSample, onObservation]);

const beginCalibration = useCallback(() => {
  capturedPoints.current = [];
  observationBuffer.current = [];
  setCalibrationStep(0);
}, []);

useEffect(() => {
  const capture = (event: KeyboardEvent) => {
    if (
      event.code !== "Space" ||
      calibrationStep === null ||
      observationBuffer.current.length < 4 ||
      !tableRef.current ||
      !videoRef.current
    )
      return;
    event.preventDefault();
    const points = observationBuffer.current;
    const median = (values: number[]) =>
      [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
    capturedPoints.current.push({
      x: median(points.map((point) => point.x)),
      y: median(points.map((point) => point.y)),
    });
    observationBuffer.current = [];
    if (capturedPoints.current.length < 4) {
      setCalibrationStep(capturedPoints.current.length);
      return;
    }
    const matrix = solveHomography(capturedPoints.current);
    const track = (videoRef.current.srcObject as MediaStream).getVideoTracks()[0];
    saveCalibration({
      cameraLabel: track.label,
      width: tableRef.current.clientWidth,
      height: tableRef.current.clientHeight,
      matrix,
    });
    handSourceRef.current?.setCalibration(matrix);
    setCalibrationStep(null);
  };
  window.addEventListener("keydown", capture);
  return () => window.removeEventListener("keydown", capture);
}, [calibrationStep]);

useEffect(() => () => handSourceRef.current?.stop(), []);
```

Update `handleSample` so `if (result.event && sample.source === "hand") setInstructionVisible(false);`. Render `SetupDrawer` using the state above. `Clear calibration` calls `clearCalibration()`, sets the hand source matrix to `null`, and resets `calibrationStep`. Surface errors only through the drawer; never replace the table with an error screen.

The added JSX is:

```tsx
const cornerNames = ["top-left", "top-right", "bottom-right", "bottom-left"];
const clearSavedCalibration = () => {
  clearCalibration();
  handSourceRef.current?.setCalibration(null);
  capturedPoints.current = [];
  setCalibrationStep(null);
};

{instructionVisible ? <p className="interaction-instruction">Point, then pinch to choose.</p> : null}
<div className="table-stage">
  <PeriodicTable ref={tableRef} state={state} handPoint={handPoint} />
  {calibrationStep !== null ? <span className="calibration-target" data-corner={cornerNames[calibrationStep]} /> : null}
</div>
<SetupDrawer
  open={setupOpen}
  cameraStatus={cameraStatus}
  error={cameraError}
  calibrationStep={calibrationStep}
  videoRef={videoRef}
  canvasRef={canvasRef}
  onOpen={() => setSetupOpen(true)}
  onClose={() => setSetupOpen(false)}
  onEnableCamera={enableCamera}
  onBeginCalibration={beginCalibration}
  onClearCalibration={clearSavedCalibration}
/>
```

- [ ] **Step 6: Verify and commit hand integration**

Run:

```bash
npm test -- --run src/adapters/handMath.test.ts src/domain/interaction.test.ts src/domain/calibration.test.ts
npm run build
git add src
git commit -m "feat: add calibrated MediaPipe pinch input"
```

Expected: math, gesture, and calibration tests pass; build succeeds. Then grant camera access in Chromium, calibrate four corners, and verify Hydrogen, Carbon, Gold, and Oganesson can be targeted.

---

### Task 7: Portfolio polish and acceptance verification

**Files:**

- Modify: `src/ui/table/TableDisplay.tsx`
- Modify: `src/ui/table/PeriodicTable.tsx`
- Modify: `src/ui/table/SetupDrawer.tsx`
- Modify: `src/ui/table/VirtualLights.tsx`
- Modify: `src/ui/info/InfoDisplay.tsx`
- Modify: `src/styles/global.css`
- Create: `README.md`

**Interfaces:**

- Produces: the accepted proof-of-concept build and concise local run instructions.
- Consumes: every prior task; introduces no new architecture.

- [ ] **Step 1: Add final accessibility and display assertions**

Extend `src/ui/info/InfoDisplay.test.tsx` with these exact tests:

```tsx
it("applies the selected category color", () => {
  render(<InfoDisplay selectedAtomicNumber={79} />);
  expect(screen.getByRole("main", { name: /element information display/i })).toHaveStyle(
    "--accent: #feca57",
  );
});

it("keeps the attract state for an invalid atomic number", () => {
  render(<InfoDisplay selectedAtomicNumber={999} />);
  expect(screen.getByText(/choose an element at the table/i)).toBeInTheDocument();
});
```

- [ ] **Step 2: Run the focused test suite and resolve failures without expanding scope**

Run: `npm test -- --run`

Expected: every test passes. Fix only failures against the approved design; do not add dwell, multi-hand, replay, networking, or physical-light features.

- [ ] **Step 3: Finish the visual system**

Complete `src/styles/global.css` with the Task 4 rules plus:

```css
body {
  min-width: 320px;
  overflow-x: hidden;
}
.interaction-instruction {
  margin: 0 0 1rem;
  text-align: center;
  color: #d5dde9;
  letter-spacing: 0.08em;
}
.table-stage {
  position: relative;
}
.cell-number {
  display: block;
  font-size: clamp(0.42rem, 0.58vw, 0.8rem);
  opacity: 0.7;
  text-align: left;
}
.cell-symbol {
  display: block;
  font-size: clamp(0.72rem, 1.42vw, 2rem);
  line-height: 1;
}
.element-cell[data-selected="true"] {
  border-width: 2px;
  background: color-mix(in srgb, var(--accent) 12%, #111722);
}
.element-cell:focus-visible,
.setup-trigger:focus-visible,
.setup-drawer button:focus-visible {
  outline: 3px solid #f4efe6;
  outline-offset: 3px;
}
.hand-cursor {
  position: absolute;
  width: 1.2rem;
  aspect-ratio: 1;
  border: 2px solid #fff;
  border-radius: 999px;
  transform: translate(-50%, -50%);
  box-shadow: 0 0 18px #48dbfb;
  pointer-events: none;
}
.setup-trigger {
  position: fixed;
  z-index: 20;
  right: 2rem;
  top: 2rem;
  border: 1px solid #536075;
  border-radius: 999px;
  background: #111722;
  color: #f4efe6;
  padding: 0.65rem 1rem;
}
.setup-drawer {
  position: fixed;
  z-index: 30;
  inset: 1rem 1rem auto auto;
  width: min(34rem, calc(100vw - 2rem));
  max-height: calc(100vh - 2rem);
  overflow: auto;
  border: 1px solid #536075;
  border-radius: 1rem;
  background: #0d121bcc;
  backdrop-filter: blur(20px);
  padding: 1.25rem;
  box-shadow: 0 24px 80px #000a;
}
.setup-drawer[hidden] {
  display: none;
}
.setup-drawer header,
.setup-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  flex-wrap: wrap;
}
.setup-drawer button {
  border: 1px solid #6d7890;
  border-radius: 0.55rem;
  background: #192231;
  color: #f4efe6;
  padding: 0.6rem 0.8rem;
}
.camera-debug {
  position: relative;
  margin-block: 1rem;
  aspect-ratio: 16 / 9;
  overflow: hidden;
  border-radius: 0.75rem;
  background: #05070a;
}
.camera-debug video,
.camera-debug canvas {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.camera-debug video {
  transform: scaleX(-1);
}
.calibration-target {
  position: absolute;
  z-index: 15;
  width: 2rem;
  aspect-ratio: 1;
  border-radius: 999px;
  background: #fff;
  box-shadow: 0 0 30px #48dbfb;
}
.calibration-target[data-corner="top-left"] {
  left: 0;
  top: 0;
}
.calibration-target[data-corner="top-right"] {
  right: 0;
  top: 0;
}
.calibration-target[data-corner="bottom-right"] {
  right: 0;
  bottom: 0;
}
.calibration-target[data-corner="bottom-left"] {
  left: 0;
  bottom: 0;
}
.info-display {
  min-height: 100vh;
  display: grid;
  place-items: center;
  padding: clamp(2rem, 6vw, 7rem);
  background:
    radial-gradient(
      circle at 25% 25%,
      color-mix(in srgb, var(--accent, #60708a) 28%, transparent),
      transparent 45%
    ),
    #080b10;
}
.info-attract {
  color: #aab4c0;
  font-size: clamp(1.5rem, 3vw, 4rem);
  letter-spacing: 0.04em;
}
.element-portrait {
  width: min(68rem, 100%);
  animation: portrait-in 620ms cubic-bezier(0.2, 0.8, 0.2, 1);
}
.element-kicker,
.element-category,
dt {
  text-transform: uppercase;
  letter-spacing: 0.12em;
  color: var(--accent);
}
.element-symbol {
  font-size: clamp(8rem, 28vw, 26rem);
  font-weight: 750;
  line-height: 0.74;
  color: var(--accent);
  text-shadow: 0 0 70px color-mix(in srgb, var(--accent) 35%, transparent);
}
.element-portrait h1 {
  margin: 1rem 0 0.25rem;
  font-size: clamp(3rem, 7vw, 8rem);
  line-height: 0.95;
}
.element-blurb,
.element-fact {
  max-width: 54rem;
  font-size: clamp(1.05rem, 1.6vw, 1.8rem);
  line-height: 1.5;
}
.element-fact {
  margin-top: 2rem;
  padding-left: 1rem;
  border-left: 3px solid var(--accent);
}
@keyframes portrait-in {
  from {
    opacity: 0;
    transform: translateY(18px);
  }
}
@media (max-width: 900px) {
  .table-display::before {
    content: "Best experienced on a desktop display";
    display: block;
    margin-bottom: 0.75rem;
    text-align: center;
    color: #ffcf70;
  }
  .table-display {
    padding: 1rem;
    overflow: auto;
  }
  .periodic-table {
    min-width: 880px;
  }
}
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 1ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 1ms !important;
    scroll-behavior: auto !important;
  }
  .element-cell,
  .element-portrait,
  .hand-cursor {
    transform: none !important;
  }
}
```

- [ ] **Step 4: Document the proof of concept**

Create `README.md`:

````md
# Periodic Table Touch Exhibit

A two-display, webcam-driven proof of concept for a museum-style periodic table. The table display supports mouse input immediately and optional calibrated MediaPipe pinch selection; the information display receives confirmed selections through BroadcastChannel.

## Run

```bash
npm install
npm run dev
```

Open `/table` and `/info` in separate windows on the same origin. Use the setup button on `/table` to enable the webcam and complete four-corner calibration. Mouse movement and click remain available at all times.

## Verify

```bash
npm test -- --run
npm run build
```

Element data is vendored in `src/data/elements.json`; the application makes no runtime data requests. `npm run data:refresh` regenerates that file from PubChem.
````

- [ ] **Step 5: Run final automated verification**

Run:

```bash
npm test -- --run
npm run build
git diff --check
```

Expected: all tests pass, Vite produces `dist/`, and `git diff --check` prints no errors.

- [ ] **Step 6: Run the browser acceptance checklist**

Start: `npm run dev -- --host 127.0.0.1`

Verify in Chromium:

1. `/table` renders all 118 cells without overflow at 1920×1080.
2. `/info` opens in the attract state.
3. Mouse-select Hydrogen, Carbon, Gold, and Oganesson; the correct portrait and category-colored light pulse appear each time.
4. Refresh `/info`; it returns to the attract state, then responds to the next selection.
5. Deny camera permission; setup explains the issue and mouse interaction remains complete.
6. Grant camera permission; webcam and landmarks appear only inside setup.
7. Calibrate all four corners and pinch-select representative center and edge cells.
8. Lose hand tracking; hover clears immediately.
9. Enable reduced motion; selection remains obvious without travel or scaling effects.
10. Close setup; no camera image or landmark skeleton remains visible.

- [ ] **Step 7: Commit the accepted proof of concept**

Run:

```bash
git add README.md src
git commit -m "feat: polish periodic table exhibit prototype"
git status --short
```

Expected: commit succeeds and `git status --short` is empty.

## Plan self-review record

- Spec coverage: every approved in-scope requirement maps to Tasks 1–7; all deferred features remain excluded.
- Data source: one official PubChem PUG REST request generates a committed local file; there are no runtime data calls.
- Failure priority: Task 4 yields a complete mouse demonstration before Tasks 5–6 introduce webcam risk.
- Type consistency: `ElementRecord`, `ExhibitEvent`, `PointerSample`, calibration records, adapter names, thresholds, and routes remain consistent across tasks.
- Timebox: each task ends at a reviewable commit; Task 4 is the minimum shippable portfolio proof of concept.
