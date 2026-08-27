/**
 * Prints the actual bytes the LED controller would receive.
 *
 * Run with: npm run leds:demo
 *
 * The point is to make the output path inspectable before any hardware exists.
 * Everything here is the shipping pipeline — the only difference on the real
 * installation is that the sink writes to a serial port instead of counting.
 */
import {
  addLight,
  CapturingSink,
  channelCount,
  createDitherState,
  createLinearFrame,
  DEFAULT_FRAME_OPTIONS,
  encodeFrame,
  framePacket,
  NullSink,
  parsePacket,
  wireBudget,
  type FrameOptions,
} from "../src/domain/lightFrame.ts";

const hex = (bytes: Uint8Array, from = 0, limit = 24) => {
  const slice = [...bytes.subarray(from, from + limit)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join(" ");
  const suffix = bytes.length > from + limit ? ` … (${bytes.length} bytes total)` : "";
  return `${from > 0 ? `[from byte ${from}] ` : ""}${slice}${suffix}`;
};

function rule(title: string) {
  console.log(`\n${title}\n${"─".repeat(title.length)}`);
}

// ---------------------------------------------------------------------------
// The prototype's own strip: 120 pixels, WS2812 (GRB).
// ---------------------------------------------------------------------------
const prototype: FrameOptions = { ...DEFAULT_FRAME_OPTIONS };

rule("Strip configuration");
console.log({
  pixels: prototype.pixelCount,
  order: prototype.order,
  channelsPerPixel: channelCount(prototype.order),
  gamma: prototype.gamma,
  maxLevel: prototype.maxLevel,
  minLitLevel: prototype.minLitLevel,
});

// ---------------------------------------------------------------------------
// One pulse: gold selected, rippling outward from arc position 0.25.
// ---------------------------------------------------------------------------
const GOLD = [0.85, 0.68, 0.33]; // linear-light RGB, roughly the gold accent
const origin = 0.25;

const frame = createLinearFrame(prototype);
for (let i = 0; i < prototype.pixelCount; i += 1) {
  const loop = (i + 0.5) / prototype.pixelCount;
  const raw = Math.abs(loop - origin);
  const distance = Math.min(raw, 1 - raw) * 2; // both directions at once
  const falloff = Math.max(0, 1 - distance * 3);
  if (falloff > 0)
    addLight(
      frame,
      i,
      GOLD.map((c) => c * falloff),
    );
}

const dither = createDitherState(prototype);
const pixels = encodeFrame(frame, prototype, dither);
const packet = framePacket(pixels);

// Show the lit region, not the dark side of the loop.
const brightestPixel = Math.round(origin * prototype.pixelCount);
const window = Math.max(0, (brightestPixel - 2) * channelCount(prototype.order));

rule("Encoded pixel bytes (GRB, gamma-encoded, dithered)");
console.log(`pulse origin is arc ${origin} → pixel ${brightestPixel}`);
console.log(hex(pixels, window));
console.log("green byte leads each pixel: GRB, not RGB — the classic first-run mistake");

rule("Wire packet (COBS framed, CRC16, zero-delimited)");
console.log(hex(packet, window));
console.log(`delimiter at end: ${packet.at(-1) === 0}`);
console.log(
  `zero bytes inside the frame: ${[...packet.subarray(0, -1)].filter((b) => b === 0).length}`,
);

rule("Controller-side validation");
const decoded = parsePacket(packet);
console.log(`CRC verified and payload recovered: ${decoded !== null}`);
console.log(
  `byte-for-byte identical to what was encoded: ${
    decoded !== null && decoded.every((b, i) => b === pixels[i])
  }`,
);

const corrupted = Uint8Array.from(packet);
corrupted[5] ^= 0xff;
console.log(`a single flipped bit is rejected: ${parsePacket(corrupted) === null}`);

// ---------------------------------------------------------------------------
// Temporal dither: a level 8 bits cannot hold, averaged across frames.
// ---------------------------------------------------------------------------
rule("Temporal dither over 10 frames (a half-code target)");
const faint = createLinearFrame(prototype);
addLight(faint, 0, [0.5 / 255, 0, 0]);
const faintDither = createDitherState(prototype);
const series = Array.from(
  { length: 10 },
  () => encodeFrame(faint, { ...prototype, gamma: 1, minLitLevel: 0 }, faintDither)[1],
);
console.log(`red byte per frame: ${series.join(" ")}`);
console.log(
  `mean: ${(series.reduce((a, b) => a + b, 0) / series.length).toFixed(2)} (a static 8-bit value could only be 0 or 1)`,
);

// ---------------------------------------------------------------------------
// Link budget for the real installation.
// ---------------------------------------------------------------------------
rule("Link budget");
for (const [label, options] of [
  ["prototype: 120 px RGB", prototype],
  ['55" edge: 230 px RGB', { ...prototype, pixelCount: 230, order: "GRB" as const }],
  ['55" edge: 230 px RGBW', { ...prototype, pixelCount: 230, order: "GRBW" as const }],
  ["dense: 550 px RGBW", { ...prototype, pixelCount: 550, order: "GRBW" as const }],
] satisfies [string, FrameOptions][]) {
  const budget = wireBudget(options, 60);
  const link =
    budget.bitsPerSecond < 115_200
      ? "fits 115200 UART"
      : budget.bitsPerSecond < 921_600
        ? "needs 921600 UART or native USB"
        : "native USB only";
  console.log(
    `${label.padEnd(24)} ${String(budget.packetBytes).padStart(5)} B/frame  ` +
      `${String(Math.round(budget.bytesPerSecond / 1024)).padStart(4)} KiB/s  ` +
      `${String(Math.round(budget.bitsPerSecond / 1000)).padStart(5)} kbps  ` +
      link,
  );
}

// ---------------------------------------------------------------------------
// Sixty frames through a null sink, as the exhibit would run.
// ---------------------------------------------------------------------------
rule("One second at 60 fps through a NullSink");
const sink = new NullSink();
const runDither = createDitherState(prototype);
for (let f = 0; f < 60; f += 1) sink.write(framePacket(encodeFrame(frame, prototype, runDither)));
console.log({ frames: sink.frames, bytes: sink.bytes, sink: sink.name });

const capture = new CapturingSink();
capture.write(framePacket(pixels));
console.log(
  `\nSwapping the sink changes nothing upstream — captured ${capture.packets.length} packet from the same pipeline.`,
);
console.log(
  "On the installation this is a SerialSink writing to the controller's USB CDC endpoint.\n",
);
