import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { User } from "@supabase/supabase-js";
import type { WorkspaceSummary } from "@zoption/shared";
import { Users } from "lucide-react";
import { useState, type FormEvent } from "react";

import { shareBalanceToFamily, shareTransactionToFamily, stopBalanceShare } from "../../lib/api";
import { familyWorkspace, userWorkspace } from "../../lib/workspace";
import { useAccounts } from "../../queries/accounts";
import { useCategories } from "../../queries/categories";
import { invalidateAfterShare, useMyBalanceShares } from "../../queries/families";
import type { ShareTarget } from "./ShareLinkModal";

interface ShareToFamilyFormProps {
  user: User;
  target: ShareTarget;
  /** Families the person can write to: owner or member, never viewer. */
  families: WorkspaceSummary[];
  onClose: () => void;
}

/**
 * The share sheet's family destination. A transaction becomes a one-time copy in a family
 * account and category the person picks; a balance becomes a live card on the family Home.
 */
export function ShareToFamilyForm({ user, target, families, onClose }: ShareToFamilyFormProps) {
  const queryClient = useQueryClient();
  const personal = userWorkspace(user);
  const [familyId, setFamilyId] = useState(families[0]!.id);
  const [chosenAccountId, setChosenAccountId] = useState("");
  const [chosenCategoryId, setChosenCategoryId] = useState("");
  const [includeNotes, setIncludeNotes] = useState(false);
  const family = familyWorkspace(user, familyId);
  const familyName = families.find((item) => item.id === familyId)?.name ?? "the family";
  const source = target.kind === "transaction" ? target : null;
  const isTransaction = source !== null;
  const accounts = useAccounts(family).data?.filter((account) => !account.archived) ?? [];
  const categories =
    useCategories(family).data?.filter(
      (category) => category.kind === source?.direction && !category.archived,
    ) ?? [];

  // Until the person picks, the copy goes to the family's first account and to the family
  // category with the same name, when there is one.
  const accountId = chosenAccountId || accounts[0]?.id || "";
  const categoryId =
    chosenCategoryId ||
    categories.find(
      (category) => category.name.toLowerCase() === source?.categoryName.toLowerCase(),
    )?.id ||
    "";

  const share = useMutation({
    mutationFn: () =>
      source
        ? shareTransactionToFamily(family, {
            transactionId: source.id,
            accountId,
            categoryId,
            includeNotes,
          }).then(() => undefined)
        : shareBalanceToFamily(family, target.id),
    onSuccess: () => invalidateAfterShare(queryClient, personal, family),
  });
  // Stopping lives here too: the share button is the account's way into its family sharing.
  const liveShare = useMyBalanceShares(personal).data?.find(
    (item) => !source && item.accountId === target.id && item.familyId === familyId,
  );
  const stop = useMutation({
    mutationFn: (shareId: string) => stopBalanceShare(personal, shareId),
    onSuccess: () => invalidateAfterShare(queryClient, personal, family),
  });

  function chooseFamily(id: string) {
    setFamilyId(id);
    setChosenAccountId("");
    setChosenCategoryId("");
    share.reset();
    stop.reset();
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    share.mutate();
  }

  if (stop.isSuccess) {
    return (
      <section className="share-budget-generated" aria-live="polite">
        <p>{`${familyName} keeps the balance as it is now, and stops seeing changes.`}</p>
        <div className="share-budget-actions">
          <button className="share-budget-primary-button" type="button" onClick={onClose}>
            Done
          </button>
        </div>
      </section>
    );
  }

  if (share.isSuccess) {
    return (
      <section className="share-budget-generated" aria-live="polite">
        <p>
          {isTransaction
            ? `Copied to ${familyName}. Changing it here later will not change the copy.`
            : `${familyName} now sees this balance as it changes. Stop any time from this share button.`}
        </p>
        <div className="share-budget-actions">
          <button className="share-budget-primary-button" type="button" onClick={onClose}>
            Done
          </button>
        </div>
      </section>
    );
  }

  return (
    <form className="share-family-form" onSubmit={handleSubmit}>
      {families.length > 1 && (
        <label className="share-budget-field">
          <span>Family</span>
          <select value={familyId} onChange={(event) => chooseFamily(event.target.value)}>
            {families.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
      )}

      {source ? (
        <>
          <div className="share-budget-two-column">
            <label className="share-budget-field">
              <span>Family account</span>
              <select
                required
                value={accountId}
                onChange={(event) => setChosenAccountId(event.target.value)}
              >
                {accounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="share-budget-field">
              <span>Family category</span>
              <select
                required
                value={categoryId}
                onChange={(event) => setChosenCategoryId(event.target.value)}
              >
                <option value="" disabled>
                  Choose a category
                </option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {source.hasNote && (
            <label className="share-budget-category-option">
              <input
                type="checkbox"
                checked={includeNotes}
                onChange={() => setIncludeNotes((current) => !current)}
              />
              <span>
                <strong>Copy my note</strong>
              </span>
            </label>
          )}
          <p className="share-family-hint">
            The family gets its own copy, counted in its budgets. It never sees your account.
          </p>
        </>
      ) : liveShare ? (
        <p className="share-family-hint">
          {familyName} sees this balance now. Stopping keeps the card at today&apos;s balance.
        </p>
      ) : (
        <p className="share-family-hint">
          {familyName} sees this account&apos;s name and balance, updated as it changes, until you
          stop sharing. Nothing else from your workspace is shown.
        </p>
      )}

      {(share.error ?? stop.error) && (
        <p className="share-budget-error" role="alert">
          {(share.error ?? stop.error)?.message}
        </p>
      )}

      <footer className="share-budget-actions">
        <button className="share-budget-secondary-button" type="button" onClick={onClose}>
          Cancel
        </button>
        {liveShare ? (
          <button
            className="share-budget-primary-button"
            type="button"
            disabled={stop.isPending}
            onClick={() => stop.mutate(liveShare.id)}
          >
            {stop.isPending ? "Stopping…" : "Stop sharing"}
          </button>
        ) : (
          <button
            className="share-budget-primary-button"
            type="submit"
            disabled={share.isPending || (isTransaction && (!accountId || !categoryId))}
          >
            <Users size={16} aria-hidden="true" />
            {share.isPending ? "Sharing…" : `Share to ${familyName}`}
          </button>
        )}
      </footer>
    </form>
  );
}
