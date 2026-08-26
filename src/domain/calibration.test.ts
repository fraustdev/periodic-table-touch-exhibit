import { describe, expect, it } from "vitest";
import {
  applyHomography,
  createCalibration,
  createDefaultCalibration,
  defaultRegionPoints,
  isCalibrationValid,
  solveHomography,
  validateCapturedQuad,
} from "./calibration";

const UNIT_CORNERS = [
  { x: 0, y: 0 },
  { x: 1, y: 0 },
  { x: 1, y: 1 },
  { x: 0, y: 1 },
];

const META = {
  cameraLabel: "FaceTime HD",
  viewport: { width: 1440, height: 800 },
  capturedAt: 0,
};

describe("four-point calibration", () => {
  it("maps a scaled, offset camera rectangle onto the unit square", () => {
    // The visitor traced a box occupying the middle of the camera frame.
    const captured = [
      { x: 0.2, y: 0.1 },
      { x: 0.8, y: 0.1 },
      { x: 0.8, y: 0.9 },
      { x: 0.2, y: 0.9 },
    ];
    const matrix = solveHomography(captured, UNIT_CORNERS);
    expect(matrix).not.toBeNull();

    captured.forEach((point, index) => {
      const mapped = applyHomography(matrix!, point)!;
      expect(mapped.x).toBeCloseTo(UNIT_CORNERS[index].x, 6);
      expect(mapped.y).toBeCloseTo(UNIT_CORNERS[index].y, 6);
    });

    const center = applyHomography(matrix!, { x: 0.5, y: 0.5 })!;
    expect(center.x).toBeCloseTo(0.5, 6);
    expect(center.y).toBeCloseTo(0.5, 6);
  });

  it("corrects a keystoned capture, which an affine transform cannot", () => {
    // Camera off to one side: the far edge of the table appears shorter.
    const keystoned = [
      { x: 0.25, y: 0.2 },
      { x: 0.75, y: 0.3 },
      { x: 0.8, y: 0.8 },
      { x: 0.2, y: 0.7 },
    ];
    const matrix = solveHomography(keystoned, UNIT_CORNERS)!;
    keystoned.forEach((point, index) => {
      const mapped = applyHomography(matrix, point)!;
      expect(mapped.x).toBeCloseTo(UNIT_CORNERS[index].x, 6);
      expect(mapped.y).toBeCloseTo(UNIT_CORNERS[index].y, 6);
    });
  });

  it("refuses a degenerate capture instead of producing garbage", () => {
    const collapsed = [
      { x: 0.5, y: 0.5 },
      { x: 0.5, y: 0.5 },
      { x: 0.5, y: 0.5 },
      { x: 0.5, y: 0.5 },
    ];
    expect(solveHomography(collapsed, UNIT_CORNERS)).toBeNull();
    expect(createCalibration(collapsed, META)).toBeNull();
    expect(solveHomography([{ x: 0, y: 0 }], UNIT_CORNERS)).toBeNull();
  });

  it("invalidates calibration when the camera or the table geometry changes", () => {
    const calibration = createCalibration(UNIT_CORNERS, META)!;
    expect(isCalibrationValid(calibration, META)).toBe(true);
    expect(isCalibrationValid(calibration, { ...META, cameraLabel: "Logitech C920" })).toBe(false);
    expect(
      isCalibrationValid(calibration, { ...META, viewport: { width: 1024, height: 800 } }),
    ).toBe(false);
    expect(isCalibrationValid(null, META)).toBe(false);
  });
});

describe("default mapping", () => {
  it("maps the central camera region onto the whole table", () => {
    const calibration = createDefaultCalibration();
    const centre = applyHomography(calibration.matrix, { x: 0.5, y: 0.5 })!;
    expect(centre.x).toBeCloseTo(0.5, 6);
    expect(centre.y).toBeCloseTo(0.5, 6);

    const [topLeft] = defaultRegionPoints();
    const mapped = applyHomography(calibration.matrix, topLeft)!;
    expect(mapped.x).toBeCloseTo(0, 6);
    expect(mapped.y).toBeCloseTo(0, 6);
  });

  it("leaves headroom outside the region so edges stay reachable", () => {
    const calibration = createDefaultCalibration();
    // Just outside the region maps beyond the table, which the hit test rejects
    // rather than clamping a finger onto the wrong edge cell.
    const past = applyHomography(calibration.matrix, { x: 0.02, y: 0.5 })!;
    expect(past.x).toBeLessThan(0);
  });

  it("survives a camera swap and a resized table", () => {
    const calibration = createDefaultCalibration();
    expect(
      isCalibrationValid(calibration, {
        cameraLabel: "Some Other Camera",
        viewport: { width: 640, height: 480 },
      }),
    ).toBe(true);
  });
});

describe("captured quadrilateral validation", () => {
  const good = [
    { x: 0.2, y: 0.2 },
    { x: 0.8, y: 0.2 },
    { x: 0.8, y: 0.8 },
    { x: 0.2, y: 0.8 },
  ];

  it("accepts a sane capture", () => {
    expect(validateCapturedQuad(good).ok).toBe(true);
  });

  it("accepts a keystoned but still convex capture", () => {
    expect(
      validateCapturedQuad([
        { x: 0.25, y: 0.2 },
        { x: 0.75, y: 0.3 },
        { x: 0.8, y: 0.8 },
        { x: 0.2, y: 0.7 },
      ]).ok,
    ).toBe(true);
  });

  it("rejects a capture covering too little of the frame", () => {
    const tiny = validateCapturedQuad([
      { x: 0.5, y: 0.5 },
      { x: 0.56, y: 0.5 },
      { x: 0.56, y: 0.56 },
      { x: 0.5, y: 0.56 },
    ]);
    expect(tiny.ok).toBe(false);
    if (!tiny.ok) expect(tiny.reason).toMatch(/too little/i);
  });

  it("rejects a bowtie, which still solves to a transform", () => {
    // Bottom two swapped: solveHomography accepts this and maps to nonsense.
    const crossed = [
      { x: 0.2, y: 0.2 },
      { x: 0.8, y: 0.2 },
      { x: 0.2, y: 0.8 },
      { x: 0.8, y: 0.8 },
    ];
    expect(solveHomography(crossed, good)).not.toBeNull();
    expect(validateCapturedQuad(crossed).ok).toBe(false);
    expect(
      createCalibration(crossed, {
        cameraLabel: "c",
        viewport: { width: 1, height: 1 },
        capturedAt: 0,
      }),
    ).toBeNull();
  });

  it("rejects points captured in mirrored or inverted order", () => {
    const leftRightSwapped = [
      { x: 0.8, y: 0.2 },
      { x: 0.2, y: 0.2 },
      { x: 0.2, y: 0.8 },
      { x: 0.8, y: 0.8 },
    ];
    const check = validateCapturedQuad(leftRightSwapped);
    expect(check.ok).toBe(false);
    if (!check.ok) expect(check.reason).toMatch(/right|order/i);

    const topBottomSwapped = [
      { x: 0.2, y: 0.8 },
      { x: 0.8, y: 0.8 },
      { x: 0.8, y: 0.2 },
      { x: 0.2, y: 0.2 },
    ];
    expect(validateCapturedQuad(topBottomSwapped).ok).toBe(false);
  });

  it("rejects the wrong number of points", () => {
    expect(validateCapturedQuad(good.slice(0, 3)).ok).toBe(false);
  });
});
