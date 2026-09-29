// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const getWorkspaceSettings = vi.hoisted(() => vi.fn());
const updateWorkspaceSettings = vi.hoisted(() => vi.fn());

vi.mock("../src/lib/api", async (importOriginal) => ({
  ...(await importOriginal()),
  getWorkspaceSettings,
  updateWorkspaceSettings,
}));

import { CurrencySettings } from "../src/components/account/CurrencySettings";
import { formatMoney } from "../src/lib/formatters";
import {
  WORKSPACE_CURRENCY_STORAGE_KEY,
  setWorkspaceCurrency,
  workspaceCurrency,
} from "../src/lib/workspaceCurrency";

const workspace = { key: "user:user-1", userId: "user-1" } as const;

function renderSettings() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <CurrencySettings workspace={workspace} />
    </QueryClientProvider>,
  );
}

describe("CurrencySettings", () => {
  afterEach(() => {
    cleanup();
    setWorkspaceCurrency("PHP");
    window.localStorage.clear();
    vi.clearAllMocks();
  });

  it("switches the workspace to USD and formats unlabeled amounts in dollars", async () => {
    // The save invalidates the workspace, so the refetch reads what the server now stores.
    getWorkspaceSettings.mockResolvedValueOnce({ currency: "PHP" });
    getWorkspaceSettings.mockResolvedValue({ currency: "USD" });
    updateWorkspaceSettings.mockResolvedValue({ currency: "USD" });
    renderSettings();

    const select = await screen.findByRole("combobox", { name: "Workspace currency" });
    expect(select).toHaveValue("PHP");
    expect(formatMoney(150_000)).toBe("₱1,500");

    fireEvent.change(select, { target: { value: "USD" } });

    await waitFor(() => expect(workspaceCurrency()).toBe("USD"));
    expect(updateWorkspaceSettings).toHaveBeenCalledWith(workspace, { currency: "USD" });
    expect(select).toHaveValue("USD");
    expect(formatMoney(150_000)).toBe("$1,500");
    expect(window.localStorage.getItem(WORKSPACE_CURRENCY_STORAGE_KEY)).toBe("USD");
  });

  it("adopts the server's currency when the settings load", async () => {
    getWorkspaceSettings.mockResolvedValue({ currency: "USD" });
    renderSettings();

    expect(await screen.findByRole("combobox", { name: "Workspace currency" })).toHaveValue("USD");
    expect(workspaceCurrency()).toBe("USD");
  });
});
