# Periodic Table Touch Exhibit — Proof-of-Concept Design

## Purpose

Build a polished, screen-only portfolio demonstration of a museum periodic-table exhibit in roughly two hours. A visitor points at an element on the table display and pinches to select it. A second browser window presents the selected element as an editorial exhibit label, while a virtual LED border reacts with category color.

The proof of concept must remain fully demonstrable with a mouse if webcam access or hand tracking is unavailable. It should also preserve three inexpensive replacement seams for later physical hardware: input, cross-display transport, and lighting output.

## Product priorities

1. Produce an immediately understandable and visually polished portfolio demo.
2. Make the complete two-display experience reliable with mouse input.
3. Demonstrate calibrated MediaPipe fingertip tracking and pinch selection.
4. Keep input, transport, and light rendering replaceable without building unused hardware infrastructure.

## Scope

The first release includes:

- A standalone React, TypeScript, and Vite project at `~/projects/periodic-table-touch-exhibit`.
- A `/table` route for the interactive periodic table and a `/info` route for the exhibit label.
- A local flat dataset for all 118 elements containing symbol, name, atomic number, atomic mass, category, short blurb, and fun fact.
- Mouse movement and click as the always-available interaction source.
- MediaPipe Hand Landmarker input using the index fingertip and a pinch gesture.
- A four-corner calibration flow using a projective transform from camera coordinates to normalized table coordinates.
- Hover, armed, confirmed, and cooldown feedback.
- Cross-window messages sent through `BroadcastChannel`.
- A category-color policy and a virtual perimeter-light pulse.
- A hidden setup drawer for camera permission, calibration, webcam preview, and landmarks.
- Focused unit tests plus browser verification of the core demonstration.

The first release explicitly excludes dwell selection, multi-hand interaction, nine-point calibration, calibration-quality scoring, event replay or sequencing, state synchronization after a display reload, WebSocket or MQTT transports, real LED control, and a generalized plugin or dependency-injection framework.

## Experience design

### Table display

The `/table` route opens as a dark gallery instrument rather than a computer-vision demo. It uses a recognizable 18-column periodic-table silhouette, warm neutral typography, generous negative space, and restrained category colors. The webcam and landmark skeleton remain hidden during normal operation.

The idle instruction is “Point, then pinch to choose.” The instruction disappears after the first successful hand selection but remains available in the setup drawer.

Each element cell has four visible states:

1. **Rest:** quiet category accent and readable symbol/number.
2. **Hover:** raised cell, luminous outline, and fingertip cursor.
3. **Armed:** the cursor tightens when the pinch crosses its engagement threshold.
4. **Confirmed:** the cell compresses and flashes, then remains subtly marked until another element is chosen.

The perimeter light produces one category-colored pulse after confirmation and decays to its idle appearance in approximately 900 milliseconds. The proof of concept uses a whole-border, two-direction pulse rather than a spatially accurate LED origin.

### Information display

The `/info` route begins with an attract state reading “Choose an element at the table.” After selection, it renders:

- Oversized symbol and atomic number.
- Element name and category.
- Atomic mass.
- One short human-readable blurb.
- One memorable fun fact.

The existing content remains visible while the next element transitions in. Category color washes in behind the content, with the complete transition finishing in less than 700 milliseconds. Reduced-motion mode replaces travel and scaling effects with short fades.

## Architecture

The application is one Vite bundle with route-level composition for `/table` and `/info`. React renders application state but does not own calibration math, gesture policy, transport calls, or category-to-color rules.

Three narrow boundaries are preserved:

```ts
interface InteractionSource {
  start(listener: (sample: PointerSample) => void): Promise<void> | void;
  stop(): void;
}

interface ExhibitEventBus {
  publish(event: ExhibitEvent): void;
  subscribe(listener: (event: ExhibitEvent) => void): () => void;
}

interface LightOutput {
  pulse(cue: LightCue): void;
  reset(): void;
}
```

Initial adapters are mouse and MediaPipe interaction sources, a `BroadcastChannel` event bus, and a CSS virtual-light output. Future camera/touch, WebSocket/MQTT, and physical LED adapters can replace those edges without changing element selection rules.

The event bus notifies local subscribers and publishes to the browser channel. This allows the table’s virtual light output to consume `lightsPulse` locally while the information window receives `elementSelected` across the channel.

## Domain messages

The proof of concept preserves the original message contract:

```ts
type ExhibitEvent =
  | { type: "elementSelected"; atomicNumber: number; timestamp: number }
  | { type: "lightsPulse"; category: string; intensity: number };
```

Messages are validated at the event-bus boundary. Unknown types, invalid atomic numbers, non-finite timestamps, unknown categories, and intensities outside `0..1` are ignored. Element records are not sent between windows; `/info` resolves them locally by atomic number.

## Interaction controller

Mouse and MediaPipe samples enter the same pure interaction controller as normalized table coordinates. The controller resolves the hovered cell from shared table geometry and exposes a small state machine:

`idle → hover → armed → confirmed → cooldown`

- Mouse movement updates position, and primary-button click supplies confirmation intent.
- MediaPipe landmark 8 supplies position.
- Pinch distance is the thumb-tip/index-tip distance divided by a hand-size reference distance.
- The initial pinch engagement threshold is `0.28`; release/rearm occurs at `0.38`. Both values live in one configuration module for quick tuning on the demo laptop.
- Tracking confidence below the configured minimum clears the hand pointer and any hover immediately.
- A confirmed cell ignores repeat confirmation for 1,000 milliseconds.
- Losing hand tracking cancels partial interaction and leaves mouse input available.
- Only the highest-confidence detected hand is used.

Mouse is not implemented as a separate React click shortcut. Both inputs must produce the same selection and light events through the controller.

## Calibration

The setup drawer guides the operator through four corner targets in this order: top-left, top-right, bottom-right, bottom-left. Each target captures a short stable sample of the fingertip position. The resulting four camera-space points define a projective transform into normalized table coordinates.

Calibration data is stored in `localStorage` with the camera label and table viewport dimensions. It is invalidated when the chosen camera changes or the table viewport dimensions change. Recalibration remains available from the setup drawer.

If calibration is absent, the table stays mouse-operable and the setup drawer explains that hand input requires calibration. Mirrored webcam coordinates are corrected before applying the transform.

## Data and color policy

The element dataset is a flat JSON array keyed by atomic number. Application code exposes a lookup by atomic number and rejects missing or duplicate records during tests.

Category colors live in a TypeScript policy module rather than CSS. Both displays and the light cue consume the same mapping. Text labels and non-color state changes ensure category and selection meaning do not depend on color alone.

## Failure behavior

- **Camera permission denied or camera missing:** show a concise setup message and continue with the mouse.
- **MediaPipe model load failure:** report it in the setup drawer and continue with the mouse.
- **No calibration:** keep hand selection disabled, open or badge the setup drawer, and retain full mouse behavior.
- **Tracking loss:** clear hand pointer, hover, and pinch state immediately.
- **Invalid cross-window event:** ignore it without changing the current display.
- **Information window absent:** the table remains responsive; no acknowledgement is required.
- **Information window opened or refreshed late:** show the attract state until the next confirmed selection. Snapshot recovery is deferred.

## Verification

### Automated tests

Focused tests cover:

- Exactly 118 unique element records and valid atomic-number lookup.
- Category-to-color mapping for every dataset category.
- Four-point coordinate transformation using known corner and center cases.
- Pinch engagement, release hysteresis, tracking loss, and same-cell debounce.
- Mouse and hand samples producing equivalent confirmed-selection events.
- Runtime validation accepting both valid event shapes and rejecting malformed messages.

### Browser verification

The proof of concept is manually verified in a Chromium browser at desktop width:

1. Open `/table` and `/info` in separate windows.
2. Select representative edge and center elements with the mouse and confirm synchronized information and light feedback.
3. Confirm every one of the 118 cells is rendered and selectable.
4. Deny camera permission and verify the demonstration remains complete with the mouse.
5. Grant camera permission, complete four-corner calibration, and select representative center and edge cells with a pinch.
6. Verify setup/debug visuals stay hidden during normal exhibit mode.
7. Verify reduced-motion behavior on both displays.

The release is accepted when mouse interaction is flawless, both routes remain visually coherent and synchronized during new selections, all element records render correctly, and calibrated pinch selection succeeds on representative center and edge cells on the intended demo laptop.

## Delivery sequence and timebox

1. **First 45 minutes:** scaffold the application; add the element dataset, periodic table, mouse controller, routes, and cross-window selection.
2. **Next 45 minutes:** add MediaPipe, the setup drawer, four-corner calibration, and pinch confirmation.
3. **Final 30 minutes:** add the information-display transition, perimeter pulse, responsive polish, tests, and browser verification.

If time runs short, preserve the polished mouse-driven two-display experience first. Hand tracking may retain a visible setup limitation, but it must never make the core demonstration unusable.

## Jam decision record

The initial Jam panel considered three directions: a portfolio-first “invisible magic” build, a confidence-gated interaction system, and a deterministic hardware twin. The two-hour proof-of-concept constraint selected the portfolio-first direction. It retains the panel’s shared recommendation to isolate input, transport, and lighting, while deferring advanced calibration, event ordering, replay, and deterministic physical-light frames.
