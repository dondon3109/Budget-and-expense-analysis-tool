import { ApiTransportError } from "@/api/authenticated";
import { uploadFamilyReceipt } from "@/api/family-receipts";
import type { LocalWorkspace } from "@/db/workspace";

/**
 * Uploads the family receipt photos queued in `workspace` whose entries have synced. A photo the
 * family refuses is dropped; one that fails for the connection waits for the next sync.
 */
export async function uploadQueuedReceipts(
  workspace: LocalWorkspace,
  api: { accessToken: string; workspaceId: string; signal?: AbortSignal },
  signal: AbortSignal | undefined = api.signal,
): Promise<void> {
  if (signal?.aborted) return;
  for (const upload of await workspace.transactionMutations.readyReceiptUploads()) {
    if (signal?.aborted) return;
    try {
      await uploadFamilyReceipt({ ...api, signal }, upload.transactionIds, upload);
    } catch (error) {
      if (signal?.aborted || (error instanceof Error && error.name === "AbortError")) return;
      const refused =
        error instanceof ApiTransportError &&
        (error.code === "invalid_request" || error.code === "not_found" || error.status === 403);
      if (!refused) return;
    }
    await workspace.transactionMutations.finishReceiptUpload(upload.id);
  }
}
