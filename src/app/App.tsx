import { TableDisplay } from "../ui/table/TableDisplay";
import { InfoDisplay } from "../ui/info/InfoDisplay";

type AppProps = { path?: string };

/**
 * Route selection is the composition boundary: each window mounts exactly one
 * display, so the table and the info panel never share React state — only
 * validated events on the bus.
 */
export function App({ path = window.location.pathname }: AppProps) {
  if (path.startsWith("/info")) return <InfoDisplay />;
  return <TableDisplay />;
}
