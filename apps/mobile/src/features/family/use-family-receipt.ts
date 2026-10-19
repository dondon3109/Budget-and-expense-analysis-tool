import { useEffect, useState } from "react";

import { fetchFamilyReceipt, removeFamilyReceipt } from "@/api/family-receipts";
import type { LocalWorkspace } from "@/db/workspace";

import type { ReceiptPhoto } from "./receipt-photo";
import { useFamilyApi } from "./use-family-api";

/**
 * The receipt photo of a family entry as a data URI held in memory, or null when it has none,
 * cannot be loaded offline, or this is not a family entry.
 */
export function useFamilyReceipt(transactionId: string | undefined): string | null {
  const familyApi = useFamilyApi();
  const [photo, setPhoto] = useState<string | null>(null);
  useEffect(() => {
    setPhoto(null);
    if (!familyApi || !transactionId) return;
    let live = true;
    void familyApi((api) => fetchFamilyReceipt(api, transactionId))
      .then((uri) => {
        if (live) setPhoto(uri);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [familyApi, transactionId]);
  return photo;
}

/**
 * Saves a receipt change made in the editor: a new photo is queued to upload once the entry
 * syncs, and a removal goes to the Worker at once, so it needs a connection.
 */
export async function saveFamilyReceipt(
  workspace: LocalWorkspace,
  familyApi: NonNullable<ReturnType<typeof useFamilyApi>>,
  transactionId: string,
  photo: ReceiptPhoto | null,
): Promise<void> {
  if (photo) {
    await workspace.transactionMutations.queueReceiptUpload([transactionId], photo);
    return;
  }
  await familyApi((api) => removeFamilyReceipt(api, transactionId));
}
