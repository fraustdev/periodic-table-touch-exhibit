import { describe, expect, it } from "vitest";
import {
  applyHomography,
  createCalibration,
  isCalibrationValid,
  solveHomography,
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
