import type { TransactionExportQuery } from "@zoption/shared";

import type { AuthenticatedWorkspace } from "../workspace";
import { requestBlob } from "./transport";

export async function downloadTransactions(
  workspace: AuthenticatedWorkspace,
  query: TransactionExportQuery,
): Promise<void> {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== "") search.set(key, String(value));
  }
  const blob = await requestBlob(
    workspace,
    `/api/app/exports/transactions.csv?${search.toString()}`,
  );
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "zoption-transactions.csv";
  anchor.click();
  URL.revokeObjectURL(url);
}

export async function downloadAccountArchive(workspace: AuthenticatedWorkspace): Promise<void> {
  const blob = await requestBlob(workspace, "/api/app/exports/account-archive.json");
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  const today = new Date().toISOString().slice(0, 10);
  anchor.download = `zoption-account-archive-${today}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}
