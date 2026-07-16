// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import type { CategoryRecord } from "@budget/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { CategoryManager } from "../src/components/transactions/CategoryManager";
import { createCategory, updateCategory } from "../src/lib/api";

vi.mock("../src/lib/api", () => ({
  createCategory: vi.fn(),
  updateCategory: vi.fn(),
}));

const category: CategoryRecord = {
  id: "food",
  name: "Food & dining",
  kind: "expense",
  color: "#dc8b3f",
  archived: false,
};

function renderManager() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <CategoryManager categories={[category]} onClose={vi.fn()} />
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
    expect(vi.mocked(createCategory).mock.calls[0]?.[0]).toEqual({
      name: "Health",
      kind: "expense",
      color: "#dc8b3f",
    });

    await user.click(screen.getByRole("button", { name: "Archive Food & dining" }));
    await waitFor(() => expect(updateCategory).toHaveBeenCalledOnce());
    expect(vi.mocked(updateCategory).mock.calls[0]?.[0]).toEqual({
      id: "food",
      input: { archived: true },
    });
  });
});
