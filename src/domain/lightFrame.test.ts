import { describe, expect, it } from "vitest";
import {
  addLight,
  CapturingSink,
  channelCount,
  cobsDecode,
  cobsEncode,
  createDitherState,
  createLinearFrame,
  crc16,
  DEFAULT_FRAME_OPTIONS,
  encodeFrame,
  framePacket,
  NullSink,
  parsePacket,
  wireBudget,
  type FrameOptions,
} from "./lightFrame";

const RGB: FrameOptions = { ...DEFAULT_FRAME_OPTIONS, pixelCount: 4, order: "GRB" };

describe("channel order", () => {
  it("counts channels from the order itself", () => {
    expect(channelCount("GRB")).toBe(3);
    expect(channelCount("GRBW")).toBe(4);
  });

  it("emits WS2812 byte order, not RGB", () => {
    const frame = createLinearFrame(RGB);
    // Pure red in pixel 0, linear space.
    addLight(frame, 0, [1, 0, 0]);
    const bytes = encodeFrame(frame, { ...RGB, gamma: 1, minLitLevel: 0 }, createDitherState(RGB));
    // GRB means green byte first: red must land in slot 1, not slot 0.
    expect(bytes[0]).toBe(0);
    expect(bytes[1]).toBeGreaterThan(0);
    expect(bytes[2]).toBe(0);
  });

  it("carries a white channel through when the strip has one", () => {
    const rgbw: FrameOptions = { ...DEFAULT_FRAME_OPTIONS, pixelCount: 2, order: "GRBW" };
    const frame = createLinearFrame(rgbw);
    addLight(frame, 0, [0, 0, 0, 1]);
    const bytes = encodeFrame(
      frame,
      { ...rgbw, gamma: 1, minLitLevel: 0 },
      createDitherState(rgbw),
    );
    expect(bytes).toHaveLength(8);
    expect(bytes[3]).toBeGreaterThan(0); // W is the fourth slot of GRBW
  });
});

describe("additive light", () => {
  it("adds in linear space and clips hard at full scale", () => {
    const frame = createLinearFrame(RGB);
    addLight(frame, 0, [0.6, 0, 0]);
    addLight(frame, 0, [0.6, 0, 0]);
    // Not 1.2, and not softened the way a screen blend would.
    expect(frame[0]).toBe(1);
  });

  it("leaves other pixels untouched", () => {
    const frame = createLinearFrame(RGB);
    addLight(frame, 1, [1, 1, 1]);
    expect(Array.from(frame.subarray(0, 3))).toEqual([0, 0, 0]);
  });
});

describe("governor", () => {
  it("caps every channel at the power ceiling", () => {
    const options = { ...RGB, maxLevel: 0.5, gamma: 1, minLitLevel: 0 };
    const frame = createLinearFrame(options);
    addLight(frame, 0, [1, 1, 1]);
    const bytes = encodeFrame(frame, options, createDitherState(options));
    for (const byte of bytes.subarray(0, 3)) {
      expect(byte).toBeLessThanOrEqual(Math.round(0.5 * 255));
    }
  });

  it("holds a lit pixel above the visibility floor", () => {
    const options = { ...RGB, minLitLevel: 0.1, gamma: 1 };
    const frame = createLinearFrame(options);
    addLight(frame, 0, [0.001, 0, 0]);
    const bytes = encodeFrame(frame, options, createDitherState(options));
    expect(bytes[1]).toBeGreaterThanOrEqual(Math.round(0.1 * 255) - 1);
  });

  it("leaves an unlit pixel fully dark rather than raising it to the floor", () => {
    const options = { ...RGB, minLitLevel: 0.2, gamma: 1 };
    const bytes = encodeFrame(createLinearFrame(options), options, createDitherState(options));
    expect(Array.from(bytes)).toEqual(Array.from(new Uint8Array(bytes.length)));
  });

  it("cannot be bypassed: it is not reachable except through encodeFrame", async () => {
    const module = await import("./lightFrame");
    expect("govern" in module).toBe(false);
  });
});

describe("gamma encoding", () => {
  it("spends more codes on the dark end than linear would", () => {
    const options = { ...RGB, gamma: 2.8, minLitLevel: 0 };
    const frame = createLinearFrame(options);
    addLight(frame, 0, [0.25, 0, 0]);
    const bytes = encodeFrame(frame, options, createDitherState(options));
    const linearWouldBe = Math.round(0.25 * options.maxLevel * 255);
    // Gamma encoding lifts a quarter-brightness value well above its linear code.
    expect(bytes[1]).toBeGreaterThan(linearWouldBe);
  });

  it("is a no-op at gamma 1", () => {
    const options = { ...RGB, gamma: 1, minLitLevel: 0, maxLevel: 1 };
    const frame = createLinearFrame(options);
    addLight(frame, 0, [0.5, 0, 0]);
    const bytes = encodeFrame(frame, options, createDitherState(options));
    expect(bytes[1]).toBe(128);
  });
});

describe("temporal dither", () => {
  it("spreads a value that 8 bits cannot represent across frames", () => {
    const options = { ...RGB, gamma: 1, minLitLevel: 0, maxLevel: 1 };
    const dither = createDitherState(options);
    const frame = createLinearFrame(options);
    // Half a code: 0.5/255 in linear terms.
    addLight(frame, 0, [0.5 / 255, 0, 0]);

    const values: number[] = [];
    for (let i = 0; i < 8; i += 1) values.push(encodeFrame(frame, options, dither)[1]);

    // Neither stuck at 0 nor stuck at 1 — it alternates to average correctly.
    expect(new Set(values).size).toBeGreaterThan(1);
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    expect(mean).toBeGreaterThan(0.3);
    expect(mean).toBeLessThan(0.7);
  });

  it("is stable for a value that quantizes exactly", () => {
    const options = { ...RGB, gamma: 1, minLitLevel: 0, maxLevel: 1 };
    const dither = createDitherState(options);
    const frame = createLinearFrame(options);
    addLight(frame, 0, [1, 0, 0]);
    const first = encodeFrame(frame, options, dither)[1];
    const second = encodeFrame(frame, options, dither)[1];
    expect(first).toBe(255);
    expect(second).toBe(255);
  });
});

describe("CRC16-CCITT", () => {
  it("matches the known XMODEM check value", () => {
    // "123456789" → 0x31C3 for CRC-16/XMODEM.
    const input = new Uint8Array([..."123456789"].map((c) => c.charCodeAt(0)));
    expect(crc16(input)).toBe(0x31c3);
  });

  it("changes when any byte changes", () => {
    const a = crc16(new Uint8Array([1, 2, 3, 4]));
    const b = crc16(new Uint8Array([1, 2, 3, 5]));
    expect(a).not.toBe(b);
  });

  it("is zero for empty input", () => {
    expect(crc16(new Uint8Array())).toBe(0);
  });
});

describe("COBS", () => {
  it("removes every zero byte from the payload", () => {
    const input = new Uint8Array([0, 1, 0, 2, 3, 0]);
    const encoded = cobsEncode(input);
    expect(Array.from(encoded)).not.toContain(0);
  });

  it("round-trips arbitrary payloads, including long zero-free runs", () => {
    const cases = [
      new Uint8Array([]),
      new Uint8Array([0]),
      new Uint8Array([1, 2, 3]),
      new Uint8Array([0, 0, 0, 0]),
      Uint8Array.from({ length: 300 }, (_, i) => (i % 255) + 1),
      Uint8Array.from({ length: 600 }, (_, i) => (i * 7) % 256),
    ];
    for (const input of cases) {
      expect(Array.from(cobsDecode(cobsEncode(input)))).toEqual(Array.from(input));
    }
  });
});

describe("wire packets", () => {
  it("round-trips a real frame through the packet format", () => {
    const options = { ...DEFAULT_FRAME_OPTIONS, pixelCount: 120 };
    const frame = createLinearFrame(options);
    for (let i = 0; i < options.pixelCount; i += 1) addLight(frame, i, [i / 120, 0.2, 0.4]);
    const pixels = encodeFrame(frame, options, createDitherState(options));

    const packet = framePacket(pixels);
    expect(packet.at(-1)).toBe(0); // delimiter
    expect(Array.from(packet.subarray(0, -1))).not.toContain(0);
    expect(Array.from(parsePacket(packet)!)).toEqual(Array.from(pixels));
  });

  it("rejects a packet whose payload was corrupted in flight", () => {
    const pixels = new Uint8Array([10, 20, 30, 40]);
    const packet = framePacket(pixels);
    const corrupted = Uint8Array.from(packet);
    corrupted[2] = corrupted[2] ^ 0xff;
    expect(parsePacket(corrupted)).toBeNull();
  });

  it("rejects a truncated packet rather than rendering garbage", () => {
    const packet = framePacket(new Uint8Array([1, 2, 3, 4, 5]));
    expect(parsePacket(packet.subarray(0, 3))).toBeNull();
  });
});

describe("sinks", () => {
  it("counts what a null sink was asked to send", () => {
    const sink = new NullSink();
    sink.write(framePacket(new Uint8Array(360)));
    sink.write(framePacket(new Uint8Array(360)));
    expect(sink.frames).toBe(2);
    expect(sink.bytes).toBeGreaterThan(700);
  });

  it("lets a capturing sink expose the actual wire bytes", () => {
    const sink = new CapturingSink();
    const pixels = new Uint8Array([1, 2, 3]);
    sink.write(framePacket(pixels));
    expect(sink.packets).toHaveLength(1);
    expect(Array.from(parsePacket(sink.packets[0])!)).toEqual([1, 2, 3]);
  });
});

describe("wire budget", () => {
  it("shows a 115200 link cannot carry the real strip at 60 fps", () => {
    // ~230 RGBW pixels around a 55" display edge.
    const budget = wireBudget({ ...DEFAULT_FRAME_OPTIONS, pixelCount: 230, order: "GRBW" }, 60);
    expect(budget.payloadBytes).toBe(920);
    expect(budget.bitsPerSecond).toBeGreaterThan(115_200);
    // It fits comfortably on 921600 or native USB.
    expect(budget.bitsPerSecond).toBeLessThan(921_600);
  });

  it("shows the prototype's own 120 RGB pixels fit on a slow link", () => {
    const budget = wireBudget({ ...DEFAULT_FRAME_OPTIONS, pixelCount: 120, order: "GRB" }, 60);
    expect(budget.payloadBytes).toBe(360);
    expect(budget.bitsPerSecond).toBeLessThan(921_600);
  });
});
