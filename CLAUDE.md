# Working on this project

Context for AI collaborators. Read this before changing anything; it exists to stop confident,
reasonable-looking changes that quietly break the thing the project is for.

## What this is

A screen-only prototype of a **museum periodic-table installation**. The real build is a 55"
commercial touchscreen with physical WS2812-class LEDs around the bezel. This prototype exists to
make that hardware port obvious rather than surprising. See `docs/hardware-translation.md`.

It is **not** a web app that happens to look like an exhibit. Decisions that would be right for a
web app are often wrong here, and vice versa.

## The three seams — the load-bearing idea

Everything is arranged so three things can be replaced without touching anything else:

| Seam         | Interface           | Now                    | Later                              |
| ------------ | ------------------- | ---------------------- | ---------------------------------- |
| Input        | `InteractionSource` | mouse, MediaPipe hand  | native touch                       |
| Transport    | `ExhibitEventBus`   | `BroadcastChannel`     | WebSocket to a local authority     |
| Light output | `LightOutput`       | 120 virtual DOM pixels | serial frames to an LED controller |

**If a change makes one of these seams leakier, it is the wrong change**, even if it is shorter.

## Invariants — do not break these

1. **No landmark, no camera coordinate, and no MediaPipe type crosses out of
   `src/adapters/`.** The only thing that leaves an input driver is a `PointerSample` in normalized
   table space. This is what makes the touch swap a config change.
2. **Mouse is not a shortcut.** There is no `onClick` on a cell. Both inputs go through
   `reduceInteraction`, and a test asserts they emit byte-identical event sequences. Do not add a
   React click handler to bypass it.
3. **Hover must never carry meaning.** The real device is a touchscreen and has no hover. Hover may
   only amplify something already conveyed another way.
4. **Colour never carries meaning alone.** Every category is also printed as text on every surface
   that shows it.
5. **Lighting effects address normalized arc length, never an LED index.** No effect may contain
   `120` or `if (i < 40)`. That is what lets the same effect drive a strip of any length.
6. **Cross-window messages are validated at the boundary and carry no element records.** Displays
   resolve elements locally by atomic number. A malformed message is dropped silently — an exhibit
   never shows a visitor an error.
7. **Camera failure is not exhibit failure.** Denied permission, no camera, no WebGL, model load
   failure, and lost tracking must all degrade to a fully working mouse exhibit.
8. **Every gesture threshold lives in `src/domain/config.ts`.** Never inline a magic number for
   timing, distance, or confidence.

## Layout

```
src/domain/      pure rules — no browser, no React, no imports from ui/ or adapters/
  types.ts         contracts every layer shares
  config.ts        every tunable, in one place
  elementLayout.ts 18-column grid + hit test; the renderer reads the same numbers
  interaction.ts   idle → hover → armed → confirmed → cooldown. All the rules.
  calibration.ts   four-point homography, camera space → table space
  calibrationDwell.ts  hold-to-capture reducer
src/data/        118 elements, generated and committed
src/policy/      category → colour and label, shared by both displays and the lights
src/adapters/    browser edges: pointer, MediaPipe, camera, event bus
src/ui/          React rendering only
```

Dependency direction is one-way: `ui → adapters → domain`. **`domain/` importing from `ui/` or
`adapters/` is always a bug.**

## Where to make common changes

| Task                               | Go to                                                              |
| ---------------------------------- | ------------------------------------------------------------------ |
| Tune a gesture threshold or timing | `src/domain/config.ts`                                             |
| Change what an element says        | `scripts/element-copy.json`, then `npm run data:build`             |
| Change the periodic table geometry | `src/domain/elementLayout.ts` — the renderer follows automatically |
| Change category colours            | `src/policy/categoryColors.ts`                                     |
| Add a lighting effect              | `src/ui/table/PerimeterLights.tsx`, addressed by arc length        |
| Add a new input device             | implement `InteractionSource` in `src/adapters/`                   |
| Change selection rules             | `src/domain/interaction.ts`, and update its tests first            |

## Testing

`npm test`. Rules live in `domain/`, so they are testable without a browser — prefer a pure test
over a component test. Component tests cover rendering and event wiring only.

Vitest runs without globals, so `afterEach(cleanup)` is registered in `src/test/setup.ts`. Without
it, renders leak between tests.

**Browser verification is not optional for visual or geometric claims.** Unit tests cannot tell you
a video element and its overlay canvas have different aspect ratios. That exact bug shipped and was
only caught by measuring both boxes in a real browser.

## Traps that have already cost time

- **MediaPipe requires WebGL even with the CPU delegate.** It uploads each frame as a GL texture.
  With no WebGL, the GPU delegate throws `kGpuService` at graph creation and the CPU delegate builds
  fine then throws `activeTexture` on every frame. There is a preflight check; keep it.
- **To disable WebGL in a test you must stub both** `HTMLCanvasElement.prototype.getContext` **and**
  `OffscreenCanvas.prototype.getContext`. Stubbing only the first silently does nothing.
- **A preview box, its overlay canvas, and the camera frame must share one aspect ratio.** Otherwise
  `object-fit` crops the video while landmarks stay normalized to the full frame, and the overlay
  lands offset.
- **`BroadcastChannel` does not cross browser profiles.** Two Chrome _instances_ cannot talk. Open
  the second display with the in-app button, which uses `window.open`.
- **Do not overlay UI on the table.** Anything floating over the grid hides elements. Both the
  calibration preview and the confirmation row learned this the hard way; the confirmation row is a
  grid row so the table gives up space instead.
- **Never run `npm install` before this directory has a `package.json`** — npm walks up and installs
  into the nearest ancestor manifest.

## Conventions

- TypeScript strict, no `any`, no non-null assertion where a guard will do.
- Comments explain **why**, not what. If a comment restates the code, delete it.
- Commit messages explain the reasoning and, for a fix, the failure mode. See `git log` — the bar
  is set there deliberately.
- Prettier is enforced in CI. Run `npm run format` before committing.

## Decisions already made

`docs/decisions.md` records the real decisions and what would change our mind. **Read it before
"fixing" something that looks odd** — several odd-looking choices are deliberate and the reasoning
is written down.
