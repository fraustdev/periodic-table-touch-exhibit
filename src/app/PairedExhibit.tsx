import { TableDisplay } from "../ui/table/TableDisplay";
import { InfoDisplay } from "../ui/info/InfoDisplay";

/**
 * Both displays in one window, for a single-screen visitor — a laptop, or the
 * public URL. It is a layout, not a third display: each half still mounts the
 * real component and they still speak only over the event bus, because
 * `useExhibitEventBus` gives each one its own. A BroadcastChannel delivers to
 * sibling channels in the same document, so the transport seam is exercised
 * here exactly as it is across two monitors — the panels share no React state.
 */
export function PairedExhibit() {
  return (
    <div className="pair">
      <div className="pair__panel pair__panel--table">
        <TableDisplay landmark="section" />
      </div>
      <div className="pair__seam" aria-hidden="true" />
      <div className="pair__panel pair__panel--info">
        <InfoDisplay landmark="section" />
      </div>
    </div>
  );
}
