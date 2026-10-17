import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { FamilyDetail } from "@zoption/shared";
import { X } from "lucide-react";

import { removeFamilySharedBalance } from "../../lib/api";
import { formatMoney } from "../../lib/formatters";
import { queryKeys } from "../../lib/queryKeys";
import type { AuthenticatedWorkspace } from "../../lib/workspace";
import { useFamily, useFamilySharedBalances } from "../../queries/families";
import { formatFamilyDate } from "./familyLabels";
import "./SharedBalancesCard.css";

function sharerLabel(detail: FamilyDetail | undefined, userId: string, me: string): string {
  if (userId === me) return "You";
  const member = detail?.members.find((item) => item.userId === userId);
  if (!member) return "A former member";
  return member.email ?? "A family member";
}

/**
 * Personal balances members chose to show the family. They sit beside the family's own
 * accounts, never inside "Left": the money is still in each person's own account.
 */
export function SharedBalancesCard({ family }: { family: AuthenticatedWorkspace }) {
  const queryClient = useQueryClient();
  const balances = useFamilySharedBalances(family).data ?? [];
  const detail = useFamily(family).data;
  const me = family.userId;
  const remove = useMutation({
    mutationFn: (shareId: string) => removeFamilySharedBalance(family, shareId),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: queryKeys.familySharedBalances(family) }),
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
                {sharerLabel(detail, balance.sharedByUserId, me)}
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
                onClick={() => remove.mutate(balance.id)}
                disabled={remove.isPending}
                aria-label={`Remove ${balance.accountName} from the family`}
                title="Remove from the family"
              >
                <X size={14} aria-hidden="true" />
              </button>
            )}
          </li>
        ))}
      </ul>
      {remove.error && (
        <p className="form-error" role="alert">
          {remove.error.message}
        </p>
      )}
    </section>
  );
}
