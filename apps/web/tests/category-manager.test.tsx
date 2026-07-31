// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import type { CategoryRecord } from "@zoption/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CategoryManager } from "../src/components/transactions/CategoryManager";
import { createCategory, getBillingSummary, updateCategory } from "../src/lib/api";
import type { AuthenticatedWorkspace } from "../src/lib/workspace";

vi.mock("../src/lib/api", async (importOriginal) => ({
  ...(await importOriginal()),
  createCategory: vi.fn(),
  getBillingSummary: vi.fn(),
  updateCategory: vi.fn(),
}));

const workspace: AuthenticatedWorkspace = {
  key: "user:test-user",
  userId: "test-user",
};

const category: CategoryRecord = {
  id: "food",
  name: "Food & dining",
  kind: "expense",
  color: "#dc8b3f",
  archived: false,
  system: false,
  origin: "custom",
};

function renderManager(categories: CategoryRecord[] = [category]) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <CategoryManager workspace={workspace} categories={categories} onClose={vi.fn()} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

afterEach(cleanup);

describe("CategoryManager", () => {
  beforeEach(() => {
    vi.mocked(createCategory).mockResolvedValue(category);
    vi.mocked(updateCategory).mockResolvedValue(category);
    vi.mocked(getBillingSummary).mockResolvedValue({
      plan: "free",
      status: null,
      interval: null,
      currentPeriodEndsAt: null,
      scheduledChangeAt: null,
      canCheckout: true,
      canManageBilling: false,
      nonTerminalSubscriptionCount: 0,
      usages: [],
      allowances: [{ resource: "custom_category", used: 0, limit: 1 }],
    });
  });

  it("creates and archives categories through the connected mutations", async () => {
    const user = userEvent.setup();
    renderManager();

    await user.type(screen.getByLabelText("New category"), "Health");
    await user.click(screen.getByRole("button", { name: "Add" }));
    await waitFor(() => expect(createCategory).toHaveBeenCalledOnce());
    expect(vi.mocked(createCategory)).toHaveBeenCalledWith(workspace, {
      name: "Health",
      kind: "expense",
      color: "#2a78d6",
    });

    await user.click(screen.getByRole("button", { name: "Archive Food & dining" }));
    await waitFor(() => expect(updateCategory).toHaveBeenCalledOnce());
    expect(vi.mocked(updateCategory)).toHaveBeenCalledWith(workspace, {
      id: "food",
      input: { archived: true },
    });
  });

  it("greys out category creation and custom restoration at the Free limit", async () => {
    vi.mocked(getBillingSummary).mockResolvedValueOnce({
      plan: "free",
      status: null,
      interval: null,
      currentPeriodEndsAt: null,
      scheduledChangeAt: null,
      canCheckout: true,
      canManageBilling: false,
      nonTerminalSubscriptionCount: 0,
      usages: [],
      allowances: [{ resource: "custom_category", used: 1, limit: 1 }],
    });

    renderManager([
      category,
      { ...category, id: "archived", name: "Archived custom", archived: true },
      { ...category, id: "starter", name: "Starter", archived: true, origin: "starter" },
    ]);

    expect(await screen.findByText("1 / 1")).toBeInTheDocument();
    expect(screen.getByLabelText("New category")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Add" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Restore Archived custom" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Restore Starter" })).toBeEnabled();
  });

  it("shows unlimited categories and keeps creation available on Pro", async () => {
    vi.mocked(getBillingSummary).mockResolvedValueOnce({
      plan: "zoption_pro",
      status: "active",
      interval: "month",
      currentPeriodEndsAt: "2026-08-31T16:00:00.000Z",
      scheduledChangeAt: null,
      canCheckout: false,
      canManageBilling: true,
      nonTerminalSubscriptionCount: 1,
      usages: [],
      allowances: [{ resource: "custom_category", used: 12, limit: null }],
    });

    renderManager();

    expect(await screen.findByText("Unlimited")).toBeInTheDocument();
    expect(screen.getByLabelText("New category")).toBeEnabled();
    expect(screen.getByRole("button", { name: "Add" })).toBeEnabled();
  });

  it("identifies system categories and does not offer edit controls", () => {
    renderManager([
      {
        id: "uncategorized-expense",
        name: "Uncategorized",
        kind: "expense",
        color: "#6b7280",
        archived: false,
        system: true,
        origin: "system",
      },
    ]);

    expect(screen.getByText(/Required for imports/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Rename Uncategorized" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Archive Uncategorized" })).not.toBeInTheDocument();
  });
});
