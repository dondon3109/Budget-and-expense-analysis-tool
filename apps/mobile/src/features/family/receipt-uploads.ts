import { ApiTransportError } from "@/api/authenticated";
import { uploadFamilyReceipt } from "@/api/family-receipts";
import type { LocalWorkspace } from "@/db/workspace";

/**
 * Uploads the family receipt photos queued in `workspace` whose entries have synced. A photo the
 * family refuses is dropped; one that fails for the connection waits for the next sync.
 */
export async function uploadQueuedReceipts(
  workspace: LocalWorkspace,
  api: { accessToken: string; workspaceId: string },
): Promise<void> {
  for (const upload of await workspace.transactionMutations.readyReceiptUploads()) {
    try {
      await uploadFamilyReceipt(api, upload.transactionIds, upload);
    } catch (error) {
      const refused =
        error instanceof ApiTransportError &&
        (error.code === "invalid_request" || error.code === "not_found" || error.status === 403);
      if (!refused) return;
    }
    await workspace.transactionMutations.finishReceiptUpload(upload.id);
  }
}
