import { act, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { InfoDisplay } from "./InfoDisplay";
import { BrowserEventBus } from "../../adapters/BrowserEventBus";
import { EXHIBIT_CONFIG } from "../../domain/config";

/**
 * Publishes on the real channel name so the component's own bus receives it.
 * BroadcastChannel delivery is queued as a task, so the queue must be flushed
 * inside act() before assertions run.
 */
async function publish(event: Record<string, unknown>) {
  const sender = new BrowserEventBus(EXHIBIT_CONFIG.channelName);
  await act(async () => {
    sender.publish(event as never);
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  sender.close();
}

function publishSelection(atomicNumber: number) {
  return publish({ type: "elementSelected", atomicNumber, timestamp: 1 });
}

describe("InfoDisplay", () => {
  it("starts in the attract state", () => {
    render(<InfoDisplay />);
    expect(screen.getByRole("main", { name: /element information display/i })).toBeInTheDocument();
    expect(screen.getByText(/choose an element at the table/i)).toBeInTheDocument();
  });

  it("renders the selected element after a broadcast selection", async () => {
    render(<InfoDisplay />);
    await publishSelection(79);

    expect(screen.getByText("Au")).toBeInTheDocument();
    expect(screen.getByText("Gold")).toBeInTheDocument();
    expect(screen.getByText(/transition metal/i)).toBeInTheDocument();
    expect(screen.getByText(/never tarnishes/i)).toBeInTheDocument();
    expect(screen.getByText(/neutron-star collision/i)).toBeInTheDocument();
    expect(screen.queryByText(/choose an element at the table/i)).not.toBeInTheDocument();
  });

  it("replaces the previous element on the next selection", async () => {
    render(<InfoDisplay />);
    await publishSelection(79);
    await publishSelection(2);

    expect(screen.getByText("Helium")).toBeInTheDocument();
    expect(screen.queryByText("Gold")).not.toBeInTheDocument();
    // Helium's own blurb also says "noble gas", so assert on the category chip.
    expect(document.querySelector(".chip")!.textContent).toMatch(/noble gas/i);
  });

  it("asks for the current selection when it opens", async () => {
    // A display that reloads mid-session must not sit in attract state until
    // the next visitor touch.
    const seen: unknown[] = [];
    const listener = new BrowserEventBus(EXHIBIT_CONFIG.channelName);
    listener.subscribe((event) => seen.push(event));

    await act(async () => {
      render(<InfoDisplay />);
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(seen).toContainEqual({ type: "requestState" });
    listener.close();
  });

  it("renders the selection it receives in reply to that request", async () => {
    render(<InfoDisplay />);
    // The table answers a request by re-announcing what is selected.
    await publish({ type: "elementSelected", atomicNumber: 26, timestamp: 5 });
    expect(screen.getByText("Iron")).toBeInTheDocument();
  });

  it("ignores malformed cross-window messages", async () => {
    render(<InfoDisplay />);
    await publishSelection(6);
    await publish({ type: "elementSelected", atomicNumber: 999, timestamp: 1 });

    expect(screen.getByText("Carbon")).toBeInTheDocument();
  });
});
