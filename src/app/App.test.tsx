import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { App } from "./App";

describe("App routes", () => {
  it("renders the table display", () => {
    render(<App path="/table" />);
    expect(screen.getByRole("main", { name: /periodic table display/i })).toBeInTheDocument();
  });

  it("renders the info display", () => {
    render(<App path="/info" />);
    expect(screen.getByRole("main", { name: /element information display/i })).toBeInTheDocument();
  });

  it("sends unknown paths to the table experience", () => {
    render(<App path="/" />);
    expect(screen.getByRole("main", { name: /periodic table display/i })).toBeInTheDocument();
  });
});
