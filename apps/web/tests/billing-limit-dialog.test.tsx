// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useRef, useState } from "react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";

import { BillingLimitDialog } from "../src/components/billing/BillingLimitDialog";
import { ApiRequestError } from "../src/lib/api";

const error = new ApiRequestError("Limit reached", 409, "monthly_limit_reached", {
  feature: "assistant_question",
  used: 4,
  limit: 4,
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

afterEach(cleanup);

describe("BillingLimitDialog", () => {
  it("traps focus, closes on Escape, and restores the originating control", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    const trigger = screen.getByRole("button", { name: "Open limit" });
    await user.click(trigger);

    expect(
      screen.getByRole("dialog", { name: "No AI questions remaining this month" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Review Plan and billing" })).toHaveFocus();
    expect(screen.getByRole("dialog")).toHaveTextContent("Aug 1, 2026");

    await user.keyboard("{Escape}");

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });
});
