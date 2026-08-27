# How this was built

The repo shows the output. This is the process, including the parts that went wrong — which are the
parts that say something useful about working with an AI agent on a deadline.

## The shape of it

**Roughly two hours** to a complete, verified screen-only prototype: 118 elements, two synced
displays, the virtual LED perimeter, mouse and MediaPipe input, 51 tests.

**Then several hours of hardening**, almost none of it planned, because a laptop with a real webcam
behaves nothing like a test environment. That second phase is where the interesting work is, and
it's visible in `git log` — 21 commits, each naming a failure mode.

The split matters. The first phase was executing a plan. The second was debugging reality, which is
where an agent is either genuinely useful or a confident liability.

## What made the first phase fast

**A spec and a plan existed before any code.** `docs/design-spec.md` and
`docs/implementation-plan.md` were written first, with a file map and task ordering. The build was
executing a plan, not improvising — which is why the architecture survived the hardening phase
without restructuring.

**The riskiest thing was deferred by design.** The plan put the mouse-complete two-display
experience first and hand tracking second, explicitly so that camera failure could never block the
core demo. That decision paid for itself several times over.

**Rules were separated from rendering immediately.** All selection behaviour lives in one pure
108-line reducer with no browser dependencies. Tests run without a DOM, so verification was fast
throughout.

## What the second phase actually looked like

This is the honest part.

### A root cause found by reproducing it, not guessing

Hand tracking failed on the real machine with `INTERNAL: Service "kGpuService" ... cannot be
created`. Two hypotheses were wrong before the right one:

1. Guessed the CPU delegate would work. Added a fallback. It got further and then threw
   `Cannot read properties of undefined (reading 'activeTexture')` on every frame.
2. Guessed WebGL was required. **Tested it by stubbing `getContext` to return null — and the test
   came back clean**, which sent the investigation elsewhere.
3. The test was wrong, not the hypothesis. MediaPipe uses `OffscreenCanvas`. Stubbing _both_
   `HTMLCanvasElement.prototype.getContext` and `OffscreenCanvas.prototype.getContext` reproduced
   **both** original errors exactly, on the first try.

Root cause: **MediaPipe uploads every frame as a GL texture, so it needs WebGL even with CPU
inference.** No code path around it. The fix was a preflight check that says so in plain language
instead of surfacing either cryptic error.

The lesson isn't "WebGL is required". It's that a negative test result is only as good as the test —
and the cost of not checking that was two wrong turns.

### A bug that only a browser could find

The hand skeleton drew offset from the hand. Tracking was correct; the _preview_ was wrong. The box
was hard-coded to 4:3 while the camera delivered 16:9, so `object-fit: cover` centre-cropped the
video while the overlay kept drawing landmarks across the full frame.

Found by measuring both elements' bounding boxes in a live page and noticing they disagreed. **No
unit test would have caught this**, which is why `CLAUDE.md` now says browser verification is not
optional for visual or geometric claims.

### A bug found by reading code, not running it

The four-corner calibration recorded `hold.at` — a value assigned once when drift was detected and
never updated. Every corner captured the sample that _started_ the hold, the noisiest available
reading. The entire point of dwelling is to average.

Nothing failed loudly. It just made calibration feel worse than it should. Found by reading the
reducer during a deliberate review pass, along with four other issues: one stray frame destroying
900 ms of progress, a bowtie quadrilateral solving to a valid-but-nonsense transform, no way to
verify a calibration before it persisted, and uncalibrated hand input doing nothing at all.

### A detour that was my own fault

To test camera code without a webcam, `getUserMedia` was stubbed in a headless browser tab to return
a canvas painted solid teal. That browser is a **visible window on the same machine**, and time was
lost debugging the fake camera in the belief it was the app.

It's in here because it's instructive: an agent's test scaffolding is not invisible, and "the tool
is lying to you" is a real failure mode worth naming out loud.

## How verification actually worked

Claims in this repo are checked, not asserted. Concretely:

- **All 118 cells clicked** in a real browser against a live second window — 118/118 correct
- **The WebGL failure reproduced** under simulated conditions before the fix was written
- **The camera race proved fixed** by firing three overlapping starts at a deliberately slowed
  `getUserMedia`
- **Layout claims measured** — that the confirmation row and calibration preview hide zero cells,
  across four viewport sizes
- **The LED refactor verified geometrically** — 120 pixels in a 40/20/40/20 distribution, no strays,
  pulse still originating at the pressed cell's edge
- **A cold clone tested end to end**: `git clone`, `npm ci`, format, typecheck, 73 tests, build

## What was deliberately not built

A hologram route was scoped and dropped — the architecture supports it as a third event consumer,
but it was a tangent. A `TableDisplay` refactor was identified and deferred, because it touches the
least-tested file. Both are recorded rather than silently abandoned: `docs/decisions.md` for the
reasoning, `CONTRIBUTING.md` for the refactor.

An over-engineering audit late in the process found the thing worth finding: a `LightOutput`
interface named in the README as one of three load-bearing seams, **implemented by nothing**. Not
bloat — a documentation claim that wasn't true. Deleted, and the seam described as the convention it
actually is.

## The short version

Speed came from a plan and a pure core. Correctness came from reproducing failures before fixing
them, and from verifying visual claims in a browser rather than trusting tests. The wrong turns came
from trusting a test that didn't test what it claimed — twice.
