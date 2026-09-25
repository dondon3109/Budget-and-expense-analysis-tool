// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { AccountRecord } from "@zoption/shared";
import { afterEach, describe, expect, it, vi } from "vitest";

const getAccounts = vi.hoisted(() => vi.fn());

vi.mock("../src/lib/api", async (importOriginal) => ({
  ...(await importOriginal()),
  getAccounts,
}));

import { DefaultSpendingAccountSettings } from "../src/components/account/DefaultSpendingAccountSettings";
import { DEFAULT_SPENDING_ACCOUNT_STORAGE_KEY } from "../src/lib/defaultSpendingAccount";

function account(id: string, name: string, type: AccountRecord["type"], archived = false) {
  return { id, name, type, currency: "PHP", archived } as AccountRecord;
}

function renderSettings() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <DefaultSpendingAccountSettings workspace={{ key: "user:user-1", userId: "user-1" }} />
    </QueryClientProvider>,
  );
}

describe("DefaultSpendingAccountSettings", () => {
  afterEach(() => {
    cleanup();
    window.localStorage.clear();
  });

  it("starts on Cash, lists only active accounts, and saves a new choice", async () => {
    getAccounts.mockResolvedValue([
      account("bank", "Bank", "checking"),
      account("cash", "Cash", "cash"),
      account("gcash", "GCash", "other"),
      account("old", "Old wallet", "other", true),
    ]);
    renderSettings();

    const select = await screen.findByRole("combobox", { name: "Account" });
    expect(select).toHaveValue("cash");
    expect(screen.queryByRole("option", { name: "Old wallet" })).not.toBeInTheDocument();

    fireEvent.change(select, { target: { value: "gcash" } });

    expect(select).toHaveValue("gcash");
    expect(window.localStorage.getItem(DEFAULT_SPENDING_ACCOUNT_STORAGE_KEY)).toBe("gcash");
  });

  it("falls back when the saved account was removed", async () => {
    window.localStorage.setItem(DEFAULT_SPENDING_ACCOUNT_STORAGE_KEY, "old");
    getAccounts.mockResolvedValue([
      account("cash", "Cash", "cash"),
      account("old", "Old wallet", "other", true),
    ]);
    renderSettings();

    expect(await screen.findByRole("combobox", { name: "Account" })).toHaveValue("cash");
  });
});
