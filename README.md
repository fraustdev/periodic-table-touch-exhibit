# Periodic Table — Touch Exhibit

A screen-only prototype of a museum periodic-table installation. A visitor chooses an element on
the table display; a second display presents it as an editorial exhibit label; a virtual
addressable LED strip around the screen edge ripples outward from the cell that was pressed.

Two input drivers produce identical behaviour: a mouse, and a webcam hand tracker (MediaPipe)
where you point with your index finger and pinch to select.

![The table display, idle](docs/images/table-idle.jpg)

_The table display. Hovering an element illuminates its whole group and period; the readout in the
grid's empty quadrant repeats the current element, because a finger occludes the cell it presses._

![The interpretation panel showing gold](docs/images/info-gold.jpg)

_The second display, as an editorial exhibit label. Every scalar sits on a named scale rather than
appearing as a bare number._

![The table coloured by melting point](docs/images/trend-melting.jpg)

_A trend overlay. The table's empty quadrant reports whatever is currently being looked at — here,
the property doing the colouring, with a calibrated scale. Recolouring by melting point makes the
refractory metals appear as a bright ridge through the middle of the d-block. Hovering an element
replaces this with its value as a hero number and a marker showing where it falls on the scale._

```bash
npm install
npm run dev          # http://localhost:5173/table  and  /info
npm test             # 135 unit tests
npm run verify       # everything: format, types, tests, build, and 9 browser checks
npm run build
```

Open `/table`, then use **Setup → Open info display** and drag that window to the second monitor.

## Documentation

**New to this repo?** Start with [`CONTRIBUTING.md`](CONTRIBUTING.md) — it is the handoff document
for a human, and it is a fifteen-minute read. If you are working here with Claude Code,
[`CLAUDE.md`](CLAUDE.md) loads automatically and is the handoff document for the agent. Everything
else below is reference.

| Document                                                       | For                                                              |
| -------------------------------------------------------------- | ---------------------------------------------------------------- |
| [`CONTRIBUTING.md`](CONTRIBUTING.md)                           | **Start here.** Handoff for a human teammate.                    |
| [`CLAUDE.md`](CLAUDE.md)                                       | **Handoff for an AI collaborator.** Invariants and conventions.  |
| [`docs/decisions.md`](docs/decisions.md)                       | Why things are the way they are, and what would change our mind. |
| [`docs/hardware-translation.md`](docs/hardware-translation.md) | What each part becomes on the real installation.                 |
| [`docs/demo-runbook.md`](docs/demo-runbook.md)                 | Presenting it live. For the operator, not a contributor.         |
| [`docs/how-this-was-built.md`](docs/how-this-was-built.md)     | The process, including the wrong turns.                          |
| [`docs/design-spec.md`](docs/design-spec.md)                   | The original design specification.                               |
| [`docs/implementation-plan.md`](docs/implementation-plan.md)   | The task-by-task build plan that was executed.                   |

## What this is proving

The intended installation is a **projected surface selected by mid-air hand gesture**, with physical
WS2812-class LEDs around the display edge and a mouse as the fallback input. Hand tracking is the
shipping sensor, not a stand-in — which is why it is hardened rather than sketched.

The same code also serves a **commercial touchscreen** through a `TouchDriver` implementing the same
interface. Supporting both is the point: development and demos run on a laptop with a mouse, the
installation runs on a camera, and a test asserts the two produce identical event sequences.

That hardware does not exist yet, so this prototype exists to make the eventual port _boring_. Three
seams are held deliberately narrow:

| Seam             | Now                                               | Later                                       |
| ---------------- | ------------------------------------------------- | ------------------------------------------- |
| **Input**        | `MouseInteractionSource`, `HandInteractionSource` | the same, plus `TouchDriver` for a panel    |
| **Transport**    | `BrowserEventBus` over `BroadcastChannel`         | WebSocket to an authoritative local process |
| **Light output** | 120 virtual pixels rendered as DOM segments       | serial frames to an LED controller          |

Everything gesture-shaped stops at the driver boundary. No MediaPipe landmark ever reaches the
interaction rules, the display, or the light layer — the only thing that crosses is a
`PointerSample` in normalized table space, which is exactly what a touch driver would emit.

The light model is a **linear array of N addressable pixels addressed by normalized arc length**,
not ad-hoc CSS animation. An effect never contains an LED index, so the same effect maps onto a
real strip of a different length.

## Architecture

```
src/domain/      pure rules — no browser, no React
  types.ts         the contracts every layer shares
  config.ts        every gesture threshold, in one place
  elementLayout.ts canonical 18-column grid + hit test (renderer reads the same numbers)
  interaction.ts   idle → hover → armed → confirmed → cooldown state machine
  calibration.ts   four-point homography, camera space → table space
  lightFrame.ts    LED output: governor, gamma, dither, COBS + CRC16, swappable sink
src/data/        118 elements, generated and committed
src/policy/      category → colour; trend overlays and their ramp
src/hooks/       camera lifecycle, calibration flow, event bus
src/adapters/    browser edges: mouse, touch, MediaPipe, camera, event bus
src/ui/          React rendering only
```

`reduceInteraction` is the single path from a pointer sample to an exhibit event. The mouse is not a
React `onClick` shortcut — all three drivers go through the same reducer, so they cannot drift apart.
A test asserts they emit identical event sequences: same selections, same light cues, same order.

The drivers are genuinely different where the hardware is. Touch has no hover, because a finger
leaves nothing behind on release; contact is itself the press; and a panel reports every contact it
sees, so oversized ones are rejected as palms. A separate test pins the one difference they are
allowed to have.

### Deliberate constraints

- **Colour never carries meaning alone.** Every category is also printed as text, on every surface.
- **Commit is debounced per cell** (1,000 ms) rather than globally, so a visitor mashing twelve
  different elements gets twelve responses.
- **Validated at the boundary.** A malformed cross-window message is dropped silently. An exhibit
  does not show error dialogs to visitors.
- **The table's focus card** repeats the current element in the grid's empty quadrant, because a
  finger occludes the cell it is pressing and everything just below it.
- **Camera failure is not exhibit failure.** Denied permission, missing camera, model load failure,
  and lost tracking all degrade to a fully working mouse exhibit.

## Trend overlays

The table can be recoloured by a measured property — melting point, density, or electronegativity —
which turns the layout into visible physics. Press `t` to cycle, or use the switcher in the footer.

- **Density is logarithmic.** It spans three orders of magnitude, so a linear ramp would render
  everything except the heavy metals identically.
- **Unmeasured is shown as unmeasured.** Eleven elements have no measured melting point; they render
  grey rather than being given a fabricated value.
- **Colour is never the only channel.** With nothing hovered, the table's empty quadrant names the
  property and shows a scale calibrated with real values. Hovering an element replaces that with its
  value as a hero number, plus a marker on the scale — seeing a cell's colour and its position at the
  same time is what makes the colour mean anything.
- **Text contrast is measured, not assumed.** The ink is chosen by computing contrast against both a
  light and a dark option and taking the better one; a test walks the whole ramp.

Adding a trend is one entry in `TRENDS` in `src/policy/trends.ts`.

## The LED output path

`src/domain/lightFrame.ts` is the pipeline that will drive the physical strip:

```
linear float → governor → gamma encode → temporal dither → channel order
             → COBS frame + CRC16 → sink
```

It runs against a `NullSink`, so it is complete and tested before any hardware exists. Inspect the
real wire bytes with:

```bash
npm run leds:demo
```

That prints the encoded frame, proves a flipped bit is rejected, shows the dither series averaging a
level 8 bits cannot hold, and tabulates the link budget — confirming in numbers that 230 RGBW pixels
at 60 fps is 554 kbps, which a 115200 UART cannot carry.

## Hand tracking

Optional, and off until enabled in the Setup drawer.

- Pointer: index fingertip (landmark 8), un-mirrored, exponentially smoothed.
- Selection: pinch distance ÷ wrist-to-knuckle span, so it is scale- and distance-invariant with
  no calibration. Engage at `0.28`, release at `0.38` — hysteresis, so it cannot flicker.
- **Default mapping:** the central region of the camera frame maps to the whole table, so hand
  tracking works the moment the camera starts. Calibration is a refinement, never a gate.
- **Corner calibration:** hold a fingertip on each of four markers; the captured camera-space
  points solve a projective transform into table space, correcting for an off-axis camera. The
  dwell captures the _mean_ of the whole hold rather than the sample that started it, and forgives
  a brief wobble instead of restarting — an unsupported hand always drifts.
- **Validated before use:** a capture that is too small, taken out of order, or self-crossing still
  solves to a transform, so the quadrilateral is checked for area, convexity, and winding, and
  rejected with a reason. Nothing is persisted until the operator has watched the marker track a
  finger and confirmed it. A stored calibration whose camera or geometry no longer matches falls
  back to the default region rather than being applied anyway.
- WASM and the 7.8 MB model are vendored into `public/mediapipe`, so the demo needs no network.

Tune anything in `src/domain/config.ts`.

## Out of scope, on purpose

Dwell selection, multi-hand input, nine-point calibration, event replay, WebSocket/MQTT transports,
and real LED control. Each has a seam waiting for it; none is needed to prove the interaction.
`docs/decisions.md` records why each was deferred rather than dismissed.

A display that opens or reloads mid-session does recover: it broadcasts `requestState` and the
table re-announces the current selection. That is a handshake, not an authoritative server — if no
table is open, the display stays in its attract state, which is the correct thing to show.

## Regenerating the dataset

`src/data/elements.json` is generated and committed. To rebuild it from the source dataset plus
the authored exhibit copy:

```bash
npm run data:build
```

The generator asserts 118 records, no grid collisions, and copy present for every element.
