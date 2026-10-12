// @vitest-environment jsdom
import { QueryClientProvider } from "@tanstack/react-query";
import { renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import { queryKeys } from "../src/lib/queryKeys";
import { useBudgets } from "../src/queries/budgets";
import { createTestQueryClient } from "./helpers/render";

vi.mock("../src/lib/api", () => ({ getBudgets: vi.fn(), getBudgetOccasions: vi.fn() }));

const workspace = { key: "user:test-user" as const, userId: "test-user" };

describe("useBudgets", () => {
  it("returns no plan while none is open, even when another plan is cached", () => {
    const queryClient = createTestQueryClient();
    queryClient.setQueryData(queryKeys.budgets(workspace, "every-month"), { items: [] });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );

    const { result } = renderHook(() => useBudgets(workspace, null), { wrapper });

    expect(result.current.data).toBeUndefined();
    expect(result.current.isLoading).toBe(false);
  });
});
