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
import {
  rememberedWorkspaceCurrency,
  workspaceCurrencyStorageKey,
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
    window.localStorage.clear();
    vi.clearAllMocks();
  });

  it("saves USD and remembers it for this user only", async () => {
    // The save invalidates the workspace, so the refetch reads what the server now stores.
    getWorkspaceSettings.mockResolvedValueOnce({ currency: "PHP" });
    getWorkspaceSettings.mockResolvedValue({ currency: "USD" });
    updateWorkspaceSettings.mockResolvedValue({ currency: "USD" });
    renderSettings();

    const select = await screen.findByRole("combobox", { name: "Workspace currency" });
    await waitFor(() => expect(select).toHaveValue("PHP"));

    fireEvent.change(select, { target: { value: "USD" } });

    await waitFor(() => expect(select).toHaveValue("USD"));
    expect(updateWorkspaceSettings).toHaveBeenCalledWith(workspace, { currency: "USD" });
    expect(rememberedWorkspaceCurrency("user-1")).toBe("USD");
    expect(rememberedWorkspaceCurrency("user-2")).toBeUndefined();
  });

  it("starts from the remembered currency and still asks the server", async () => {
    window.localStorage.setItem(workspaceCurrencyStorageKey("user-1"), "USD");
    getWorkspaceSettings.mockResolvedValue({ currency: "PHP" });
    renderSettings();

    expect(screen.getByRole("combobox", { name: "Workspace currency" })).toHaveValue("USD");
    await waitFor(() =>
      expect(screen.getByRole("combobox", { name: "Workspace currency" })).toHaveValue("PHP"),
    );
    expect(rememberedWorkspaceCurrency("user-1")).toBe("PHP");
  });
});
