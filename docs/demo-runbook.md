# Demo runbook

For running this live. Skim before, glance at during.

## Setup (2 minutes, do it before they're watching)

```bash
cd ~/projects/periodic-table-touch-exhibit
npm run dev
```

1. Open **http://localhost:5173/table**. Full-screen it (`⌃⌘F`).
2. **Setup → Open info display.** Drag that window to the second screen, full-screen it.
   Use the button — a manually opened window can land in a different browser profile, and
   `BroadcastChannel` does not cross profiles.
3. Confirm the masthead reads **"Hand · default region"**. If it says "Mouse input", open Setup and
   click **Restart camera**.
4. Close the Setup drawer (`Escape`). Nothing operator-facing should be visible.
5. Click one element to prove both screens are talking. Then reload `/table` for a clean start.

**Lighting:** the surround LEDs read much better in a dim room. Worth dimming if you can.

## The through-line

> The flat screen is good at language. The lights and the second display carry what a flat screen
> can't. Every part of this is arranged so the hardware can arrive without anything being rethought.

## Sequence

**1. Let it sit for a moment.** The idle table, the ambient surround. Say what it is: a screen-only
prototype of a projected museum installation, selected by mid-air hand gesture, with addressable
LEDs around the display edge.

**2. Hover across a few elements.** Point out that the whole group and period illuminate — the
cheapest teaching feature in the build. Note the readout in the table's empty quadrant, and _why_ it
exists: a finger covers the cell it presses and about 150 mm below it, so the feedback is repeated
where a hand cannot occlude it.

**3. Select gold.** Both screens land together, and the LED pulse travels outward from gold's
nearest edge — not a generic flash. Let the second display be read: the editorial label, the
electronegativity scale (_Cesium gives electrons away → Fluorine takes them_) rather than a bare
number.

**4. Select neon, then uranium.** Different category, different accent colour across all three
surfaces from one shared policy.

**5. Press `t`, or hit "Melting point" in the footer.** This is the moment to slow down.

The whole table recolours by melting point. Point out the **bright ridge through the middle of the
d-block** — those are the refractory metals, niobium through osmium, and they are physically the
hardest things on the table to melt. Then the noble gases sitting dark at the right edge.

Say what it means: _the layout stops being a convention you have to be taught and becomes something
you can see._ The columns and rows encode valence electrons and shell filling, and this makes that
structure visible as physics.

Then press `t` again for density and note the scale is **logarithmic** — it spans three orders of
magnitude, so a linear ramp would render everything except the heavy metals identically.

If anyone looks at the grey cells: those are elements with **no measured value**. Eleven have no
melting point on record, almost all synthetic superheavies. They are grey rather than given an
invented number, because the gap is a real fact about the limits of measurement.

**6. Now the hand.** Point and pinch. Say the important part out loud: **this is the shipping input,
not a gimmick** — the installation is projected and gesture-driven, so this is the real interaction,
being developed against a laptop webcam.

The seam still matters, and it matters _today_: no landmark ever crosses out of the adapter layer.
The only thing that leaves is a pointer sample in normalized surface space, which is why the mouse
is a genuine fallback rather than a separate code path, and why a touchscreen variant is one new
file. There's a test asserting mouse and hand produce byte-identical event sequences.

**7. Reload the info window while they watch.** It comes back with the current element. Small, and
it's the difference between an exhibit and a demo.

## If asked about the hardware path

Two things you can show rather than describe:

**The touch driver already exists.** `TouchInteractionSource` is implemented and mounted alongside
the mouse. There is a test asserting mouse, hand, and touch produce identical selections and light
cues. So "the seam works" is not a claim, it is a passing test — and it needed real thought, because
touch has no hover, contact is itself the press, and a panel reports resting forearms as contacts.

**The LED output path is written and inspectable.** Run it in front of them:

```bash
npm run leds:demo
```

It prints the actual bytes a controller would receive — GRB order, gamma-encoded, dithered, COBS
framed with a CRC — proves a single flipped bit is rejected, shows the dither averaging a level 8
bits cannot represent, and tabulates the link budget. That last table is the useful one: 230 RGBW
pixels at 60 fps is 554 kbps, so a 115200 UART cannot carry it. Better to know that now than on a
bench at midnight.

## If asked "how do you hand this off?"

Three things to show, in this order:

1. **`CLAUDE.md`** — invariants, a table of where to make common changes, and the traps that already
   cost hours. For a Claude Code team this is the handoff document: it's context their agent has
   from the first message, not a wiki page they might read.
2. **`docs/decisions.md`** — thirteen decisions with rationale and _what would change our mind_.
   This is what stops a new person "fixing" a deliberate choice.
3. **`docs/hardware-translation.md`** — every part of the prototype mapped onto the real
   installation, honest about the two places where code has to change.

Then `git log`. The commit messages carry the reasoning and, for fixes, the failure mode.

## If asked what's weak

Say it plainly, it lands better than deflecting:

- **`TableDisplay.tsx` is still the biggest file at ~370 lines.** It was 575 doing five jobs; the
  camera lifecycle and the calibration flow are now hooks. It is the composition root, and it is the
  file most likely to accumulate again — `CONTRIBUTING.md` says so and says what to do instead.
- **The transport still has to be replaced** with a local authoritative process before the LED build.
  That is the one genuine piece of remaining work, and it is about half a day.
- **Commit-on-press is a WCAG 2.5.2 Level A conformance gap.** Recorded in the decision log as an
  open question, not a settled choice. A public institution will require it changed; the fix is
  small.
- **The interpretation panel's type scale is laptop-tuned** and needs roughly 2–3× for a 2 m viewing
  distance.

## Recovery

| If                        | Do                                                                                                                             |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Camera won't start        | Setup shows the reason in plain language. Say "the mouse exhibit is the backbone" and carry on — that's by design, not a save. |
| Hand pointer feels offset | Setup → Calibrate corners. Or just switch to mouse; don't burn demo time.                                                      |
| Info display not updating | It was opened outside the app. Close it, use Setup → Open info display.                                                        |
| Tracking says "no hand"   | Sit back to arm's length, face a light source, hand in the middle third of frame.                                              |
| Anything white-screens    | The error boundary shows a museum-styled card with a Restart button. Click it.                                                 |
| Total wedge               | `git checkout demo-ready` is a known-good tag.                                                                                 |

## The live build, if you want one

There is one deliberate gap: **there is no boiling-point overlay.** The data is in the dataset and
adding it is a single entry. If the conversation turns to how you work, fill that gap in front of
him — it proves the architecture and the workflow in one move, and nothing you say can do that.

**Setup:** have the repo open, the dev server running, and a terminal ready.

**1. Show where the answer lives, before writing anything.** Open `CLAUDE.md` and scroll to the
"where to make common changes" table. Point at the row: _Add a trend overlay → `src/policy/trends.ts`
— add to `TRENDS`, nothing else changes._

> "This is what my Claude reads first in this repo. It's not documentation I hope someone opens —
> it loads automatically."

**2. Run the skill.** Type `/add-trend` and ask for boiling point.

It will check coverage first (104 of 118 — above the floor), then compute whether the scale should be
linear or logarithmic. **Let it do that out loud**, because it is the interesting part: the range
spans a ratio of 1469, which naively suggests a log scale, but the median sits at 0.442 of the linear
range, which is almost perfectly centred. **Linear is correct.** Density, by contrast, has its median
at 0.192 and genuinely needs log.

> "The skill encodes the judgement, not just the steps. I got this rule wrong the first time and
> fixed it against the real data."

**3. Let it write the entry and the test, then verify.**

```bash
npm test
npm run verify:browser
```

The browser suite picks up the new trend automatically — it iterates whatever is in `TRENDS` and
checks each one recolours, names itself, labels four ticks, and handles an unmeasured element.

**4. Click it in the browser.** Tungsten boils at 5930 °C and will be the brightest cell on the
board. Helium at −269 °C the darkest. Carbon and phosphorus stay grey, because they sublime rather
than boil and the dataset honestly has no value for them.

**If it goes wrong**, that is still a usable moment: `git checkout src/policy/trends.ts` and say the
verification caught it. A demo where the safety net visibly works is not a failed demo.

## Numbers worth having ready

- **118 elements**, all selectable — verified by clicking every one against the second display,
  118/118 correct
- **135 unit tests plus 9 browser checks**; `npm run verify` runs everything in one command
- **Three input drivers** — mouse, hand, touch — asserted to produce identical event sequences
- **CI green** on format, typecheck, tests, build, and dataset reproducibility
- **120 virtual LEDs**, addressed by normalized arc length so the same effect drives a real strip of
  any length — about 230 at 60/m around a 55" display edge
- **~half a day** to swap `BroadcastChannel` for the authoritative local process, because the event
  contract is already the wire format
- **Roughly a quarter of the code doesn't ship** — and all of it sits behind the three seams
