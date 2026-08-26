import { createRoot } from "react-dom/client";
import { App } from "./app/App";
import { ExhibitErrorBoundary } from "./app/ExhibitErrorBoundary";
import "./styles/global.css";

createRoot(document.getElementById("root")!).render(
  <ExhibitErrorBoundary>
    <App />
  </ExhibitErrorBoundary>,
);
