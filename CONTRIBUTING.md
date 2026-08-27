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
npm test             # 73 tests
npm run build        # typecheck + production build
npm run format       # Prettier, enforced in CI
```

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
4. **`src/ui/table/TableDisplay.tsx`** — where it all gets wired together. The largest file, and the
   one to be most careful in.

## How the pieces relate

```
   input driver                    domain                       surfaces
┌─────────────────┐        ┌──────────────────┐        ┌────────────────────┐
│ MouseSource     │        │                  │        │ table display      │
│ HandSource      │ ─────► │ reduceInteraction│ ─────► │ info display       │
│ (TouchSource)   │ Pointer│  + hit test      │ events │ perimeter lights   │
└─────────────────┘ Sample └──────────────────┘        └────────────────────┘
                                                    via validated event bus
```

Both inputs produce the same `PointerSample`. One reducer turns samples into events. Every surface
is just a consumer of those events. Adding a fourth surface is subscribing to the bus.

## Testing philosophy

The rules live in `domain/` precisely so they can be tested without a browser. **Prefer a pure test
over a component test.** Component tests cover rendering and event wiring only.

There's one test worth knowing about: mouse and hand input are asserted to emit **byte-identical
event sequences**. If you add an input device, add it to that test. If they diverge, the two inputs
have started to drift and the touch swap is no longer safe.

**For anything visual or geometric, verify in a real browser.** Unit tests can't tell you an overlay
is misaligned with its video. That bug shipped here, and was only caught by measuring both elements'
bounding boxes in a live page.

## Making a change

1. Check `docs/decisions.md` first. Several odd-looking choices are deliberate and the reasoning is
   recorded. It also says what would change our mind, so it's an invitation, not a wall.
2. `CLAUDE.md` lists the invariants and a table of where to make common changes.
3. Tests first where the change is in `domain/`.
4. `npm run format`, then `npm test`, then `npm run build`.
5. Write a commit message that explains the reasoning, and for a fix, the failure mode. `git log`
   sets the bar deliberately.

## Where the risk is

`src/ui/table/TableDisplay.tsx` is around 575 lines and carries five jobs: React state, camera
lifecycle, calibration orchestration, keyboard handling, and rendering. It's also the least tested
file in the repo.

It's the known refactor candidate — extracting `useHandTracking` and `useCalibrationRun` would take
it to roughly 250 lines and make both testable. If you're looking for a first contribution that the
whole team benefits from, that's the one.

## Deliberately out of scope

Dwell selection, multi-hand input, nine-point calibration, event replay, WebSocket/MQTT transports,
and real LED control. Each has a seam waiting for it; none is needed to prove the interaction. See
`docs/decisions.md` for why each was deferred rather than dismissed.
