# Hardware Translation

What each part of this prototype becomes when the exhibit is actually installed somewhere.

**Two deployment targets, one codebase.**

- **A. Projected surface, mid-air hand gesture** (the intended design). A projector puts the table
  on a wall or floor; a camera watches the visitor's hand; a pinch selects. A mouse remains the
  fallback. MediaPipe is **the shipping sensor**, so the hand path is production code.
- **B. Commercial touchscreen.** The same code through `TouchInteractionSource`. Kept as a live option
  because it removes every optical problem projection has, at the cost of reach constraints and
  daily cleaning.

Where the two diverge, both are covered below. Everything above the driver boundary — the layout,
the hit test, the interaction rules, the event contract, both displays, the light model — is
identical for both, which is roughly three quarters of the code.

The prototype was built so this document could be short. Three seams were kept deliberately
narrow — **input**, **transport**, and **light output** — and everything on the other side of them
is unaware of what the hardware is. This document walks each aspect of the system, says what ships,
and is honest about the two places where the code genuinely has to change.

Numbers marked **(verify)** are from spec sheets and rules of thumb. Confirm against the actual
parts before anyone buys anything.

---

## One-page summary

| Aspect            | Prototype                          | On hardware                                 | Code change                                              |
| ----------------- | ---------------------------------- | ------------------------------------------- | -------------------------------------------------------- |
| Pointer input     | MediaPipe hand tracking + mouse    | PCAP touchscreen, native pointer events     | New driver, ~100 lines. Nothing downstream moves.        |
| Interaction rules | Pure reducer                       | Identical                                   | **None**                                                 |
| Element data      | Committed JSON                     | Identical, still no network at runtime      | **None**                                                 |
| Info display      | Second browser window              | Second physical panel                       | **None**, but the type scale needs a pass                |
| Surround lighting | 120 virtual pixels in the DOM      | ~230 addressable LEDs in a diffused channel | Swap the sink. Effects are already arc-length addressed. |
| Transport         | `BroadcastChannel` between windows | WebSocket to an authoritative local process | **Real rewrite.** Planned for; ~half a day.              |
| Host              | A laptop                           | Fanless mini PC in the plinth               | Deployment only                                          |
| Camera            | Required                           | Probably removed entirely                   | Delete the driver                                        |

Two rows are genuine work: **transport** and **lighting**. On target A the input path needs no code
change at all — only physical mounting and a calibration pass.

---

## 1. The interaction surface

**Now:** a browser window. Pointer position arrives as normalized table-space coordinates from
either `MouseInteractionSource` or `HandInteractionSource`.

### Target A — projection plus gesture

**On hardware:** a projector, a projection surface, and a camera positioned to see the visitor's
hand. The browser runs full-screen on the projector output. **No code change** — the hand driver
already in the repo is the shipping input.

What actually needs solving is optical and physical, not software:

- **Ambient light is the constraint.** Projection contrast dies in a bright gallery. Either the
  space is controllable, or the projector has to be bright enough to win — check lumens against
  the real room, not a spec sheet.
- **Front throw means the visitor shadows the image.** A raised arm casts a shadow roughly where
  they are pointing, which is the worst possible place. **Short-throw mounted high, or rear
  projection, removes this.** Decide before anything is mounted.
- **Camera placement is now a fixed installation decision**, not a laptop lid. It must see the
  interaction volume, be lit well enough for tracking, and stay put — because calibration is keyed
  to its geometry and a knock invalidates it.
- **Hand lighting matters as much as image brightness.** Tracking needs the hand lit from the front.
  A dim room helps projection and hurts tracking; these pull against each other and the balance is
  found on site.
- **Reach mostly stops being a problem.** Nobody touches anything, so the 760–1120 mm reach band
  does not bind. Gesture is _more_ accessible on the reach axis than any touchscreen mount. What
  replaces it is arm-raising stamina and the fact that **pinch is a gesture some visitors cannot
  perform** — see the accessibility note below.
- **No haptics at all.** There is no contact event, so visual and light confirmation are
  load-bearing rather than decorative. This is the strongest argument for the LED surround.

### Target B — touchscreen

**On hardware:** a commercial-grade 55" LCD with a projected-capacitive (PCAP) touch overlay,
mounted in a plinth. One new driver file implementing `InteractionSource`.

### What changes in code

One new file implementing `InteractionSource`, emitting `PointerSample` from native pointer events.
The reducer, the hit test, the debounce, the lighting, and both displays are untouched. There is
already a test asserting that mouse and hand input produce byte-identical event sequences — touch
joins that test as a third driver, and if it diverges the build fails.

**Hover stops existing on target B only.** Mid-air pointing has a genuine hover state — it is how a
visitor aims, and the reticle depends on it. A finger on glass does not. So hover may carry meaning,
but everything it conveys must also be reachable without it, or the touchscreen variant loses
information.
The prototype already anticipates this: the focus card repeats the current element in the grid's
empty quadrant precisely because a finger occludes the cell it is pressing and everything for
about 150 mm below it. Verify on the real panel with a real hand, not a mouse.

### What to watch out for

- **Use LCD, not OLED.** The interface has a persistent masthead, axis labels, and legend. That is
  a textbook burn-in pattern. LCD has no image-retention risk of that kind.
- **Commercial panel, not a consumer TV.** Consumer sets are typically warranted for a few hours a
  day and their warranties often exclude static content. Specify a display rated for 16/7 or 24/7
  operation **(verify the rating on the specific model)**.
- **Anti-glare etched glass beats an applied film** for durability in a public space. A film will
  be picked at.
- **Mounting angle.** A dead-horizontal table collects fingerprints and mirrors every ceiling
  light. 15–30° from horizontal is the museum norm and is much kinder to reflections.
- **Palm rejection and multi-touch.** A PCAP overlay reporting 10+ points will happily report a
  resting forearm. The reducer currently tracks a single pointer; decide whether a second contact
  is ignored, or becomes a compare gesture.

### Reach — and why the mount decision comes first

The usable interaction band for a seated wheelchair user _and_ a standing adult _and_ a child is
roughly **760–1120 mm above finished floor: about 360 mm tall** **(verify against the governing
accessibility standard for the venue)**. A 55" 16:9 panel has an active area of about
**1210 × 680 mm**.

The consequence depends entirely on how it is mounted, and these are different problems:

- **Vertical or near-vertical mount:** the panel is 680 mm tall and the reachable band is 360 mm.
  The table cannot occupy the full panel and stay reachable. In a naive full-bleed layout, periods
  1 and 2 sit above the reach ceiling — hydrogen, helium, lithium, beryllium, boron, carbon,
  nitrogen, oxygen, fluorine, neon. Five of the six elements a walk-up visitor reaches for first.
  The fix is a **Reach Mode**: a viewport transform scaling the grid into the reachable band. Cheap
  now (a transform driven by one state field), expensive later (it touches every cell).
- **Table or angled mount:** height stops being the problem and **forward reach depth** becomes
  one. A seated visitor at the near edge may not reach the far row at all. Mitigation is a shallower
  angle, a narrower plinth, or rotating the layout.

**This is the single decision that most constrains the visual design, and it should be made before
any more layout work.**

---

## 2. The information display

**Now:** a second browser window, dragged to a second monitor.

**On hardware:** a second panel at eye level, likely 32–43", portrait or landscape. Non-touch. Fed
from the same machine's second output, or its own machine.

**Code change: none.** It already subscribes to validated events and resolves elements locally by
atomic number. It recovers on reload by asking the table to re-announce the selection.

### The one real task: type sizing for viewing distance

The current type scale was tuned on a laptop at arm's length. At a 55" panel's pixel pitch — about
**0.63 mm per pixel** at 1920 wide — the smallest labels in the interface are around 6 mm of glyph
height. That is fine at 500 mm and illegible at 2 m.

A workable rule of thumb is **cap height ≥ viewing distance ÷ 200**. At 2 m that is 10 mm, which is
roughly 28 pt **(verify by printing a test card and standing where visitors will stand)**. The
interpretation panel's small mono labels currently fall well short of that.

**Concretely: the info display needs a type pass at roughly 2–3× the current scale**, and the
prototype's `clamp()` values should be re-derived from millimetres at the real pixel pitch rather
than from viewport percentages. This is layout work, not architecture, but it is not zero.

---

## 3. The surround lighting

The largest translation, and the one the prototype models most carefully.

**Now:** 120 virtual pixels rendered as DOM elements around the viewport, each addressed by its
position on a normalized 0–1 loop. Effects never reference an LED index.

**On hardware:** an addressable strip in an aluminium channel with a frosted diffuser, around the
panel bezel, driven by a microcontroller.

### Sizing

For a 1210 × 680 mm active area, the bezel perimeter is roughly **3.8 m**.

| Density | LED count | Notes                                                         |
| ------- | --------- | ------------------------------------------------------------- |
| 60/m    | ~230      | Visible dots unless diffused. Cheapest, lowest power.         |
| 144/m   | ~550      | Nearly continuous even with modest diffusion. 2.4× the power. |

The 120-pixel prototype maps onto either without touching an effect, because effects address
normalized arc length. That was the point of building it that way.

### Power — size this properly

WS2812-class LEDs draw roughly **60 mA at full white** (RGB) or **80 mA** (RGBW) **(verify per
datasheet)**.

- 230 RGB LEDs × 60 mA ≈ **13.8 A at 5 V ≈ 69 W**
- 230 RGBW LEDs × 80 mA ≈ **18.4 A at 5 V ≈ 92 W**

Specify a 5 V supply with real headroom — **20–30 A** — even though the brightness governor means
you will never draw it. Then:

- **Inject power at both ends and at least mid-run.** A 5 V strip browns out and shifts red along
  its length otherwise. The prototype simulates this failure deliberately.
- Use appropriately heavy gauge for the power runs, not the strip's own solder pads alone.

### Data rate — the gotcha

At 60 fps, 230 RGBW pixels is 920 bytes per frame, about **55 KB/s**, or roughly 550 kbps with
framing. **A 115200-baud UART bridge cannot carry this** (~11.5 KB/s). Use a microcontroller with
**native USB CDC** — an ESP32-S3 or Teensy — or run the UART at 921600+ **(verify with a sustained
throughput test, not a spec sheet)**.

The wire format is already specified: COBS framing with CRC16, written against a `NullSink`.

### Decide RGBW versus RGB now

The white channel is what makes the ambient idle state read as _light_ rather than as tinted
colour. **Retrofitting a W channel is a rewrite of every effect**, because the frame becomes 4
bytes per pixel instead of 3. Choose before anything is authored.

### Optical and mechanical

- **Diffusion is not optional.** Bare LEDs are point sources; you will see dots, not a glow. An
  aluminium channel with a frosted lens also acts as a heatsink.
- **Corners.** Strip does not bend around a right angle. Either mitre and solder segments, or
  accept a dark notch at each corner. The prototype already models corner gaps as dark notches, so
  what you see in the preview is what you will get.
- **Colour pipeline.** Composite in linear light, apply a gamma LUT (γ ≈ 2.6–2.8), quantise to 8
  bits, then temporally dither. Skip the inverse in the on-screen preview and you gamma-correct
  twice and end up calibrating against a display that does not exist.
- **Clip additively, the way LEDs actually clip** — hard, per channel, at 255. CSS `screen`
  blending is far more forgiving and will let you ship effects that turn to white mush on the real
  fixture.

### Safety

Non-negotiable, and cheaper to build in than to retrofit:

- A **non-bypassable final governor** stage. Effect authors must not be able to obtain a sink
  handle and write frames directly.
- **Flash-rate limiting** evaluated on the _composited_ frame — individually safe effects sum to
  unsafe output. Per-region transition counting, not a low-pass, since a low-pass permits a 4 Hz
  square wave.
- A **brightness floor** as well as a ceiling. A dark surround reads as broken and gets reported as
  a fault.

---

## 4. Where the code runs

**This is the seam that genuinely has to change, and the prototype knows it.**

**Now:** `BroadcastChannel` between two browser windows in the same profile. Cheap, and it works —
but it has no authority and no state. A reloaded display has to ask the table what is selected,
which is a handshake standing in for a snapshot.

**On hardware:** a small Node process owning the state machine, serving both displays over
WebSocket, and holding the USB serial port to the LED controller.

### Why it has to change

1. **A browser tab cannot reliably hold a serial port.** WebSerial exists, needs a user gesture,
   and is not something to stake an unattended exhibit on. Something outside the browser must own
   the USB device.
2. **Nothing currently owns the truth.** With `BroadcastChannel`, a display that reloads is blank
   until it asks. That is survivable with two surfaces and unacceptable with three.
3. **The lights need one tick source.** Composite brightness across three surfaces is unbounded
   unless a single process owns the frame clock.

### What it costs

Less than it looks, because the event contract _is_ the wire format. `elementSelected`,
`lightsPulse`, and `requestState` are already validated at the boundary and carry no element
records — displays resolve locally by atomic number. The work is:

- A Node process holding the reducer that already exists, unchanged
- `BrowserEventBus` → `SocketEventBus`, same interface
- Snapshot-on-connect replacing the `requestState` handshake
- Monotonic sequence numbers, reconnect-forever with backoff, reset to idle on boot

**Estimate: about half a day.** Deferring it past the LED build is what makes it expensive.

---

## 5. The computer

A fanless mini PC inside the plinth. Requirements:

- **Two display outputs** at the panels' native resolution
- **A USB port** for the LED controller
- **Fanless, if the enclosure is sealed** — and then check the thermals under a real 8-hour run,
  because a sealed plinth in a warm gallery is not a desk
- SSD, no spinning disk

Configuration that matters more than the hardware:

- Browser in kiosk mode, autostarted, cursor hidden, screensaver and sleep disabled
- **OS updates blocked during opening hours.** An exhibit that reboots into an update notice at
  11 a.m. on a Saturday is the failure people photograph.
- Restart-on-crash supervision, and a nightly full reload
- **Remote access for staff** (Tailscale or similar) so problems get fixed without opening the
  plinth

Note that MediaPipe and its WebGL dependency leave the shipping build entirely along with the
camera. That dependency cost real debugging time in the prototype, and none of it ships.

---

## 6. The camera

### Target A — the camera is the sensor

It stops being optional, and three things change:

- **Fixed mounting, documented geometry.** Calibration is keyed to the camera. If it moves, the
  calibration is invalid — which the code already detects and falls back to the default region for,
  but a visitor sees a pointer that is subtly wrong. Mount it so it cannot be nudged.
- **Resolution and frame rate over megapixels.** Tracking wants 30 fps and a clean image at the
  working distance. A wide field of view helps coverage and hurts precision at the edges.
- **Privacy is a real obligation, not a formality.** A camera watching visitors in a public
  institution needs signage, and depending on jurisdiction a data protection assessment. The
  defensible position is strong and worth stating plainly: **frames are processed on-device, nothing
  is recorded, nothing leaves the machine, and only a fingertip coordinate reaches the application.**
  That is architecturally true here — no landmark crosses out of the adapter layer — so it is a claim
  the code backs up. Get it in writing before launch.

### Target B — the camera goes

Touch replaces it and the driver is deleted, along with MediaPipe and its WebGL dependency. If
presence detection is still wanted for attract mode, **use a time-of-flight or PIR sensor rather
than a camera** — it answers "is someone there" without any of the obligations above.

---

## 7. The enclosure

Not software, but it constrains software:

- **Access panel** for the mini PC, PSU, and LED controller, without dismantling the display mount
- **Ventilation** that does not become a dust intake
- **The LED channel** as part of the bezel design, not stuck on afterwards
- **Knee clearance** if a seated visitor rolls up to it — roughly 685 mm high, 760 mm wide, and
  430–635 mm deep **(verify against the governing standard)**
- Cable strain relief, and a single switched inlet so staff can power-cycle the whole station

---

## 8. Content and updates

The 118-element dataset is generated and committed, and the app reads local JSON only. **This does
not change**, and that is deliberate: no network at runtime means no network failure mode.

If the venue wants to edit copy without a rebuild, read the JSON from disk at boot instead of
bundling it, and validate on load with the checks the generator already performs — 118 records, no
grid collisions, copy present for every element.

---

## 9. Operations

Mostly already designed into the prototype:

- **Degrade, don't die.** LEDs down → both displays fine. Info display down → table still responds.
  Any single surface failing must not take the others with it.
- **Never show a browser.** No dialogs, no URL bar, no white screen. Every unhandled error resolves
  to attract mode — the error boundary already does this.
- **Reset to idle on boot**, never restore mid-interaction state. The power cycle is the only tool
  staff have on a busy Saturday, and it has to work.
- **Idle reset** after inactivity, warned and non-destructive.
- **Stuck-input watchdog:** continuous contact past ~15 s is a fault, not a visitor.
- **The surround as status indicator:** ambient breathing means healthy, a slow amber pulse means
  degraded, readable from across the room by a docent.
- A **10-second morning check card** and a staff status page.

---

## Decisions needed before more building

These block real work, in rough priority order:

1. **Mount geometry** — vertical, angled, or table? Height above floor? This determines whether
   Reach Mode is needed, and Reach Mode touches every cell.
2. **RGBW or RGB?** Retrofitting the white channel is a rewrite of every lighting effect.
3. **One machine or two?** Two displays from one host, or a host each.
4. **Camera: keep, replace with a presence sensor, or remove?**
5. **LED density** — 60/m or 144/m. Drives power, cost, and diffuser choice.
6. **Opening hours and ambient light levels** — sets the brightness ceiling and floor, and whether
   anti-glare treatment is sufficient.
7. **Who maintains it**, and do they get remote access?

---

## Honest accounting: what gets thrown away

On target A almost everything ships; the throw-away list is short. On target B roughly a quarter of
the current code is scaffolding:

- **On target B only:** `HandInteractionSource`, `handMath`, the calibration subsystem, the camera
  preview, and the WebGL preflight. **On target A all of it ships** — it is the input path.
- The synthetic-camera test harness, either way
- `BrowserEventBus`, replaced by a socket transport implementing the same interface
- `CanvasPreviewSink`, replaced by a serial sink

**All of it sits behind the three seams, which is why this list is short and boring.** Nothing in
the interaction rules, the element data, the layout geometry, the category policy, or the lighting
effects appears on it. That was the whole point of the prototype: not to be the exhibit, but to
make the exhibit's construction obvious rather than surprising.
