// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useRef, useState } from "react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { BillingLimitDialog } from "../src/components/billing/BillingLimitDialog";
import { ApiRequestError } from "../src/lib/api";

const error = new ApiRequestError("Limit reached", 409, "assistant_cycle_limit_reached", {
  feature: "assistant_question",
  used: 4,
  limit: 4,
  periodKind: "anchored_14_day",
  periodStartedAt: "2026-07-18T00:00:00.000Z",
  resetsAt: "2026-08-01T00:00:00.000Z",
});

function Harness() {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  return (
    <MemoryRouter>
      <button ref={triggerRef} type="button" onClick={() => setOpen(true)}>
        Open limit
      </button>
      {open && (
        <BillingLimitDialog
          error={error}
          returnFocus={triggerRef.current}
          onClose={() => setOpen(false)}
        />
      )}
    </MemoryRouter>
  );
}

beforeEach(() => {
  document.body.innerHTML = '<div id="root"></div>';
});

afterEach(() => {
  cleanup();
  document.body.style.overflow = "";
});

describe("BillingLimitDialog", () => {
  it("traps focus, closes on Escape, and restores the originating control", async () => {
    const user = userEvent.setup();
    const root = document.getElementById("root");
    if (!root) throw new Error("Test root is missing.");
    render(<Harness />, { container: root });

    expect(root.inert ?? false).toBe(false);
    expect(document.body.style.overflow).toBe("");

    const trigger = screen.getByRole("button", { name: "Open limit" });
    await user.click(trigger);

    expect(
      screen.getByRole("dialog", { name: "No AI questions remaining this 14-day period" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Review Plan and billing" })).toHaveFocus();
    expect(screen.getByRole("dialog")).toHaveTextContent("Aug 1, 2026");
    expect(root.inert).toBe(true);
    expect(root).toHaveAttribute("aria-hidden", "true");
    expect(document.body.style.overflow).toBe("hidden");

    await user.keyboard("{Escape}");

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
    expect(root.inert ?? false).toBe(false);
    expect(root).not.toHaveAttribute("aria-hidden");
    expect(document.body.style.overflow).toBe("");
  });

  it("does not lock the document for an unrelated error", () => {
    const root = document.getElementById("root");
    if (!root) throw new Error("Test root is missing.");

    render(
      <MemoryRouter>
        <BillingLimitDialog error={new Error("Other failure")} onClose={vi.fn()} />
      </MemoryRouter>,
      { container: root },
    );

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(root.inert ?? false).toBe(false);
    expect(root).not.toHaveAttribute("aria-hidden");
    expect(document.body.style.overflow).toBe("");
  });
});
