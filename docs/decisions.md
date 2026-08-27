# Decisions

The real decisions, why they were made, and **what would change our mind**. That last part matters:
this is a record, not a rulebook. If the trigger condition is met, revisit it.

Read this before changing something that looks odd. Several odd-looking choices are deliberate.

---

## 1. The prototype is screen-only, and models hardware it does not have

**Decision.** Build a browser prototype whose structure mirrors the eventual installation — a
projected surface driven by mid-air hand gesture, with a physical LED strip — rather than the
structure a web app would naturally take. The same structure also serves a touchscreen variant.

**Why.** The prototype's job is not to be the exhibit. It is to make the exhibit's construction
obvious rather than surprising — so that when the panel and the strip arrive, nothing has to be
rethought.

**Cost.** Some code is more elaborate than a screen-only demo needs. The light layer in particular
is a per-pixel frame buffer rather than CSS animation.

**What would change our mind.** If the hardware build were cancelled and this became a web toy, most
of the light layer's fidelity would be waste.

---

## 2. Three seams: input, transport, light output

**Decision.** Hold three seams narrow — input, transport, and light output — and let nothing
hardware-specific cross them.

Input and transport are expressed as interfaces (`InteractionSource`, `ExhibitEventBus`). **Light
output is a convention rather than an interface**, and deliberately so: the pulse origin and
per-pixel lag are pure functions of arc length, and only the DOM rendering is browser-specific. A
`LightOutput` interface was declared early and deleted once it became clear nothing implemented it
and nothing would until the serial sink exists. An interface with zero implementations documents an
intention as though it were a fact.

**Why.** These are the three things certain to change. Everything else (rules, data, geometry,
colour policy, effects) is device-independent and shouldn't have to move.

**Consequence.** Roughly a quarter of the current code doesn't ship, and all of it sits behind these
three seams. That's why the throw-away list in `docs/hardware-translation.md` is short and boring.

**What would change our mind.** Nothing, realistically. This is the project's central bet and it has
already paid off twice — once when the light model was sized for a real strip, once when the touch
driver became a config change.

---

## 3. Mouse and hand input go through the same reducer

**Decision.** No `onClick` handlers on cells. Both drivers emit `PointerSample` and both go through
`reduceInteraction`. A test asserts they produce byte-identical event sequences.

**Why.** Two input paths drift. A React click handler would work today and silently diverge from the
gesture path within a week, and the divergence would only surface on the installed hardware, where
the mouse is the fallback everyone falls back to.

**Cost.** More indirection than a click handler. Genuinely more code.

**What would change our mind.** Nothing. This is the single cheapest guarantee that the touch swap
will be uneventful.

---

## 4. `BroadcastChannel` now, an authoritative local process later

**Decision.** Use `BroadcastChannel` between two browser windows in the prototype, knowing it must
become a Node process holding the state machine and serving both displays over WebSocket.

**Why now.** Zero infrastructure, and it proves the event contract without a server.

**Why it must change.** Three reasons, all discovered rather than assumed:

1. A browser tab cannot reliably hold the LED controller's serial port. WebSerial needs a user
   gesture and is not something to stake an unattended exhibit on.
2. Nothing owns the truth. A display that reloads is blank until it asks — survivable with two
   surfaces, unacceptable with three.
3. The lights need one tick source. Composite brightness across three surfaces is unbounded unless
   one process owns the frame clock.

**Migration cost.** About half a day, because the event contract already _is_ the wire format.
Deferring it past the LED build is what makes it expensive.

**What would change our mind.** Nothing — this is scheduled, not disputed.

---

## 5. Commit selection on press, not release

**Decision.** The engage edge commits the selection.

**Why.** It feels immediate, and it matches what both a pinch gesture and a touch driver naturally
report.

**The counter-argument, which is real.** WCAG 2.5.2 Pointer Cancellation (Level A) treats
down-to-commit as a conformance failure: a visitor who touches the wrong cell has no way to abort.
The accessible pattern is preview on down, commit on lift.

**Status.** **This is a known conformance gap, not a settled decision.** It was accepted for a
two-hour prototype and should be revisited before any public installation.

**What would change our mind.** Any commitment to accessibility conformance, which a public
institution will require. The change is small: move the commit to the release edge and treat the
press edge as preview.

---

## 6. Debounce per cell, not globally

**Decision.** Re-selecting the _same_ cell is ignored for 1,000 ms. Different cells are never
blocked.

**Why.** A visitor mashing twelve different elements should get twelve responses. A global refractory
period would swallow eleven of them and read as a broken exhibit.

**What would change our mind.** Evidence that rapid selection causes a real problem downstream — for
example an LED effect that can't keep up. Fix the effect first.

---

## 7. Lighting effects address normalized arc length, never an index

**Decision.** No effect may contain an LED count or an index comparison. Position on the strip is a
0–1 loop coordinate.

**Why.** The prototype has 120 virtual pixels; the real bezel needs roughly 230 at 60/m or 550 at
144/m. Arc-length addressing means the same effect drives any of them unchanged.

**What would change our mind.** Nothing. This costs nothing and removes an entire category of
rework.

---

## 8. The element dataset is generated but committed

**Decision.** `src/data/elements.json` is built by `scripts/build-elements.mjs` from a source dataset
plus authored exhibit copy, and the result is committed. The app reads local JSON only.

**Why.** No network at runtime means no network failure mode. Committing the output means a clone
runs immediately, and the generator asserts 118 records, no grid collisions, and copy present for
every element.

**What would change our mind.** If the venue wants to edit copy without a rebuild, read the JSON from
disk at boot instead of bundling it, and run the same validation on load.

---

## 9. The MediaPipe runtime is vendored at install time, not committed

**Decision.** A `postinstall` script copies the WASM from `node_modules` and downloads the model into
`public/mediapipe/`, which is gitignored.

**Why.** 41 MB of binaries in git for a portfolio repo is unreasonable, and both are reproducible.
The demo itself stays offline-capable because the files are local by the time it runs.

**Trade-off.** A fresh clone needs `npm install` before hand tracking works. A failed model download
warns rather than failing the install, because mouse input is the exhibit's backbone.

**Note.** History still contains the binaries from the first commit, so a clone is around 18 MB. Not
worth rewriting.

---

## 10. Hand tracking works before calibration

**Decision.** The central region of the camera frame maps to the whole table by default. Corner
calibration is a refinement that corrects for an off-axis camera, not a gate that unlocks the
feature.

**Why.** Originally, uncalibrated hand input did nothing at all — so a bad calibration pass meant no
hand tracking, in front of an audience. Making the default usable removes an entire class of demo
failure.

**Also.** A stored calibration whose camera or geometry no longer matches falls back to the default
rather than being applied to geometry it was never measured against.

**What would change our mind.** Nothing. This is strictly better.

---

## 11. Calibration is confirmed before it is saved

**Decision.** A finished four-corner capture drives tracking live while a confirmation row offers
"Looks right" or "Redo". Nothing persists until confirmed.

**Why.** `solveHomography` rejects a singular matrix but happily accepts a bowtie, a mirrored order,
or a thumbnail-sized box — all of which map the table onto nonsense. Validation catches most of it;
the confirmation step catches the rest. Discovering a bad calibration mid-demo is the failure worth
engineering against.

**What would change our mind.** Nothing.

---

## 12. No camera in the visitor-facing view

**Decision.** The camera preview appears only in the setup drawer and the calibration overlay. The
exhibit view contains no camera element at all.

**Why.** A visitor must never see a computer-vision debug view. It also reduces the number of live
video elements, and keeps the table free of overlays that hide elements.

**What would change our mind.** Nothing for the exhibit view. A staff-only diagnostic view is a
different surface and could show whatever it needs to.

---

## 13. Touch is implemented, not promised

**Decision.** Build `TouchInteractionSource` now, mount it alongside the mouse driver, and extend
the equivalence test to three drivers.

**Why.** The repo claimed a swappable input seam. A claim that costs nothing to verify should be
verified — and it turned out to need real thought rather than a rename: touch has no hover, contact
is itself the press, and a panel reports resting forearms as contacts.

**Consequence.** Both drivers mount together and each claims only its own `pointerType`. Without
that filter a real panel fires both handlers for one contact and double-reports every press.

**What would change our mind.** Nothing. It is ~80 lines and it converts an assertion into a test.

---

## 14. Trend overlays render unmeasured values as unmeasured

**Decision.** A trend recolours the table by a measured property. Elements without a value get a
distinct no-data colour, never a midpoint or a zero.

**Why.** Eleven elements have no measured melting point, almost all of them synthetic superheavies.
That gap is a fact about the limits of measurement, and it is more interesting than a smooth
gradient would be. Fabricating a value to keep the picture tidy would be lying with colour.

**Also.** Density is logarithmic, because it spans three orders of magnitude and a linear ramp
renders everything except the heavy metals identically.

**What would change our mind.** Nothing on the no-data rule. If a trend were added whose gaps are
genuinely uninteresting, the ramp could interpolate — but it would need arguing.

---

## 15. The LED pipeline is built before the hardware

**Decision.** Implement the full output path — governor, gamma, dither, channel order, COBS, CRC16 —
against a `NullSink`, with a script that prints the real wire bytes.

**Why.** Every detail in it is cheap to get right now and expensive to discover on a bench at
midnight: WS2812 strips are GRB not RGB; LEDs clip hard and per-channel, unlike a screen blend; 8-bit
linear wastes codes at the dark end; a 115200 UART cannot carry 230 RGBW pixels at 60 fps.

**Also.** The governor is not exported, so an effect author cannot obtain a sink and bypass the power
ceiling or the visibility floor. Composite brightness is a safety property, not a styling choice, and
a test asserts the governor is unreachable.

**What would change our mind.** If the installation turned out to project the glow rather than emit
it, most of this becomes unnecessary — see the open question about where a strip mounts on a
projected surface.

---

## 16. Deferred, not dismissed

These were consciously left out of the prototype. Each has a seam waiting for it.

| Deferred                  | Why                                              | Revisit when                    |
| ------------------------- | ------------------------------------------------ | ------------------------------- |
| Dwell selection           | Excludes visitors with tremor, dyskinesia, or CP | Never, as a sole method         |
| Multi-hand input          | Doubles gesture ambiguity for little gain        | A compare feature is specced    |
| Nine-point calibration    | Four points already correct for keystone         | The camera is far off-axis      |
| Event replay / sequencing | No observed ordering problem at two surfaces     | A third surface joins           |
| Real LED control          | No hardware yet                                  | The strip is bought             |
| WebSocket transport       | See decision 4                                   | Before the LED build, not after |

---

## Open questions for the hardware build

Listed in priority order in `docs/hardware-translation.md`. The two that block design work rather
than procurement:

1. **Mount geometry** — vertical, angled, or table? A vertical mount needs a Reach Mode viewport
   transform that touches every cell. A table mount has a different reach problem entirely.
2. **RGBW or RGB** — retrofitting the white channel is a rewrite of every lighting effect.
