// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ReleaseNotesDialog } from "../src/components/releases/ReleaseNotesDialog";

const release = {
  version: "1.0.0",
  releasedOn: "July 29, 2026",
  changes: [
    { title: "Reliable ordering", description: "Newer records appear first." },
    { title: "Flexible sorting", description: "Choose the order that works for you." },
  ],
};

beforeEach(() => {
  if (!document.getElementById("root")) {
    const root = document.createElement("div");
    root.id = "root";
    document.body.append(root);
  }
});

afterEach(() => {
  document.body.innerHTML = "";
  document.body.style.overflow = "";
});

describe("ReleaseNotesDialog", () => {
  it("shows the release content and acknowledges it from the primary action", () => {
    const onAcknowledge = vi.fn();
    render(<ReleaseNotesDialog release={release} onAcknowledge={onAcknowledge} />);

    expect(screen.getByRole("dialog", { name: "Zoption 1.0.0" })).toBeInTheDocument();
    expect(screen.getByText("Reliable ordering")).toBeInTheDocument();
    expect(document.getElementById("root")).toHaveAttribute("aria-hidden", "true");
    expect(document.body.style.overflow).toBe("hidden");

    fireEvent.click(screen.getByRole("button", { name: "Got it" }));
    expect(onAcknowledge).toHaveBeenCalledOnce();
  });

  it("acknowledges on Escape and traps focus", () => {
    const onAcknowledge = vi.fn();
    render(<ReleaseNotesDialog release={release} onAcknowledge={onAcknowledge} />);

    const dialog = screen.getByRole("dialog");
    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(onAcknowledge).toHaveBeenCalledOnce();

    const close = screen.getByRole("button", { name: "Close release notes" });
    const gotIt = screen.getByRole("button", { name: "Got it" });
    gotIt.focus();
    fireEvent.keyDown(dialog, { key: "Tab" });
    expect(close).toHaveFocus();
  });
});
