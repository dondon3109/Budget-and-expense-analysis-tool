// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useRef, useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CancelSubscriptionDialog } from "../src/components/account/CancelSubscriptionDialog";

function Harness() {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const onConfirm = vi.fn();

  return (
    <>
      <button ref={triggerRef} type="button" onClick={() => setOpen(true)}>
        Open cancellation
      </button>
      <CancelSubscriptionDialog
        open={open}
        busy={false}
        periodEndsAt="2026-08-30T00:00:00.000Z"
        returnFocus={triggerRef.current}
        onClose={() => setOpen(false)}
        onConfirm={onConfirm}
      />
    </>
  );
}

beforeEach(() => {
  document.body.innerHTML = '<div id="root"></div>';
});

afterEach(() => {
  cleanup();
  document.body.style.overflow = "";
});

describe("CancelSubscriptionDialog", () => {
  it("traps focus, dismisses safely, and restores the originating control", async () => {
    const user = userEvent.setup();
    const root = document.getElementById("root");
    if (!root) throw new Error("Test root is missing.");
    render(<Harness />, { container: root });

    const trigger = screen.getByRole("button", { name: "Open cancellation" });
    await user.click(trigger);

    const dialog = screen.getByRole("dialog", { name: "Cancel renewal?" });
    const keep = screen.getByRole("button", { name: "Keep subscription" });
    const cancel = screen.getByRole("button", { name: "Cancel renewal" });

    expect(dialog).toHaveAccessibleDescription(
      /Pro access remains available through August 30, 2026/i,
    );
    expect(keep).toHaveFocus();
    expect(root.inert).toBe(true);
    expect(root).toHaveAttribute("aria-hidden", "true");
    expect(document.body.style.overflow).toBe("hidden");

    await user.tab({ shift: true });
    expect(cancel).toHaveFocus();
    await user.tab();
    expect(keep).toHaveFocus();

    await user.keyboard("{Escape}");

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
    expect(root.inert).toBe(false);
    expect(root).not.toHaveAttribute("aria-hidden");
    expect(document.body.style.overflow).toBe("");
  });

  it("closes only when the backdrop itself is clicked", async () => {
    const user = userEvent.setup();
    const root = document.getElementById("root");
    if (!root) throw new Error("Test root is missing.");
    render(<Harness />, { container: root });

    await user.click(screen.getByRole("button", { name: "Open cancellation" }));
    const dialog = screen.getByRole("dialog", { name: "Cancel renewal?" });
    await user.click(dialog);
    expect(dialog).toBeInTheDocument();

    await user.click(document.querySelector(".cancel-subscription-backdrop")!);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
