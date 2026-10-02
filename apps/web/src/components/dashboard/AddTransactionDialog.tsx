import { useMutation, useQueryClient } from "@tanstack/react-query";

import { createTransaction } from "../../lib/api";
import type { userWorkspace } from "../../lib/workspace";
import { useAccounts } from "../../queries/accounts";
import { useCategories } from "../../queries/categories";
import { useDebts } from "../../queries/debts";
import { invalidateAfterTransactionWrite } from "../../queries/transactions";
import { TransactionForm } from "../transactions/TransactionForm";

type Workspace = ReturnType<typeof userWorkspace>;

// Lets the dashboard record a transaction in place so a user checking their balance is not sent
// to the Transactions page. Saves are not optimistic here: the dashboard has no feed to patch, and
// closing on success lets the invalidation refresh the balances behind the dialog.
export function AddTransactionDialog({
  workspace,
  onClose,
}: {
  workspace: Workspace;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const categories = useCategories(workspace, true).data ?? [];
  const accounts = useAccounts(workspace).data ?? [];
  const debts = useDebts(workspace).data?.items ?? [];
  const saveMutation = useMutation({
    mutationFn: (input: Parameters<typeof createTransaction>[1]) =>
      createTransaction(workspace, input),
    onSettled: () => invalidateAfterTransactionWrite(queryClient, workspace),
  });

  return (
    <TransactionForm
      workspace={workspace}
      categories={categories}
      accounts={accounts}
      debts={debts}
      busy={saveMutation.isPending}
      serverError={saveMutation.error?.message}
      onSubmit={async (input) => {
        await saveMutation.mutateAsync(input);
        onClose();
      }}
      onClose={() => {
        if (!saveMutation.isPending) onClose();
      }}
    />
  );
}
