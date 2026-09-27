// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import type { AccountRecord, SubscriptionMonthSummary } from "@zoption/shared";
import type { QueryClient } from "@tanstack/react-query";
import { cleanup, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/lib/api", async () =>
  (await import("./helpers/api-mock")).createApiMock(["getAccounts", "getSubscriptions"]),
);

import { getAccounts, getSubscriptions } from "../src/lib/api";
import { queryKeys } from "../src/lib/queryKeys";
import type { AuthenticatedWorkspace } from "../src/lib/workspace";
import { invalidateAfterAccountWrite, useAccounts } from "../src/queries/accounts";
import {
  invalidateAfterCredentialCreate,
  invalidateAfterCredentialUpdate,
  invalidateAfterProviderConfigEdit,
  invalidateAfterProviderConfigUpdate,
  invalidateAfterProviderRouteChange,
  invalidateProviderCredentials,
} from "../src/queries/admin-providers";
import { invalidateBillingSummary } from "../src/queries/billing";
import { invalidateCategoriesAndBilling } from "../src/queries/categories";
import { useSubscriptions } from "../src/queries/subscriptions";
import { invalidateAfterTransactionWrite } from "../src/queries/transactions";
import { createTestQueryClient, renderWithProviders } from "./helpers/render";

const workspace: AuthenticatedWorkspace = { key: "user:user-1", userId: "user-1" };

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

async function invalidatedKeys(
  helper: (queryClient: QueryClient, workspace: AuthenticatedWorkspace) => Promise<unknown>,
) {
  const queryClient = createTestQueryClient();
  const invalidate = vi.spyOn(queryClient, "invalidateQueries");
  await helper(queryClient, workspace);
  return invalidate.mock.calls.map(([filters]) => filters?.queryKey);
}

describe("query invalidation helpers", () => {
  // Each set is what the call sites refreshed inline before the helpers existed. A change here
  // changes what those screens refetch after a write.
  it.each([
    [
      "invalidateAfterAccountWrite",
      invalidateAfterAccountWrite,
      [
        queryKeys.accounts(workspace),
        queryKeys.allTransactions(workspace),
        queryKeys.dashboard(workspace),
      ],
    ],
    [
      "invalidateAfterTransactionWrite",
      invalidateAfterTransactionWrite,
      [
        queryKeys.allTransactions(workspace),
        queryKeys.accounts(workspace),
        queryKeys.dashboard(workspace),
        queryKeys.debts(workspace),
      ],
    ],
    [
      "invalidateCategoriesAndBilling",
      invalidateCategoriesAndBilling,
      [queryKeys.allCategories(workspace), queryKeys.billing(workspace)],
    ],
    ["invalidateBillingSummary", invalidateBillingSummary, [queryKeys.billing(workspace)]],
    [
      "invalidateAfterProviderConfigUpdate",
      invalidateAfterProviderConfigUpdate,
      [queryKeys.providerConfigs(workspace), queryKeys.providerConfigAudits(workspace)],
    ],
    [
      "invalidateAfterProviderRouteChange",
      invalidateAfterProviderRouteChange,
      [
        queryKeys.providerConfigs(workspace),
        queryKeys.providerConfigAudits(workspace),
        queryKeys.providerHealth(workspace),
      ],
    ],
    [
      "invalidateAfterProviderConfigEdit",
      invalidateAfterProviderConfigEdit,
      [
        queryKeys.providerConfigs(workspace),
        queryKeys.providerConfigAudits(workspace),
        queryKeys.providerCredentials(workspace),
        queryKeys.providerHealth(workspace),
      ],
    ],
    [
      "invalidateProviderCredentials",
      invalidateProviderCredentials,
      [queryKeys.providerCredentials(workspace)],
    ],
    [
      "invalidateAfterCredentialCreate",
      invalidateAfterCredentialCreate,
      [queryKeys.providerCredentials(workspace), queryKeys.providerHealth(workspace)],
    ],
    [
      "invalidateAfterCredentialUpdate",
      invalidateAfterCredentialUpdate,
      [
        queryKeys.providerCredentials(workspace),
        queryKeys.providerHealth(workspace),
        queryKeys.providerConfigs(workspace),
      ],
    ],
  ])("%s refreshes exactly its key set", async (_name, helper, expected) => {
    expect(await invalidatedKeys(helper)).toEqual(expected);
  });
});

describe("query hooks", () => {
  it("useAccounts reads the accounts list into the workspace accounts key", async () => {
    const accounts = [{ id: "acc-1", name: "Cash" }] as AccountRecord[];
    vi.mocked(getAccounts).mockResolvedValue(accounts);
    function AccountNames() {
      const { data } = useAccounts(workspace);
      return <p>{data?.map((account) => account.name).join(", ")}</p>;
    }

    const { queryClient } = renderWithProviders(<AccountNames />);

    expect(await screen.findByText("Cash")).toBeInTheDocument();
    expect(getAccounts).toHaveBeenCalledWith(workspace);
    expect(queryClient.getQueryData(queryKeys.accounts(workspace))).toBe(accounts);
  });

  it("useSubscriptions keys each month separately", async () => {
    const summary = { month: "2026-08", items: [] } as unknown as SubscriptionMonthSummary;
    vi.mocked(getSubscriptions).mockResolvedValue(summary);
    function Renewals() {
      const { data } = useSubscriptions(workspace, "2026-08-01");
      return <p>{data ? `Month ${data.month}` : "Loading"}</p>;
    }

    const { queryClient } = renderWithProviders(<Renewals />);

    expect(await screen.findByText("Month 2026-08")).toBeInTheDocument();
    expect(getSubscriptions).toHaveBeenCalledWith(workspace, "2026-08-01");
    await waitFor(() =>
      expect(queryClient.getQueryData(queryKeys.subscriptions(workspace, "2026-08-01"))).toBe(
        summary,
      ),
    );
  });
});
