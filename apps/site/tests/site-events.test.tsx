// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

const posthog = vi.hoisted(() => ({ capture: vi.fn() }));
vi.mock("posthog-js", () => ({ default: posthog }));
vi.mock("posthog-js/dist/web-vitals", () => ({}));

import { listenForSiteEvents } from "../src/client/analytics";
import { announceSiteEvent, SITE_EVENT_NAME } from "../src/lib/siteEvents";
import { BudgetCalculator } from "../src/views/tools/BudgetCalculator";

beforeAll(() => listenForSiteEvents());

afterEach(() => {
  cleanup();
  posthog.capture.mockClear();
});

function capturedNames() {
  return posthog.capture.mock.calls.map(([name]) => name as string);
}

describe("site events", () => {
  it("captures an announced event with no property beyond the page and surface", () => {
    announceSiteEvent("calculator_used");

    expect(posthog.capture).toHaveBeenCalledWith(
      "calculator_used",
      { $current_url: `${location.origin}${location.pathname}`, source: "site" },
      { send_instantly: true },
    );
  });

  it("ignores names outside the closed set, however they arrive", () => {
    window.dispatchEvent(new CustomEvent(SITE_EVENT_NAME, { detail: "income_entered" }));
    render(
      <a href="#x" data-site-event="anything">
        Elsewhere
      </a>,
    );
    fireEvent.click(screen.getByText("Elsewhere"));

    expect(posthog.capture).not.toHaveBeenCalled();
  });

  it("counts calculator use once per page load and never sends what was typed", () => {
    render(<BudgetCalculator />);
    const income = screen.getByLabelText("Monthly take-home pay");
    fireEvent.change(income, { target: { value: "45,250.50" } });
    fireEvent.change(income, { target: { value: "52,000" } });

    expect(capturedNames()).toEqual(["calculator_used"]);
    expect(JSON.stringify(posthog.capture.mock.calls)).not.toContain("52");
  });

  it("sends calculator visitors to signup with their source and counts the click", () => {
    render(<BudgetCalculator />);
    const cta = screen.getByRole("link", { name: /Track this split in Zoption/ });

    expect(cta).toHaveAttribute("href", "https://app.zoption.site/signup?from=budget-calculator");
    expect(cta).toHaveAttribute("target", "_blank");
    cta.addEventListener("click", (event) => event.preventDefault());
    fireEvent.click(cta);

    expect(capturedNames()).toEqual(["calculator_signup_clicked"]);
  });
});
