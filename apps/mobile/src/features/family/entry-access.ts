import type { WorkspaceSummary } from "@zoption/shared";

import type { LocalSyncState } from "@/db/view-models";

/**
 * Whether the signed-in person may add (no entry) or change an entry in the workspace shown,
 * mirroring the Worker: viewers change nothing, the owner changes anything, and a member changes
 * only what they added. An entry without an author is the owner's, except one made on this phone
 * that has not uploaded yet, which gets its author when the Worker confirms it.
 */
export function canChangeEntry(
  family: Pick<WorkspaceSummary, "role"> | null,
  userId: string | null,
  entry: { authorUserId: string | null; syncState: LocalSyncState } | null,
): boolean {
  if (!family) return true;
  if (family.role === "viewer") return false;
  if (!entry || family.role === "owner") return true;
  if (entry.authorUserId) return entry.authorUserId === userId;
  return entry.syncState !== "synced";
}
