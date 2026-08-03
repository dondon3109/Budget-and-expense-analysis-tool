// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getBillingSummary = vi.hoisted(() => vi.fn());

vi.mock("../src/lib/api", async (importOriginal) => ({
  ...(await importOriginal()),
  getBillingSummary,
}));

import { useBillingSummary } from "../src/hooks/useBillingSummary";

const workspace = { key: "user:user-1" as const, userId: "user-1" };

function summary(used: number, resetsAt: string | null) {
  return {
    plan: "free" as const,
    entitlementSource: null,
    provider: null,
    status: null,
    interval: null,
    currentPeriodEndsAt: null,
    scheduledChangeAt: null,
    cancelAtPeriodEnd: false,
    pendingCheckout: null,
    canCheckout: true,
    canManageBilling: false,
    canManageSponsoredSeats: false,
    nonTerminalSubscriptionCount: 0,
    usages: [
      {
        feature: "assistant_question" as const,
        used,
        limit: 4,
        periodKind: "anchored_14_day" as const,
        periodStartedAt: resetsAt ? "2025-12-18T00:00:10.000Z" : null,
        resetsAt,
      },
    ],
    allowances: [],
  };
}

function Harness() {
  const query = useBillingSummary(workspace);
  return <span>{query.data?.usages[0]?.used ?? "loading"}</span>;
}

function renderHarness() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <Harness />
    </QueryClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

beforeEach(() => {
  getBillingSummary.mockReset();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
});

describe("useBillingSummary reset scheduling", () => {
  it("refetches just after the nearest usage reset boundary", async () => {
    getBillingSummary
      .mockResolvedValueOnce(summary(4, "2026-01-01T00:00:10.000Z"))
      .mockResolvedValueOnce(summary(0, "2026-01-15T00:00:10.000Z"));
    renderHarness();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(screen.getByText("4")).toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(11_000);
    });

    expect(getBillingSummary).toHaveBeenCalledTimes(2);
  });

  it("does not schedule stale or unstarted reset timestamps", async () => {
    getBillingSummary.mockResolvedValue(summary(0, null));
    const { unmount } = renderHarness();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    unmount();
    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(getBillingSummary).toHaveBeenCalledOnce();
  });
});
