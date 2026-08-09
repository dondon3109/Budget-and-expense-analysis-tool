// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ReleaseNotesDialog } from "../src/components/releases/ReleaseNotesDialog";

const releases = [
  {
    version: "1.1.0",
    releasedOn: "August 1, 2026",
    changes: [{ title: "Featured update", description: "The newest headline change." }],
  },
  {
    version: "1.0.0",
    releasedOn: "July 29, 2026",
    changes: [
      { title: "Reliable ordering", description: "Newer records appear first." },
      { title: "Flexible sorting", description: "Choose the order that works for you." },
    ],
  },
];

function ReleaseNotesHarness() {
  const [open, setOpen] = useState(true);
  return open ? (
    <ReleaseNotesDialog releases={releases} onAcknowledge={() => setOpen(false)} />
  ) : null;
}

beforeEach(() => {
  if (!document.getElementById("root")) {
    const root = document.createElement("div");
    root.id = "root";
    document.body.append(root);
  }
});

afterEach(() => {
  cleanup();
  document.body.innerHTML = "";
  document.body.style.overflow = "";
});

describe("ReleaseNotesDialog", () => {
  it("shows the latest release by default and toggles previous updates", () => {
    const onAcknowledge = vi.fn();
    render(<ReleaseNotesDialog releases={releases} onAcknowledge={onAcknowledge} />);

    expect(screen.getByRole("dialog", { name: "Zoption 1.1.0" })).toBeInTheDocument();
    expect(screen.getByText("Featured update")).toBeInTheDocument();
    expect(document.getElementById("root")).toHaveAttribute("aria-hidden", "true");
    expect(document.body.style.overflow).toBe("hidden");

    // Previous updates are hidden by default.
    expect(screen.queryByRole("heading", { name: "v1.0.0" })).not.toBeInTheDocument();
    expect(screen.queryByText("Reliable ordering")).not.toBeInTheDocument();

    // Show previous updates.
    fireEvent.click(screen.getByRole("button", { name: "Show previous updates" }));
    expect(screen.getByRole("button", { name: "Hide previous updates" })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    expect(screen.getByRole("heading", { name: "v1.0.0" })).toBeInTheDocument();
    expect(screen.getByText("Reliable ordering")).toBeInTheDocument();

    // Hide previous updates again.
    fireEvent.click(screen.getByRole("button", { name: "Hide previous updates" }));
    expect(screen.getByRole("button", { name: "Show previous updates" })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
    expect(screen.queryByRole("heading", { name: "v1.0.0" })).not.toBeInTheDocument();
    expect(screen.queryByText("Reliable ordering")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Got it" }));
    expect(onAcknowledge).toHaveBeenCalledOnce();
  });

  it("releases the root lock when acknowledgement unmounts the dialog", () => {
    const root = document.getElementById("root");
    if (!root) throw new Error("Test root is missing.");
    render(<ReleaseNotesHarness />);

    expect(root.inert).toBe(true);
    expect(document.body.style.overflow).toBe("hidden");

    fireEvent.click(screen.getByRole("button", { name: "Got it" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(root.inert).toBe(false);
    expect(root).not.toHaveAttribute("aria-hidden");
    expect(document.body.style.overflow).toBe("");
  });

  it("does not lock the document when there is no release to show", () => {
    const root = document.getElementById("root");
    if (!root) throw new Error("Test root is missing.");
    render(<ReleaseNotesDialog releases={[]} onAcknowledge={vi.fn()} />);

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(root.inert ?? false).toBe(false);
    expect(root).not.toHaveAttribute("aria-hidden");
    expect(document.body.style.overflow).toBe("");
  });

  it("acknowledges on Escape and traps focus", () => {
    const onAcknowledge = vi.fn();
    render(<ReleaseNotesDialog releases={releases} onAcknowledge={onAcknowledge} />);

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
