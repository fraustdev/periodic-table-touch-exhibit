---
name: verify-exhibit
description: Verify the exhibit actually works before claiming it does. Use when asked to verify, test, or check the exhibit, before committing UI or interaction changes, and before any demo. Runs the unit suite and the browser suite, then interprets failures.
---

# Verify the exhibit

Unit tests cannot see a misaligned overlay or a panel covering the cells a visitor is about to
point at. Both shipped here. **Never claim this works on the strength of `npm test` alone.**

## Run it

The browser suite needs a dev server. Check first, start it only if it is down:

```bash
curl -s -o /dev/null http://localhost:5173/table && echo up || echo down
```

If down: `npm run dev` in the background, then wait for it with an `until` loop — do not sleep a
fixed amount.

Then:

```bash
npm run verify          # format, types, unit tests, build, browser
npm run verify:browser  # browser only, ~30s, when iterating on UI
```

`HEADED=1 npm run verify:browser` shows the browser if something needs watching.

## Report honestly

State the counts you actually saw. `9/9 checks passed` means something; "verified" does not. If a
check fails, say which one and what it reported — never summarise a failure as a warning.

## Interpreting failures

| Failure                                    | Look at                                                                                                                                 |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------- |
| console errors on load                     | The error itself. An exhibit must never surface an error to a visitor; the boundary in `ExhibitErrorBoundary` should have caught it.    |
| a cell count other than 118                | `scripts/build-elements.mjs` asserts 118 and no grid collisions. If the dataset is fine, `elementLayout.ts` is placing something wrong. |
| selections not reaching the second display | Almost always a transport or context problem, not a logic one. `BroadcastChannel` does not cross browser contexts or Chrome profiles.   |
| the reload check failing                   | The `requestState` handshake in `TableDisplay` and `InfoDisplay`.                                                                       |
| pulse origin wrong                         | `perimeterOrigin` in `PerimeterLights`, or `getCellCenter` in `elementLayout`.                                                          |
| a trend panel named `null`                 | The explainer only renders with nothing focused. If this fails in the suite, the check lost its page isolation.                         |
| cells covered                              | Something was added as an overlay instead of a layout row. The table must give up space, not hide elements.                             |
| the WebGL check failing                    | The preflight in `HandInteractionSource`. Its message must name the fix and reassure about the mouse.                                   |

## After fixing a bug

**If a unit test could not have caught it, add a check to `scripts/verify-browser.mjs`.** That is
what keeps the suite worth running rather than decorative.
