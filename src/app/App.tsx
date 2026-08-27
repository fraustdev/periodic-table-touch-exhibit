import { TableDisplay } from "../ui/table/TableDisplay";
import { InfoDisplay } from "../ui/info/InfoDisplay";
import { PairedExhibit } from "./PairedExhibit";

type AppProps = { path?: string };

/**
 * Route selection is the composition boundary. `/table` and `/info` mount
 * exactly one display each, which is the installation. `/exhibit` mounts both
 * side by side for a single screen. In every case the displays never share
 * React state — only validated events on the bus.
 */
export function App({ path = window.location.pathname }: AppProps) {
  if (path.startsWith("/info")) return <InfoDisplay />;
  if (path.startsWith("/exhibit")) return <PairedExhibit />;
  return <TableDisplay />;
}
