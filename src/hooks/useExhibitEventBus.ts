import { useEffect, useMemo, useRef } from "react";
import { BrowserEventBus } from "../adapters/BrowserEventBus";
import type { ExhibitEvent } from "../domain/types";

/**
 * One bus per window. The listener is held in a ref so a re-render never
 * resubscribes and drops an event mid-flight.
 */
export function useExhibitEventBus(
  onEvent: (event: ExhibitEvent, bus: BrowserEventBus) => void,
): BrowserEventBus {
  const bus = useMemo(() => new BrowserEventBus(), []);
  const handler = useRef(onEvent);
  handler.current = onEvent;

  useEffect(() => {
    const unsubscribe = bus.subscribe((event) => handler.current(event, bus));
    return () => {
      unsubscribe();
      bus.close();
    };
  }, [bus]);

  return bus;
}
