import type { TransactionExportQuery, TransactionListQuery } from "@zoption/shared";
import { useState } from "react";

import { downloadTransactions } from "../lib/api";
import { reportBillingLimit } from "../lib/billingLimitNotice";
import type { AuthenticatedWorkspace } from "../lib/workspace";

/** Downloads the ledger as CSV with the filters and sort currently applied. */
export function useTransactionExport(
  workspace: AuthenticatedWorkspace,
  query: TransactionListQuery,
) {
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<Error>();

  async function handleExport() {
    setExporting(true);
    setExportError(undefined);
    try {
      const filters: TransactionExportQuery = {
        search: query.search,
        categoryId: query.categoryId,
        accountId: query.accountId,
        kind: query.kind,
        from: query.from,
        to: query.to,
        sortBy: query.sortBy,
        sortDirection: query.sortDirection,
      };
      await downloadTransactions(workspace, filters);
    } catch (error) {
      reportBillingLimit(error);
      setExportError(
        error instanceof Error ? error : new Error("The export could not be prepared."),
      );
    } finally {
      setExporting(false);
    }
  }

  return { exporting, exportError, handleExport };
}
