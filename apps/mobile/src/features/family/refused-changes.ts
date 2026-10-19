import type { WorkspaceAccessCode } from "@/api/mobile-sync";
import type { SyncEntityType } from "@/db/sync-repository";

const NOUNS: Record<SyncEntityType, readonly [string, string]> = {
  account: ["account", "accounts"],
  category: ["category", "categories"],
  transaction: ["entry", "entries"],
  transfer: ["transfer", "transfers"],
  budget: ["budget", "budgets"],
  goal: ["goal", "goals"],
  debt: ["debt", "debts"],
  subscription: ["subscription", "subscriptions"],
  event: ["event", "events"],
  remittance: ["remittance", "remittances"],
};

/**
 * What to tell someone whose family stopped accepting their changes, naming what was dropped
 * from this phone ("2 entries, 1 remittance").
 */
export function describeRefusedChanges(
  code: WorkspaceAccessCode,
  familyName: string,
  pending: Partial<Record<SyncEntityType, number>>,
): { title: string; message: string } {
  const dropped = (Object.keys(NOUNS) as SyncEntityType[])
    .filter((type) => (pending[type] ?? 0) > 0)
    .map((type) => {
      const count = pending[type] ?? 0;
      return `${count} ${NOUNS[type][count === 1 ? 0 : 1]}`;
    })
    .join(", ");
  const lost = dropped ? ` These changes were not saved: ${dropped}.` : "";
  if (code === "workspace_forbidden") {
    return {
      title: `You're no longer in ${familyName}`,
      message: `Its copy on this phone was removed.${lost}`,
    };
  }
  if (code === "workspace_read_only") {
    return {
      title: `You can now only view ${familyName}`,
      message: `This phone now shows what the family has.${lost}`,
    };
  }
  return {
    title: `${familyName} is closing`,
    message: `It no longer takes changes. You can still view and export it.${lost}`,
  };
}
