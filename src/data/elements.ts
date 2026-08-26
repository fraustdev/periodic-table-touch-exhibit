import raw from "./elements.json";
import type { ElementRecord } from "../domain/types";

export const elements = raw as ElementRecord[];

const byAtomicNumber = new Map<number, ElementRecord>(
  elements.map((element) => [element.atomicNumber, element]),
);

export function getElement(atomicNumber: number): ElementRecord | undefined {
  return byAtomicNumber.get(atomicNumber);
}

export function isValidAtomicNumber(value: unknown): value is number {
  return Number.isInteger(value) && byAtomicNumber.has(value as number);
}
