import type {
  CategoryRecord,
  TransactionInput,
  TransactionListItem,
  TransactionListQuery,
} from "@zoption/shared";
import { useMutation, useQueryClient, type QueryKey } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";

import { createTransaction, deleteTransaction, updateTransaction } from "../lib/api";
import { restoreOptimisticSnapshot, updateOptimistically } from "../lib/optimistic";
import {
  deleteOptimisticTransaction,
  mapFeedTransactions,
  saveOptimisticTransaction,
  type TransactionFeed,
} from "../lib/optimisticTransactions";
import type { AuthenticatedWorkspace } from "../lib/workspace";
import { invalidateAfterTransactionWrite } from "../queries/transactions";

/** Rebuilds the create payload so an undone delete recreates the same record. */
function transactionInputFromItem(item: TransactionListItem): TransactionInput | null {
  const amountMinor = Math.abs(item.amountMinor);
  if (amountMinor <= 0) return null;
  const base = {
    date: item.date,
    description: item.description,
    amountMinor,
    currency: item.currency,
    categoryId: item.categoryId,
    notes: item.notes ?? undefined,
  };
  if (item.kind === "income" || item.kind === "expense") {
    if (!item.accountId) return null;
    return { ...base, kind: item.kind, accountId: item.accountId };
  }
  if (!item.fromAccountId || !item.toAccountId) return null;
  return {
    ...base,
    kind: "transfer",
    fromAccountId: item.fromAccountId,
    toAccountId: item.toAccountId,
    transferFeeMinor: item.transferFeeMinor ?? undefined,
  };
}

interface BulkTransactionActionsOptions {
  workspace: AuthenticatedWorkspace;
  /** The Transactions page's infinite ledger key, which the optimistic updates edit. */
  feedKey: QueryKey;
  query: TransactionListQuery;
  categories: CategoryRecord[];
  /** The rows currently loaded in the ledger. */
  items: TransactionListItem[];
  /** Changes whenever the applied filters change. */
  filtersKey: string;
}

/**
 * Row selection and the multi-row ledger actions: delete, undo delete, and change category.
 * Each action sends one request per row, updates the ledger optimistically, and refreshes the
 * ledger, balances, dashboard, and debts when it settles.
 */
export function useBulkTransactionActions({
  workspace,
  feedKey,
  query,
  categories,
  items,
  filtersKey,
}: BulkTransactionActionsOptions) {
  const queryClient = useQueryClient();
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(() => new Set());
  const [bulkCategoryId, setBulkCategoryId] = useState("");
  const [recentlyDeleted, setRecentlyDeleted] = useState<TransactionListItem[]>([]);

  // A hidden row must never be acted on: drop the selection whenever the visible set changes.
  useEffect(() => {
    setSelectedIds((current) => (current.size === 0 ? current : new Set()));
  }, [filtersKey]);

  const deleteMutation = useMutation({
    mutationFn: async (items: TransactionListItem[]) => {
      for (const item of items) await deleteTransaction(workspace, item.id);
    },
    onMutate: async (items) => {
      const snapshot = await updateOptimistically<TransactionFeed>(
        queryClient,
        feedKey,
        (current) =>
          items.reduce<TransactionFeed | undefined>(
            (feed, item) => deleteOptimisticTransaction(feed, item.id),
            current,
          ),
      );
      return { snapshot };
    },
    onError: (_error, _items, context) => restoreOptimisticSnapshot(queryClient, context?.snapshot),
    onSettled: () => {
      void invalidateAfterTransactionWrite(queryClient, workspace);
    },
  });
  const undoDeleteMutation = useMutation({
    mutationFn: async (items: TransactionListItem[]) => {
      for (const item of items) {
        const input = transactionInputFromItem(item);
        if (!input) {
          throw new Error(
            `“${item.description}” can no longer be restored because its account is missing.`,
          );
        }
        await createTransaction(workspace, input);
      }
    },
    onMutate: async (items) => {
      const snapshot = await updateOptimistically<TransactionFeed>(
        queryClient,
        feedKey,
        (current) =>
          items.reduce<TransactionFeed | undefined>(
            (feed, item) => saveOptimisticTransaction(feed, query, item),
            current,
          ),
      );
      return { snapshot };
    },
    onError: (_error, _items, context) => restoreOptimisticSnapshot(queryClient, context?.snapshot),
    onSuccess: () => setRecentlyDeleted([]),
    onSettled: () => {
      void invalidateAfterTransactionWrite(queryClient, workspace);
    },
  });
  const bulkCategoryMutation = useMutation({
    mutationFn: async (args: { ids: string[]; categoryId: string }) => {
      for (const id of args.ids) {
        await updateTransaction(workspace, { id, input: { categoryId: args.categoryId } });
      }
    },
    onMutate: async ({ ids, categoryId }) => {
      const category = categories.find((candidate) => candidate.id === categoryId);
      const idSet = new Set(ids);
      const snapshot = await updateOptimistically<TransactionFeed>(
        queryClient,
        feedKey,
        (current) =>
          mapFeedTransactions(current, (item) =>
            idSet.has(item.id) && category
              ? {
                  ...item,
                  categoryId,
                  categoryName: category.name,
                  categoryColor: category.color,
                  categoryIconEmoji: category.iconEmoji ?? null,
                }
              : item,
          ),
      );
      return { snapshot };
    },
    onError: (_error, _args, context) => restoreOptimisticSnapshot(queryClient, context?.snapshot),
    onSuccess: () => {
      setSelectedIds(new Set());
      setBulkCategoryId("");
    },
    onSettled: () => {
      void invalidateAfterTransactionWrite(queryClient, workspace);
    },
  });

  const selectedItems = useMemo(
    () => items.filter((item) => selectedIds.has(item.id)),
    [items, selectedIds],
  );
  const selectedKinds = useMemo(
    () => new Set(selectedItems.map((item) => item.kind)),
    [selectedItems],
  );
  const bulkCategories = useMemo(
    () => categories.filter((category) => !category.archived && selectedKinds.has(category.kind)),
    [categories, selectedKinds],
  );
  const deletingIds = useMemo(() => {
    if (!deleteMutation.isPending) return undefined;
    return new Set((deleteMutation.variables ?? []).map((item) => item.id));
  }, [deleteMutation.isPending, deleteMutation.variables]);

  useEffect(() => {
    setBulkCategoryId((current) =>
      current && bulkCategories.some((category) => category.id === current) ? current : "",
    );
  }, [bulkCategories]);

  // Keep the selection to rows that are still on screen.
  useEffect(() => {
    const visible = new Set(items.map((item) => item.id));
    setSelectedIds((current) => {
      if (current.size === 0) return current;
      const next = new Set([...current].filter((id) => visible.has(id)));
      return next.size === current.size ? current : next;
    });
  }, [items]);

  function toggleSelect(id: string) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    setSelectedIds((current) => {
      const allSelected = items.length > 0 && items.every((item) => current.has(item.id));
      return allSelected ? new Set() : new Set(items.map((item) => item.id));
    });
  }

  return {
    selectedIds,
    setSelectedIds,
    bulkCategoryId,
    setBulkCategoryId,
    recentlyDeleted,
    setRecentlyDeleted,
    selectedItems,
    bulkCategories,
    deletingIds,
    toggleSelect,
    toggleSelectAll,
    deleteMutation,
    undoDeleteMutation,
    bulkCategoryMutation,
  };
}
