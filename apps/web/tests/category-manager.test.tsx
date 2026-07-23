// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import type { CategoryRecord } from "@zoption/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { CategoryManager } from "../src/components/transactions/CategoryManager";
import { createCategory, updateCategory } from "../src/lib/api";
import type { AuthenticatedWorkspace } from "../src/lib/workspace";

vi.mock("../src/lib/api", () => ({
  createCategory: vi.fn(),
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
};

function renderManager(categories: CategoryRecord[] = [category]) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <CategoryManager workspace={workspace} categories={categories} onClose={vi.fn()} />
    </QueryClientProvider>,
  );
}

describe("CategoryManager", () => {
  beforeEach(() => {
    vi.mocked(createCategory).mockResolvedValue(category);
    vi.mocked(updateCategory).mockResolvedValue(category);
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

  it("identifies system categories and does not offer edit controls", () => {
    renderManager([
      {
        id: "uncategorized-expense",
        name: "Uncategorized",
        kind: "expense",
        color: "#6b7280",
        archived: false,
        system: true,
      },
    ]);

    expect(screen.getByText(/Required for imports/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Rename Uncategorized" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Archive Uncategorized" })).not.toBeInTheDocument();
  });
});
