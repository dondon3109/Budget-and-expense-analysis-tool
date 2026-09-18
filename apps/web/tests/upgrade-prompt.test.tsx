// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";

import { UpgradePrompt } from "../src/components/billing/UpgradePrompt";
import { ApiRequestError } from "../src/lib/api";

afterEach(cleanup);

function renderPrompt(error: unknown) {
  return render(
    <MemoryRouter>
      <UpgradePrompt error={error} />
    </MemoryRouter>,
  );
}

describe("UpgradePrompt", () => {
  it("shows the exhausted shared AI pool, the Pro size, and the Manila reset time", () => {
    renderPrompt(
      new ApiRequestError("Limit reached", 409, "monthly_limit_reached", {
        feature: "ai_usage",
        used: 500,
        limit: 500,
        periodKind: "calendar_month",
        periodStartedAt: "2026-07-01T00:00:00.000Z",
        resetsAt: "2026-08-01T00:00:00.000Z",
      }),
    );

    const alert = screen.getByRole("alert", { name: "Monthly plan limit reached" });
    expect(alert).toHaveTextContent("500 of 500 AI actions this month");
    expect(alert).toHaveTextContent("Pro includes 2,000 AI actions a month");
    expect(alert).toHaveTextContent("Asia/Manila");
    expect(screen.getByRole("link", { name: /Plan and billing/ })).toHaveAttribute(
      "href",
      "/app/settings#plan-and-billing",
    );
  });

  it("does not pitch the Pro pool to a tenant already on it", () => {
    renderPrompt(
      new ApiRequestError("Limit reached", 409, "monthly_limit_reached", {
        feature: "ai_usage",
        used: 2000,
        limit: 2000,
        periodKind: "calendar_month",
        periodStartedAt: "2026-07-01T00:00:00.000Z",
        resetsAt: "2026-08-01T00:00:00.000Z",
      }),
    );

    const alert = screen.getByRole("alert", { name: "Monthly plan limit reached" });
    expect(alert).toHaveTextContent("2000 of 2000 AI actions this month");
    expect(alert).not.toHaveTextContent("Pro includes");
  });

  it("explains the persistent custom category allowance", () => {
    renderPrompt(
      new ApiRequestError("Limit reached", 409, "resource_limit_reached", {
        resource: "custom_category",
        used: 4,
        limit: 4,
      }),
    );

    expect(screen.getByRole("alert", { name: "Custom category limit reached" })).toHaveTextContent(
      "4 of 4 active custom categories",
    );
  });

  it("falls back safely when upgrade details are malformed", () => {
    renderPrompt(
      new ApiRequestError("Upgrade required", 403, "upgrade_required", { capability: 7 }),
    );

    expect(screen.getByRole("alert", { name: "Zoption Pro is required" })).toHaveTextContent(
      "Upgrade to use this paid feature.",
    );
  });

  it("renders nothing for unrelated errors", () => {
    const { container } = renderPrompt(new Error("Network unavailable"));

    expect(container).toBeEmptyDOMElement();
  });
});
