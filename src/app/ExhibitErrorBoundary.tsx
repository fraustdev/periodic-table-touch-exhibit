import { Component, type ErrorInfo, type ReactNode } from "react";

type Props = { children: ReactNode };
type State = { error: Error | null };

/**
 * An exhibit must never show a visitor a blank page or a browser error. Any
 * unhandled failure — including a wasm fault escaping the hand driver —
 * resolves to a museum-styled card instead of an empty screen.
 */
export class ExhibitErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("Exhibit error boundary caught:", error, info.componentStack);
  }

  render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <main aria-label="Exhibit notice" className="stage">
        <div className="atmosphere" aria-hidden="true" />
        <div />
        <div className="label__attract">
          <p className="eyebrow">Station 01</p>
          <h1>This exhibit is taking a short break</h1>
          <p style={{ margin: 0, color: "var(--bone-400)", fontSize: "1rem" }}>
            Please ask a member of staff, or try again in a moment.
          </p>
          <div>
            <button
              className="button button--primary"
              onClick={() => window.location.reload()}
              style={{ marginTop: "1rem" }}
            >
              Restart exhibit
            </button>
          </div>
          <p className="eyebrow" style={{ marginTop: "2rem", maxWidth: "60ch" }}>
            {error.message}
          </p>
        </div>
        <div />
      </main>
    );
  }
}
