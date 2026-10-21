import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { FamilySharedBalance } from "@zoption/shared";
import { X } from "lucide-react";
import { useState } from "react";

import { removeFamilySharedBalance } from "../../lib/api";
import { formatMoney } from "../../lib/formatters";
import { queryKeys } from "../../lib/queryKeys";
import type { AuthenticatedWorkspace } from "../../lib/workspace";
import { useFamily, useFamilySharedBalances } from "../../queries/families";
import { ConfirmDialog } from "../common/ConfirmDialog";
import { formatFamilyDate, memberName } from "./familyLabels";
import "./SharedBalancesCard.css";

/**
 * Personal balances members chose to show the family. They sit beside the family's own
 * accounts, never inside "Left": the money is still in each person's own account.
 */
export function SharedBalancesCard({ family }: { family: AuthenticatedWorkspace }) {
  const queryClient = useQueryClient();
  const balances = useFamilySharedBalances(family).data ?? [];
  const detail = useFamily(family).data;
  const me = family.userId;
  const [removing, setRemoving] = useState<FamilySharedBalance>();
  const remove = useMutation({
    mutationFn: (shareId: string) => removeFamilySharedBalance(family, shareId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.familySharedBalances(family) });
      setRemoving(undefined);
    },
  });

  if (balances.length === 0) return null;
  return (
    <section className="shared-balances" aria-labelledby="shared-balances-title">
      <header>
        <h2 id="shared-balances-title">Shared balances</h2>
        <p>Members&apos; own accounts, shown here by choice. Not counted in the family total.</p>
      </header>
      <ul>
        {balances.map((balance) => (
          <li key={balance.id}>
            <div>
              <strong>{balance.accountName}</strong>
              <span>
                {memberName(detail, balance.sharedByUserId, me, true)}
                {balance.stoppedAt
                  ? ` · stopped sharing ${formatFamilyDate(balance.stoppedAt)}`
                  : ""}
              </span>
            </div>
            <strong className="shared-balances-amount">
              {formatMoney(balance.balanceMinor, balance.currency)}
            </strong>
            {detail?.role === "owner" && (
              <button
                type="button"
                className="shared-balances-remove"
                onClick={() => {
                  remove.reset();
                  setRemoving(balance);
                }}
                aria-label={`Remove ${balance.accountName} from the family`}
                title="Remove from the family"
              >
                <X size={14} aria-hidden="true" />
              </button>
            )}
          </li>
        ))}
      </ul>
      {removing && (
        <ConfirmDialog
          title={`Remove ${removing.accountName}?`}
          consequence={`The family stops seeing ${removing.sharedByUserId === me ? "your" : `${memberName(detail, removing.sharedByUserId, me)}'s`} ${removing.accountName} balance. The account itself is untouched and can be shared again.`}
          confirmLabel="Remove from family"
          busyLabel="Removing…"
          busy={remove.isPending}
          error={remove.error?.message}
          onConfirm={() => remove.mutate(removing.id)}
          onClose={() => setRemoving(undefined)}
        />
      )}
    </section>
  );
}
