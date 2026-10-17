import type { TransactionListItem } from "@zoption/shared";

import { useActiveWorkspace } from "../components/layout/ActiveWorkspaceProvider";
import { useFamily } from "../queries/families";

/**
 * What a ledger row says about sharing, and whether this person may change it. Personal rows
 * name the families they were copied into; family rows name who added them, and a member
 * changes only their own (the server enforces the same rule).
 */
export function useTransactionSharing() {
  const { personal, workspace, family, workspaces } = useActiveWorkspace();
  const detail = useFamily(family ? workspace : undefined).data;

  function memberLabel(userId: string): string {
    const member = detail?.members.find((item) => item.userId === userId);
    if (!member) return "a former member";
    if (member.userId === personal.userId) return "you";
    return member.email ?? "a family member";
  }

  function rowNote(item: TransactionListItem): string | null {
    if (!family) {
      const names = (item.sharedToFamilyIds ?? []).flatMap((id) => {
        const name = workspaces.find((summary) => summary.id === id)?.name;
        return name ? [name] : [];
      });
      return names.length > 0 ? `Shared to ${names.join(", ")}` : null;
    }
    if (!item.authorUserId) return null;
    const who = memberLabel(item.authorUserId);
    return item.sharedCopy ? `Shared by ${who}` : `Added by ${who}`;
  }

  function canChange(item: TransactionListItem): boolean {
    return !family || family.role === "owner" || item.authorUserId === personal.userId;
  }

  return { rowNote, canChange };
}
