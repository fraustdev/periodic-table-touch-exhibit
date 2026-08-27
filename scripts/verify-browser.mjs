#!/usr/bin/env node
/**
 * Browser verification for the exhibit.
 *
 * Unit tests cannot tell you that a video element and its overlay canvas have
 * different aspect ratios, or that a confirmation row is covering the cells a
 * visitor is about to point at. Both of those shipped here and were only caught
 * by measuring real elements in a real page. This is that work, committed.
 *
 *   npm run verify:browser          # against a running dev server
 *   EXHIBIT_URL=... npm run verify:browser
 *   HEADED=1 npm run verify:browser # watch it happen
 *
 * Uses playwright-core against the Chrome already installed, so a clone does
 * not download a browser.
 */
import { chromium } from "playwright-core";

const BASE = process.env.EXHIBIT_URL ?? "http://localhost:5173";
const HEADED = process.env.HEADED === "1";

const checks = [];
const check = (name, fn) => checks.push({ name, fn });

/** Fails a check with a message the reader can act on. */
function expect(condition, message) {
  if (!condition) throw new Error(message);
}

// ---------------------------------------------------------------------------

check("both routes load with no console errors", async ({ context }) => {
  for (const route of ["/table", "/info"]) {
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error" && !message.text().includes("favicon")) {
        errors.push(message.text());
      }
    });
    await page.goto(BASE + route);
    await page.waitForTimeout(1200);
    await page.close();
    expect(errors.length === 0, `${route} logged: ${errors.join(" | ")}`);
  }
  return "no errors on /table or /info";
});

check("all 118 elements render exactly once", async ({ table }) => {
  const symbols = await table.$$eval("[data-symbol]", (nodes) =>
    nodes.map((node) => node.dataset.symbol),
  );
  expect(symbols.length === 118, `expected 118 cells, found ${symbols.length}`);
  expect(new Set(symbols).size === 118, "duplicate element symbols rendered");
  return "118 unique cells";
});

check("every element selects and reaches the second display", async ({ table, info }) => {
  const symbols = await table.$$eval("[data-symbol]", (nodes) =>
    nodes.map((node) => node.dataset.symbol),
  );
  const wrong = [];
  for (const symbol of symbols) {
    await table.locator(`[data-symbol="${symbol}"]`).click();
    // Chrome throttles a hidden page, so waiting a fixed number of milliseconds
    // is a guess. Waiting for the condition makes a timeout mean something.
    await info
      .waitForFunction(
        (want) => document.querySelector(".specimen__symbol")?.textContent === want,
        symbol,
        { timeout: 3000 },
      )
      .catch(async () => {
        const shown = await info
          .$eval(".specimen__symbol", (node) => node.textContent)
          .catch(() => "nothing");
        wrong.push(`${symbol}→${shown}`);
      });
  }
  expect(wrong.length === 0, `mismatched: ${wrong.slice(0, 8).join(", ")}`);
  return `${symbols.length}/${symbols.length} synced correctly`;
});

check("a reloaded display recovers the current selection", async ({ table, info }) => {
  await table.locator('[data-symbol="Au"]').click();
  await info.waitForFunction(
    () => document.querySelector(".specimen__symbol")?.textContent === "Au",
    undefined,
    { timeout: 3000 },
  );
  await info.reload();
  const recovered = await info
    .waitForFunction(
      () => document.querySelector(".specimen__symbol")?.textContent === "Au",
      undefined,
      { timeout: 4000 },
    )
    .then(() => true)
    .catch(() => false);
  expect(recovered, "the reloaded display stayed in its attract state");
  return "requestState handshake restored the selection";
});

check("the light strip is a full loop and pulses from the pressed cell", async ({ table }) => {
  const layout = await table.evaluate(() => {
    const leds = [...document.querySelectorAll(".led")];
    const edge = (rect) => {
      if (rect.top <= 6) return "top";
      if (rect.right >= innerWidth - 6) return "right";
      if (rect.bottom >= innerHeight - 6) return "bottom";
      if (rect.left <= 6) return "left";
      return "stray";
    };
    const counts = {};
    for (const led of leds) {
      const at = edge(led.getBoundingClientRect());
      counts[at] = (counts[at] ?? 0) + 1;
    }
    return { total: leds.length, counts };
  });
  expect(layout.total === 120, `expected 120 pixels, found ${layout.total}`);
  expect(!layout.counts.stray, `${layout.counts.stray} pixels are off the perimeter`);

  // Cesium sits on the left edge, so the pulse must originate there.
  await table.locator('[data-symbol="Cs"]').click();
  await table.waitForTimeout(90);
  const pulse = await table.evaluate(() => {
    const leds = [...document.querySelectorAll(".leds--pulsing .led")];
    if (leds.length === 0) return null;
    const brightest = leds
      .map((led) => ({
        lag: parseFloat(getComputedStyle(led).getPropertyValue("--lag")),
        left: led.getBoundingClientRect().left,
      }))
      .reduce((a, b) => (b.lag < a.lag ? b : a));
    return { count: leds.length, nearLeftEdge: brightest.left < innerWidth * 0.12 };
  });
  expect(pulse !== null, "no pulse fired on selection");
  expect(pulse.nearLeftEdge, "pulse did not originate at the pressed cell's edge");
  return `120 pixels, ${JSON.stringify(layout.counts)}, pulse origin correct`;
});

check("every trend overlay recolours and stays readable", async ({ context }) => {
  // Its own page: the explainer panel only appears with nothing focused, and
  // earlier checks leave a selection behind. Order-independence is worth a tab.
  const table = await context.newPage();
  await table.setViewportSize({ width: 1600, height: 1000 });
  await table.goto(BASE + "/table");
  await table.waitForTimeout(900);

  const results = [];
  for (const label of ["Melting point", "Density", "Electronegativity"]) {
    await table.getByRole("button", { name: label, exact: true }).click();
    await table.waitForTimeout(350);
    const state = await table.evaluate(() => {
      const cells = [...document.querySelectorAll("[data-symbol]")];
      const colours = new Set(
        cells.map((cell) => getComputedStyle(cell).getPropertyValue("--cat").trim()),
      );
      return {
        distinct: colours.size,
        name: document.querySelector(".focus-card__trend-name")?.textContent ?? null,
        ticks: [...document.querySelectorAll(".scale-gauge__ticks span")].length,
      };
    });
    expect(state.distinct > 40, `${label} produced only ${state.distinct} distinct colours`);
    expect(state.name === label, `${label} panel named "${state.name}"`);
    expect(state.ticks === 4, `${label} scale had ${state.ticks} labelled ticks, expected 4`);
    results.push(`${label}: ${state.distinct} colours`);
  }

  // An unmeasured property must say so rather than implying a position.
  await table.getByRole("button", { name: "Melting point", exact: true }).click();
  await table.waitForTimeout(250);
  await table.locator('[data-symbol="Mt"]').hover();
  await table.waitForTimeout(350);
  const unmeasured = await table.evaluate(() => ({
    value: document.querySelector(".focus-card__value")?.textContent ?? null,
    marker: !!document.querySelector(".scale-gauge__marker"),
  }));
  expect(unmeasured.value === "Not measured", `meitnerium read "${unmeasured.value}"`);
  expect(!unmeasured.marker, "a marker was drawn for an unmeasured element");

  // And a measured one must place its marker.
  await table.locator('[data-symbol="W"]').hover();
  await table.waitForTimeout(350);
  const measured = await table.evaluate(() => ({
    value: document.querySelector(".focus-card__value")?.textContent ?? null,
    marker: !!document.querySelector(".scale-gauge__marker"),
  }));
  expect(measured.value === "3422 °C", `tungsten read "${measured.value}"`);
  expect(measured.marker, "no marker drawn for a measured element");

  await table.close();
  return `${results.join(", ")}; unmeasured handled`;
});

check("no interface element covers an element cell", async ({ table }) => {
  const sizes = [
    [1680, 1050],
    [1440, 900],
    [1280, 800],
    [1152, 700],
  ];
  const covered = [];
  for (const [width, height] of sizes) {
    await table.setViewportSize({ width, height });
    await table.waitForTimeout(350);
    const hidden = await table.evaluate(() => {
      const overlaps = (a, b) =>
        !(a.right < b.left || a.left > b.right || a.bottom < b.top || a.top > b.bottom);
      const chrome = [...document.querySelectorAll(".verify, .footer, .masthead")].map((node) =>
        node.getBoundingClientRect(),
      );
      return [...document.querySelectorAll("[data-symbol]")]
        .filter((cell) => {
          const box = cell.getBoundingClientRect();
          return chrome.some((other) => overlaps(box, other));
        })
        .map((cell) => cell.dataset.symbol);
    });
    if (hidden.length > 0) covered.push(`${width}x${height}: ${hidden.join(",")}`);
  }
  await table.setViewportSize({ width: 1600, height: 1000 });
  expect(covered.length === 0, `cells covered — ${covered.join(" | ")}`);
  return `clear at ${sizes.map((s) => s.join("x")).join(", ")}`;
});

check("hand tracking degrades to a working mouse exhibit", async ({ context }) => {
  const page = await context.newPage();
  // Reproduce a machine with no WebGL. Both canvas types must be stubbed:
  // MediaPipe uses OffscreenCanvas, so stubbing only HTMLCanvasElement silently
  // does nothing — a mistake that cost real debugging time.
  await page.addInitScript(() => {
    const realHtml = HTMLCanvasElement.prototype.getContext;
    const realOffscreen =
      typeof OffscreenCanvas !== "undefined" ? OffscreenCanvas.prototype.getContext : null;
    const isGL = (type) => String(type).includes("webgl") || String(type).includes("experimental");
    HTMLCanvasElement.prototype.getContext = function (type, ...rest) {
      return isGL(type) ? null : realHtml.call(this, type, ...rest);
    };
    if (realOffscreen) {
      OffscreenCanvas.prototype.getContext = function (type, ...rest) {
        return isGL(type) ? null : realOffscreen.call(this, type, ...rest);
      };
    }
  });
  await page.goto(BASE + "/table");
  await page.waitForTimeout(900);
  await page.getByRole("button", { name: "Setup" }).click();
  await page.waitForTimeout(300);
  await page.getByRole("button", { name: /enable camera/i }).click();
  await page.waitForTimeout(1200);

  const notice = await page.$eval(".notice", (node) => node.textContent.trim()).catch(() => "");
  expect(/graphics acceleration/i.test(notice), `expected a WebGL explanation, got "${notice}"`);
  expect(
    /mouse exhibit is unaffected/i.test(notice),
    "the notice did not reassure about the mouse",
  );

  await page.keyboard.press("Escape");
  await page.locator('[data-symbol="Ag"]').click();
  await page.waitForTimeout(250);
  const still = await page.$eval(".focus-card__name", (node) => node.textContent).catch(() => null);
  await page.close();
  expect(still === "Silver", `mouse selection broke when the camera failed (got ${still})`);
  return "clear message, and the mouse exhibit still works";
});

check("reduced motion is honoured", async ({ context }) => {
  const page = await context.newPage();
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(BASE + "/table");
  await page.waitForTimeout(800);
  await page.locator('[data-symbol="Fe"]').click();
  await page.waitForTimeout(300);
  const animation = await page.$eval(
    '[data-symbol="Fe"]',
    (node) => getComputedStyle(node).animationName,
  );
  await page.close();
  expect(animation === "none", `confirm animation still ran: ${animation}`);
  return "cell strike animation suppressed";
});

// ---------------------------------------------------------------------------

async function main() {
  const response = await fetch(BASE + "/table").catch(() => null);
  if (!response?.ok) {
    console.error(`\n  Cannot reach ${BASE}. Start the dev server first:\n\n    npm run dev\n`);
    process.exit(2);
  }

  const browser = await chromium.launch({ channel: "chrome", headless: !HEADED });

  /**
   * One shared context for every page. `browser.newPage()` creates a *fresh
   * context* each time, and BroadcastChannel does not cross contexts — the same
   * reason two separate Chrome profiles cannot talk to each other. Two displays
   * in different contexts silently never sync, which looks like a broken app.
   */
  const context = await browser.newContext();
  const table = await context.newPage();
  await table.setViewportSize({ width: 1600, height: 1000 });
  await table.goto(BASE + "/table");
  const info = await context.newPage();
  await info.setViewportSize({ width: 1400, height: 900 });
  await info.goto(BASE + "/info");
  await table.waitForTimeout(1000);

  console.log(`\n  Verifying ${BASE}\n`);
  let failed = 0;
  for (const { name, fn } of checks) {
    const started = Date.now();
    try {
      const detail = await fn({ context, table, info });
      console.log(`  ✓ ${name}\n      ${detail}  (${Date.now() - started}ms)`);
    } catch (error) {
      failed += 1;
      console.log(`  ✗ ${name}\n      ${error.message}  (${Date.now() - started}ms)`);
    }
  }

  await browser.close();
  console.log(
    `\n  ${checks.length - failed}/${checks.length} checks passed${failed ? " — see above" : ""}\n`,
  );
  process.exit(failed === 0 ? 0 : 1);
}

await main();
