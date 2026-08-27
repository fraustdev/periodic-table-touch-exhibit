# Contributing

Orientation for a human picking this up. If you have fifteen minutes, this is the tour.

## Get it running (2 minutes)

```bash
npm install          # also vendors the MediaPipe runtime into public/
npm run dev          # http://localhost:5173/table
```

Open `/table`. Then **Setup → Open info display** and put that window on a second screen. Use that
button rather than opening `/info` yourself — `BroadcastChannel` doesn't cross browser profiles, and
a manually opened window in a different Chrome instance will never connect.

The mouse works immediately. Hand tracking is optional and lives behind the Setup drawer.

```bash
npm test             # 135 unit tests
npm run build        # typecheck + production build
npm run format       # Prettier, enforced in CI

npm run verify:browser   # 9 browser checks against a running dev server
npm run verify           # everything: format, types, tests, build, browser
```

`npm run verify` is the one command that answers "does this actually work". It ends with a browser
pass that unit tests cannot do — sweeping all 118 cells against a live second window, measuring that
no interface element covers a cell at four viewport sizes, and confirming the exhibit still works
with WebGL removed. Run it before you claim anything is done.

## The one idea worth understanding

This is a prototype of a **physical museum installation**: a projected surface selected by mid-air
hand gesture, with addressable LEDs around the display edge. A mouse is the fallback and the
development input. The same code also serves a touchscreen. None of that hardware exists yet.

So the codebase is organised around **three replaceable seams** — input, transport, and light
output. Everything on the far side of a seam is unaware of what the hardware is. That's why you can
work on the lighting without reading any hand-tracking code, and why adding native touch as a third
input is one new file rather than a rewrite.

`docs/hardware-translation.md` maps every part of the prototype onto the real installation, and is
honest about the two places where code genuinely has to change.

## The fifteen-minute tour

Read these four files, in order. Together they're under 400 lines and they contain the whole system.

1. **`src/domain/types.ts`** — every contract in the system. Start here.
2. **`src/domain/interaction.ts`** — all the selection rules, as one pure reducer. This is the heart
   of it: 108 lines, no browser, no React.
3. **`src/domain/elementLayout.ts`** — the periodic table's geometry and its hit test. The renderer
   reads the same numbers, so a pointer can never disagree with what a visitor sees.
4. **`src/ui/table/TableDisplay.tsx`** — where it all gets wired together. The composition root.

Then, if you are working on the hardware path, `src/domain/lightFrame.ts` — the LED output pipeline,
which runs against a null sink and can be inspected with `npm run leds:demo`.

## How the pieces relate

```
   input driver                    domain                       surfaces
┌─────────────────┐        ┌──────────────────┐        ┌────────────────────┐
│ MouseSource     │        │                  │        │ table display      │
│ HandSource      │ ─────► │ reduceInteraction│ ─────► │ info display       │
│ TouchSource     │ Pointer│  + hit test      │ events │ perimeter lights   │
└─────────────────┘ Sample └──────────────────┘        └────────────────────┘
                                                    via validated event bus
```

All three drivers produce the same `PointerSample`. One reducer turns samples into events. Every
surface is just a consumer of those events. Adding a fourth surface is subscribing to the bus.

## Testing philosophy

The rules live in `domain/` precisely so they can be tested without a browser. **Prefer a pure test
over a component test.** Component tests cover rendering and event wiring only.

There's one test worth knowing about: mouse, hand, and touch input are asserted to emit **identical
event sequences** — same selections, same light cues, same order. Timestamps are excluded, because
the drivers reach a press at different points in their own sample streams. If you add an input
device, add it to that test. If they diverge, the drivers have started to drift.

**For anything visual or geometric, verify in a real browser.** Unit tests can't tell you an overlay
is misaligned with its video. That bug shipped here, and was only caught by measuring both elements'
bounding boxes in a live page — which is now `npm run verify:browser`, so the knowledge of _what to
check_ is committed rather than living in someone's head.

`HEADED=1 npm run verify:browser` runs it visibly if you want to watch.

## Claude Code tooling in this repo

If you work here with Claude Code, the project ships its own configuration:

- **`.claude/settings.json`** — a permission allowlist for the routine commands, so `npm test` and
  `npm run verify` do not prompt. Deliberately conservative: nothing that executes arbitrary code is
  allowlisted.
- **`/verify-exhibit`** — runs the unit and browser suites and interprets failures, with a table
  mapping each possible failure to the file that causes it.
- **`/add-trend`** — walks adding a property overlay, including the coverage floor and the
  linear-versus-log decision, so a new trend cannot quietly be a bad one.

`CLAUDE.md` at the root is loaded automatically and carries the invariants.

## Making a change

1. Check `docs/decisions.md` first. Several odd-looking choices are deliberate and the reasoning is
   recorded. It also says what would change our mind, so it's an invitation, not a wall.
2. `CLAUDE.md` lists the invariants and a table of where to make common changes.
3. Tests first where the change is in `domain/`.
4. `npm run format`, then `npm test`, then `npm run build`.
5. Write a commit message that explains the reasoning, and for a fix, the failure mode. `git log`
   sets the bar deliberately.

## Where the risk is

`src/ui/table/TableDisplay.tsx` is the largest file at around 370 lines, and it is the composition
root: it wires the drivers, the two hooks, and the three surfaces together. It is also the least
directly tested file, because almost everything it coordinates is tested where that logic lives.

It used to be 575 lines carrying five jobs. The camera lifecycle now lives in
`src/hooks/useHandTracking.ts` and the calibration flow in `src/hooks/useCalibrationRun.ts`.

**If you are adding to this file, ask first whether the logic belongs in a hook or in `domain/`.**
That is how it stayed manageable, and it is the easiest thing to undo by accident.

Two hooks, one wrinkle worth knowing: they are mutually dependent. Calibration maps camera space to
table space and is keyed to the camera's label; the camera needs calibration's transform on every
frame. That cycle is broken by two explicit refs in `TableDisplay`, each commented with why it is
there. Do not try to remove them without replacing the cycle with something better.

## Deliberately out of scope

Dwell selection, multi-hand input, nine-point calibration, event replay, WebSocket/MQTT transports,
and real LED control. Each has a seam waiting for it; none is needed to prove the interaction. See
`docs/decisions.md` for why each was deferred rather than dismissed.
