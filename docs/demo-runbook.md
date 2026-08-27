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

**5. Now the hand.** Point and pinch. Say the important part out loud: **this is the shipping input,
not a gimmick** — the installation is projected and gesture-driven, so this is the real interaction,
being developed against a laptop webcam.

The seam still matters, and it matters _today_: no landmark ever crosses out of the adapter layer.
The only thing that leaves is a pointer sample in normalized surface space, which is why the mouse
is a genuine fallback rather than a separate code path, and why a touchscreen variant is one new
file. There's a test asserting mouse and hand produce byte-identical event sequences.

**6. Reload the info window while they watch.** It comes back with the current element. Small, and
it's the difference between an exhibit and a demo.

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

- **`TableDisplay.tsx` is 575 lines doing five jobs** and is the least-tested file. It's named as the
  known refactor candidate in `CONTRIBUTING.md`, with the specific extraction described.
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

## Numbers worth having ready

- **118 elements**, all selectable — verified by clicking every one against the second display,
  118/118 correct
- **73 tests**, CI green on format, typecheck, test, build, and dataset reproducibility
- **120 virtual LEDs**, addressed by normalized arc length so the same effect drives a real strip of
  any length — about 230 at 60/m around a 55" display edge
- **~half a day** to swap `BroadcastChannel` for the authoritative local process, because the event
  contract is already the wire format
- **Roughly a quarter of the code doesn't ship** — and all of it sits behind the three seams
