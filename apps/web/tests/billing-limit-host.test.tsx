// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { act, cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";

import { BillingLimitHost } from "../src/components/billing/BillingLimitHost";
import { ApiRequestError } from "../src/lib/api";
import { dismissBillingLimit, reportBillingLimit } from "../src/lib/billingLimitNotice";

afterEach(() => {
  act(() => dismissBillingLimit());
  cleanup();
});

describe("BillingLimitHost", () => {
  it("opens for a resource limit and for a Pro-only action", () => {
    render(
      <MemoryRouter>
        <BillingLimitHost />
      </MemoryRouter>,
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    act(() =>
      reportBillingLimit(
        new ApiRequestError("Pro", 403, "upgrade_required", { capability: "account_management" }),
      ),
    );
    expect(screen.getByRole("dialog", { name: "Zoption Pro is required" })).toBeInTheDocument();

    act(() => dismissBillingLimit());
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("ignores unrelated and monthly usage errors", () => {
    render(
      <MemoryRouter>
        <BillingLimitHost />
      </MemoryRouter>,
    );

    act(() => reportBillingLimit(new Error("boom")));
    act(() =>
      reportBillingLimit(
        new ApiRequestError("Limit", 409, "monthly_limit_reached", {
          feature: "ai_usage",
          used: 1,
          limit: 1,
          resetsAt: null,
        }),
      ),
    );

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
