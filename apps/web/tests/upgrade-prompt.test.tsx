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
  it("shows a validated assistant-cycle limit and Manila reset time", () => {
    renderPrompt(
      new ApiRequestError("Limit reached", 409, "assistant_cycle_limit_reached", {
        feature: "assistant_question",
        used: 12,
        limit: 12,
        periodKind: "anchored_14_day",
        periodStartedAt: "2026-07-18T00:00:00.000Z",
        resetsAt: "2026-08-01T00:00:00.000Z",
      }),
    );

    expect(screen.getByRole("alert", { name: "14-day assistant limit reached" })).toHaveTextContent(
      "12 of 12 AI questions",
    );
    expect(screen.getByRole("alert")).toHaveTextContent("Asia/Manila");
    expect(screen.getByRole("link", { name: /Plan and billing/ })).toHaveAttribute(
      "href",
      "/app/settings#plan-and-billing",
    );
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
