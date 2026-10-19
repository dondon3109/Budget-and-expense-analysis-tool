import { workspaceSummarySchema, type WorkspaceSummary } from "@zoption/shared";
import * as SecureStore from "expo-secure-store";
import { z } from "zod";

import { workspaceAlias } from "@/db/key-store";

/**
 * The local file subject of a family: the person plus the family, so each family the person
 * belongs to gets its own encrypted file and key (`openLocalWorkspace` hashes the subject).
 */
export function familySubject(subject: string, familyId: string): string {
  return `${subject}#family:${familyId}`;
}

const recordSchema = z
  .object({
    /** The family shown, or null for the personal workspace. */
    active: z.string().min(1).nullable(),
    families: z.array(workspaceSummarySchema),
    /** Families whose local copy finished one sync, so they can open offline. */
    synced: z.array(z.string().min(1)),
    /**
     * When a family the owner is closing closes, by family id, as last read online. A closing
     * family refuses every change, so the phone shows it read only. Older records have none.
     */
    closing: z.record(z.string(), z.string()).default({}),
  })
  .strict();

export type WorkspaceRecord = z.infer<typeof recordSchema>;

export const EMPTY_WORKSPACE_RECORD: WorkspaceRecord = {
  active: null,
  families: [],
  synced: [],
  closing: {},
};

const storeOptions: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
};

async function recordKey(subject: string): Promise<string> {
  return `zoption.active-workspace.v1.${(await workspaceAlias(subject)).slice(0, 32)}`;
}

/** The person's families and last workspace on this phone; an unreadable record reads as empty. */
export async function loadWorkspaceRecord(subject: string): Promise<WorkspaceRecord> {
  const stored = await SecureStore.getItemAsync(await recordKey(subject), storeOptions);
  if (!stored) return EMPTY_WORKSPACE_RECORD;
  try {
    const parsed = recordSchema.safeParse(JSON.parse(stored));
    return parsed.success ? parsed.data : EMPTY_WORKSPACE_RECORD;
  } catch {
    return EMPTY_WORKSPACE_RECORD;
  }
}

export async function saveWorkspaceRecord(subject: string, record: WorkspaceRecord): Promise<void> {
  await SecureStore.setItemAsync(await recordKey(subject), JSON.stringify(record), storeOptions);
}

export async function clearWorkspaceRecord(subject: string): Promise<void> {
  await SecureStore.deleteItemAsync(await recordKey(subject), storeOptions);
}

/** Every local file the person has: the personal one first, then one per known family. */
export function workspaceSubjects(subject: string, record: WorkspaceRecord): string[] {
  return [subject, ...record.families.map((family) => familySubject(subject, family.id))];
}

/**
 * Folds a fresh workspace list from the Worker into the record. Families the person left or was
 * removed from are returned as `gone`, for the caller to delete their files; showing one of them
 * falls back to personal.
 */
export function mergeWorkspaceList(
  record: WorkspaceRecord,
  workspaces: readonly WorkspaceSummary[],
): { record: WorkspaceRecord; gone: string[] } {
  const families = workspaces.filter((workspace) => workspace.kind === "family");
  const ids = new Set(families.map((family) => family.id));
  const gone = record.families.filter((family) => !ids.has(family.id)).map((family) => family.id);
  return {
    record: {
      active: record.active && ids.has(record.active) ? record.active : null,
      families,
      synced: record.synced.filter((id) => ids.has(id)),
      closing: Object.fromEntries(Object.entries(record.closing).filter(([id]) => ids.has(id))),
    },
    gone,
  };
}

/**
 * Whether a family can be opened now. Its first open downloads it, so a family that never
 * finished a sync on this phone needs a connection; after that it opens offline.
 */
export function familyOpenable(
  familyId: string,
  synced: readonly string[],
  reachable: boolean | null,
): boolean {
  return synced.includes(familyId) || reachable !== false;
}
