import { elements, getElement } from "../data/elements";
import type { GridPosition, Point } from "./types";

export const TABLE_COLUMNS = 18;

/**
 * Row weights for the rendered table: seven main periods, a narrow spacer, then
 * the two f-block rows. The renderer and the hit test read the same numbers, so
 * a pointer can never disagree with what the visitor sees.
 */
export const ROW_WEIGHTS = [1, 1, 1, 1, 1, 1, 1, 0.45, 1, 1] as const;
export const SPACER_ROW_INDEX = 7; // zero-based index of the gap between blocks

const TOTAL_WEIGHT = ROW_WEIGHTS.reduce((sum, weight) => sum + weight, 0);

/** Cumulative normalized y boundaries, one per row band. */
const ROW_BOUNDS = ROW_WEIGHTS.reduce<{ start: number; end: number }[]>((bands, weight) => {
  const start = bands.length === 0 ? 0 : bands[bands.length - 1].end;
  bands.push({ start, end: start + weight / TOTAL_WEIGHT });
  return bands;
}, []);

/** Maps a logical grid row (1-7 main, 8-9 f-block) to its CSS grid line. */
export function toCssRow(gridRow: number): number {
  return gridRow >= 8 ? gridRow + 1 : gridRow;
}

const byPosition = new Map<string, number>(
  elements.map((element) => [`${element.gridRow}:${element.gridColumn}`, element.atomicNumber]),
);

export function getElementPosition(atomicNumber: number): GridPosition {
  const element = getElement(atomicNumber);
  if (!element) throw new Error(`Unknown atomic number: ${atomicNumber}`);
  return { row: element.gridRow, column: element.gridColumn };
}

export function getElementAt(position: GridPosition): number | null {
  return byPosition.get(`${position.row}:${position.column}`) ?? null;
}

/** Resolves a normalized table-space point to an atomic number, or null. */
export function hitTestElement(point: Point): number | null {
  const { x, y } = point;
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  if (x < 0 || x >= 1 || y < 0 || y >= 1) return null;

  const bandIndex = ROW_BOUNDS.findIndex((band) => y >= band.start && y < band.end);
  if (bandIndex === -1 || bandIndex === SPACER_ROW_INDEX) return null;

  const column = Math.floor(x * TABLE_COLUMNS) + 1;
  const row = bandIndex >= SPACER_ROW_INDEX ? bandIndex : bandIndex + 1;
  return getElementAt({ row, column });
}

/** Normalized center of a cell — used to originate the light pulse. */
export function getCellCenter(atomicNumber: number): Point {
  const { row, column } = getElementPosition(atomicNumber);
  const bandIndex = row >= 8 ? row : row - 1;
  const band = ROW_BOUNDS[bandIndex];
  return {
    x: (column - 0.5) / TABLE_COLUMNS,
    y: (band.start + band.end) / 2,
  };
}
