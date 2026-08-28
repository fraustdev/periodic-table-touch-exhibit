/**
 * The output path for the physical LED strip.
 *
 * Effects composite in **linear light** as floats, because adding two light
 * sources is addition in linear space and nothing else. Everything after that
 * is about getting those floats onto a wire without lying about what the strip
 * will actually emit:
 *
 *   linear float → governor → gamma encode → dither to 8-bit → channel order
 *                → COBS frame + CRC16 → sink
 *
 * Written against a sink interface with a null implementation, so the whole
 * pipeline is exercised and tested before any hardware exists. Swapping in a
 * serial port is one class.
 */

type ChannelOrder = "GRB" | "GRBW" | "RGB" | "RGBW";

/** Channels per pixel, by strip type. WS2812 is 3, SK6812 RGBW is 4. */
export function channelCount(order: ChannelOrder): number {
  return order.length;
}

export type FrameOptions = {
  pixelCount: number;
  /**
   * Byte order the strip expects. **WS2812-class strips are GRB, not RGB** —
   * getting this wrong swaps red and green and is the single most common
   * first-run mistake.
   */
  order: ChannelOrder;
  /**
   * Encoding exponent. 8-bit linear wastes codes at the dark end where vision
   * is most sensitive, so bytes are gamma-encoded and **the controller is
   * expected to apply the inverse LUT** to recover linear PWM duty. If the
   * controller cannot, set this to 1 and accept the banding.
   */
  gamma: number;
  /** Hard ceiling on any channel, 0..1. The power budget lives here. */
  maxLevel: number;
  /**
   * Floor applied to a pixel that any effect has lit at all. A surround that
   * reads as fully dark gets reported as a broken exhibit.
   */
  minLitLevel: number;
};

export const DEFAULT_FRAME_OPTIONS: FrameOptions = {
  pixelCount: 120,
  order: "GRB",
  gamma: 2.8,
  maxLevel: 0.75,
  minLitLevel: 0.02,
};

/** Per-channel carry, so quantization error is spread across frames. */
type DitherState = Float32Array;

export function createDitherState(options: FrameOptions): DitherState {
  return new Float32Array(options.pixelCount * channelCount(options.order));
}

/**
 * Linear-light values, `channelCount` floats per pixel, in RGB(W) order
 * regardless of what the strip wants. Reordering happens on the way out.
 */
type LinearFrame = Float32Array;

export function createLinearFrame(options: FrameOptions): LinearFrame {
  return new Float32Array(options.pixelCount * channelCount(options.order));
}

/**
 * Clamps every channel into the power and visibility budget.
 *
 * Deliberately not exported for effects to call: it runs inside `encodeFrame`
 * so an effect author cannot obtain a sink and bypass it. Composite brightness
 * across a whole strip is a safety property, not a styling choice.
 */
function govern(value: number, options: FrameOptions): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  const ceiled = Math.min(value, options.maxLevel);
  return Math.max(ceiled, options.minLitLevel);
}

/**
 * Additive clipping, the way LEDs actually clip: hard, per channel, at full
 * scale — including the hue shift that produces. CSS `screen` blending is far
 * more forgiving and will let you ship effects that turn to white mush on the
 * real fixture.
 */
export function addLight(frame: LinearFrame, index: number, channels: readonly number[]): void {
  for (let c = 0; c < channels.length; c += 1) {
    const at = index * channels.length + c;
    if (at >= frame.length) return;
    frame[at] = Math.min(1, frame[at] + channels[c]);
  }
}

/** RGB(W) source index for each position of a given strip order. */
function reorderMap(order: ChannelOrder): number[] {
  const source = { R: 0, G: 1, B: 2, W: 3 } as const;
  return [...order].map((letter) => source[letter as keyof typeof source]);
}

/**
 * Linear floats to strip bytes. Mutates `dither` — the carried error is what
 * makes a slow fade look smooth instead of stepping, and it only works if the
 * same state is threaded through consecutive frames.
 */
export function encodeFrame(
  linear: LinearFrame,
  options: FrameOptions,
  dither: DitherState,
): Uint8Array {
  const channels = channelCount(options.order);
  const map = reorderMap(options.order);
  const out = new Uint8Array(options.pixelCount * channels);

  for (let pixel = 0; pixel < options.pixelCount; pixel += 1) {
    for (let slot = 0; slot < channels; slot += 1) {
      const sourceChannel = map[slot];
      const at = pixel * channels + sourceChannel;
      const governed = govern(linear[at] ?? 0, options);
      const encoded = Math.pow(governed, 1 / options.gamma) * 255;

      // Error diffusion: add what the last frame could not represent.
      const target = encoded + dither[at];
      const quantized = Math.max(0, Math.min(255, Math.round(target)));
      dither[at] = target - quantized;

      out[pixel * channels + slot] = quantized;
    }
  }
  return out;
}

/** CRC16-CCITT (XMODEM): polynomial 0x1021, initial value 0x0000. */
export function crc16(bytes: Uint8Array): number {
  let crc = 0;
  for (const byte of bytes) {
    crc ^= byte << 8;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc & 0xffff;
}

/**
 * Consistent Overhead Byte Stuffing. Removes every zero byte from the payload
 * so that a single zero can delimit frames unambiguously — which means a
 * controller that joins mid-stream resynchronises at the next delimiter instead
 * of rendering garbage.
 */
export function cobsEncode(input: Uint8Array): Uint8Array {
  const out: number[] = [0];
  let codeIndex = 0;
  let code = 1;

  for (const byte of input) {
    if (byte === 0) {
      out[codeIndex] = code;
      codeIndex = out.length;
      out.push(0);
      code = 1;
    } else {
      out.push(byte);
      code += 1;
      if (code === 0xff) {
        out[codeIndex] = code;
        codeIndex = out.length;
        out.push(0);
        code = 1;
      }
    }
  }
  out[codeIndex] = code;
  return Uint8Array.from(out);
}

export function cobsDecode(input: Uint8Array): Uint8Array {
  const out: number[] = [];
  let at = 0;
  while (at < input.length) {
    const code = input[at];
    if (code === 0) break;
    at += 1;
    for (let i = 1; i < code && at < input.length; i += 1) {
      out.push(input[at]);
      at += 1;
    }
    if (code !== 0xff && at < input.length) out.push(0);
  }
  return Uint8Array.from(out);
}

/**
 * One wire packet: COBS-encoded payload plus CRC, terminated by a zero.
 * The CRC is inside the COBS envelope so a corrupted length byte cannot make a
 * frame validate.
 */
export function framePacket(pixels: Uint8Array): Uint8Array {
  const crc = crc16(pixels);
  const withCrc = new Uint8Array(pixels.length + 2);
  withCrc.set(pixels, 0);
  withCrc[pixels.length] = (crc >> 8) & 0xff;
  withCrc[pixels.length + 1] = crc & 0xff;

  const encoded = cobsEncode(withCrc);
  const packet = new Uint8Array(encoded.length + 1);
  packet.set(encoded, 0);
  packet[encoded.length] = 0; // delimiter
  return packet;
}

/** Validates and unwraps a packet, or returns null. */
export function parsePacket(packet: Uint8Array): Uint8Array | null {
  const end = packet.indexOf(0);
  const body = cobsDecode(end === -1 ? packet : packet.subarray(0, end));
  if (body.length < 3) return null;

  const pixels = body.subarray(0, body.length - 2);
  const expected = (body[body.length - 2] << 8) | body[body.length - 1];
  return crc16(pixels) === expected ? pixels : null;
}

/**
 * Where bytes go. The preview renderer, a null sink, and an eventual serial
 * port all implement this; nothing upstream knows which is attached.
 */
interface PixelSink {
  readonly name: string;
  write(packet: Uint8Array): void;
}

/** Discards everything. What the pipeline is developed against. */
export class NullSink implements PixelSink {
  readonly name = "null";
  frames = 0;
  bytes = 0;

  write(packet: Uint8Array): void {
    this.frames += 1;
    this.bytes += packet.length;
  }
}

/** Retains packets so a test or a demo can inspect the actual wire bytes. */
export class CapturingSink implements PixelSink {
  readonly name = "capture";
  readonly packets: Uint8Array[] = [];

  write(packet: Uint8Array): void {
    this.packets.push(packet);
  }
}

/** Sustained wire cost, for checking a serial link can carry the frame rate. */
export function wireBudget(options: FrameOptions, fps: number) {
  const payload = options.pixelCount * channelCount(options.order);
  const packet = framePacket(new Uint8Array(payload)).length;
  const bytesPerSecond = packet * fps;
  return {
    payloadBytes: payload,
    packetBytes: packet,
    bytesPerSecond,
    // 8N1 framing: 10 bits on the wire per byte.
    bitsPerSecond: bytesPerSecond * 10,
  };
}
