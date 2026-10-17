import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  currencies,
  currencyMetadata,
  parseAmountToMinor,
  type Currency,
  type FamilyRemittance,
  type FamilyRemittanceReceiveInput,
} from "@zoption/shared";
import { X } from "lucide-react";
import { useId, useRef, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";

import { useFocusTrap } from "../../hooks/useFocusTrap";
import { useRootLock } from "../../hooks/useRootLock";
import { receiveRemittance, sendRemittance } from "../../lib/api";
import { localIsoDate } from "../../lib/calendar";
import { formatMoney } from "../../lib/formatters";
import type { AuthenticatedWorkspace } from "../../lib/workspace";
import { useAccounts } from "../../queries/accounts";
import { useCategories } from "../../queries/categories";
import { invalidateAfterRemittanceWrite } from "../../queries/remittances";

const PROVIDERS = ["Wise", "Remitly", "Western Union", "GCash", "Palawan Express", "Bank transfer"];

/** Returns minor units, or null while the text is not a positive amount. */
function positiveAmount(text: string): number | null {
  try {
    const value = parseAmountToMinor(text);
    return value > 0 ? value : null;
  } catch {
    return null;
  }
}

/**
 * Records money sent home (`remittance` omitted) or confirms what arrived for a pending send.
 * A send can also be recorded as already arrived, which does both steps at once.
 */
export function RemittanceDialog({
  family,
  familyCurrency,
  remittance,
  onClose,
}: {
  family: AuthenticatedWorkspace;
  familyCurrency: Currency;
  remittance?: FamilyRemittance;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const dialogRef = useRef<HTMLElement>(null);
  const titleId = useId();
  const today = localIsoDate();
  const [sentAmount, setSentAmount] = useState("");
  const [sentCurrency, setSentCurrency] = useState<Currency>("USD");
  const [fee, setFee] = useState("");
  const [provider, setProvider] = useState("");
  const [sentOn, setSentOn] = useState(today);
  const [note, setNote] = useState("");
  const [arrived, setArrived] = useState(Boolean(remittance));
  const [receivedAmount, setReceivedAmount] = useState("");
  const [receivedOn, setReceivedOn] = useState(today);
  const [chosenAccountId, setChosenAccountId] = useState("");
  const [chosenCategoryId, setChosenCategoryId] = useState("");
  const accounts = useAccounts(family).data?.filter((account) => !account.archived) ?? [];
  const incomeCategories =
    useCategories(family).data?.filter(
      (category) => category.kind === "income" && !category.archived,
    ) ?? [];

  useRootLock(true);
  const handleKeyDown = useFocusTrap(dialogRef, { onEscape: onClose });

  // Until picked: the first account, and an income category about remittances when one exists,
  // else Uncategorized.
  const accountId = chosenAccountId || accounts[0]?.id || "";
  const categoryId =
    chosenCategoryId ||
    incomeCategories.find((category) => /remit|padala|allowance/iu.test(category.name))?.id ||
    incomeCategories.find((category) => category.systemKey === "uncategorized:income")?.id ||
    incomeCategories[0]?.id ||
    "";
  const sentMinor = positiveAmount(sentAmount);
  const feeMinor = fee.trim() ? positiveAmount(fee) : 0;
  const receivedMinor = positiveAmount(receivedAmount);

  const save = useMutation({
    mutationFn: () => {
      const received: FamilyRemittanceReceiveInput | undefined =
        arrived && receivedMinor
          ? { amountMinor: receivedMinor, accountId, categoryId, date: receivedOn }
          : undefined;
      if (remittance) return receiveRemittance(family, remittance.id, received!);
      return sendRemittance(family, {
        sentAmountMinor: sentMinor!,
        sentCurrency,
        ...(feeMinor ? { feeMinor } : {}),
        ...(provider.trim() ? { provider: provider.trim() } : {}),
        sentOn,
        ...(note.trim() ? { note: note.trim() } : {}),
        ...(received ? { received } : {}),
      });
    },
    onSuccess: async () => {
      await invalidateAfterRemittanceWrite(queryClient, family);
      onClose();
    },
  });

  const sendValid = Boolean(remittance) || (sentMinor !== null && feeMinor !== null);
  const arrivalValid = !arrived || (receivedMinor !== null && accountId && categoryId);

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (sendValid && arrivalValid) save.mutate();
  }

  return createPortal(
    <div className="modal-backdrop" role="presentation">
      <section
        ref={dialogRef}
        className="form-modal remittance-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onKeyDown={handleKeyDown}
      >
        <header className="modal-header">
          <div>
            <p className="eyebrow">Remittance</p>
            <h2 id={titleId}>{remittance ? "Confirm what arrived" : "Record money sent home"}</h2>
          </div>
          <button className="icon-button" type="button" onClick={onClose}>
            <X size={18} aria-hidden="true" />
            <span className="sr-only">Close</span>
          </button>
        </header>

        <form className="transaction-form" onSubmit={handleSubmit}>
          {remittance ? (
            <p className="remittance-dialog-summary">
              {formatMoney(remittance.sentAmountMinor, remittance.sentCurrency)} sent
              {remittance.provider ? ` via ${remittance.provider}` : ""} on {remittance.sentOn}.
            </p>
          ) : (
            <>
              <div className="form-row split">
                <label>
                  <span>Amount sent</span>
                  <input
                    inputMode="decimal"
                    value={sentAmount}
                    onChange={(event) => setSentAmount(event.target.value)}
                    placeholder="0.00"
                    aria-invalid={Boolean(sentAmount) && sentMinor === null}
                    required
                  />
                </label>
                <label>
                  <span>Currency sent</span>
                  <select
                    value={sentCurrency}
                    onChange={(event) => setSentCurrency(event.target.value as Currency)}
                  >
                    {currencies.map((option) => (
                      <option key={option} value={option}>
                        {currencyMetadata[option].label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="form-row split">
                <label>
                  <span>Sent with (optional)</span>
                  <input
                    list={`${titleId}-providers`}
                    value={provider}
                    maxLength={60}
                    onChange={(event) => setProvider(event.target.value)}
                  />
                  <datalist id={`${titleId}-providers`}>
                    {PROVIDERS.map((name) => (
                      <option key={name} value={name} />
                    ))}
                  </datalist>
                </label>
                <label>
                  <span>Fee (optional, {sentCurrency})</span>
                  <input
                    inputMode="decimal"
                    value={fee}
                    onChange={(event) => setFee(event.target.value)}
                    placeholder="0.00"
                    aria-invalid={feeMinor === null}
                  />
                </label>
              </div>
              <div className="form-row split">
                <label>
                  <span>Sent on</span>
                  <input
                    type="date"
                    value={sentOn}
                    max={today}
                    onChange={(event) => setSentOn(event.target.value)}
                    required
                  />
                </label>
                <label>
                  <span>Note (optional)</span>
                  <input
                    value={note}
                    maxLength={240}
                    onChange={(event) => setNote(event.target.value)}
                  />
                </label>
              </div>
              <label className="checkbox-inline">
                <input
                  type="checkbox"
                  checked={arrived}
                  onChange={() => setArrived((current) => !current)}
                />
                <span>It already arrived</span>
              </label>
            </>
          )}

          {arrived && (
            <>
              <div className="form-row split">
                <label>
                  <span>Amount that arrived ({familyCurrency})</span>
                  <input
                    inputMode="decimal"
                    value={receivedAmount}
                    onChange={(event) => setReceivedAmount(event.target.value)}
                    placeholder="0.00"
                    aria-invalid={Boolean(receivedAmount) && receivedMinor === null}
                    required
                  />
                </label>
                <label>
                  <span>Arrived on</span>
                  <input
                    type="date"
                    value={receivedOn}
                    max={today}
                    onChange={(event) => setReceivedOn(event.target.value)}
                    required
                  />
                </label>
              </div>
              <div className="form-row split">
                <label>
                  <span>Family account</span>
                  <select
                    value={accountId}
                    onChange={(event) => setChosenAccountId(event.target.value)}
                    required
                  >
                    {accounts.map((account) => (
                      <option key={account.id} value={account.id}>
                        {account.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>Income category</span>
                  <select
                    value={categoryId}
                    onChange={(event) => setChosenCategoryId(event.target.value)}
                    required
                  >
                    {incomeCategories.map((category) => (
                      <option key={category.id} value={category.id}>
                        {category.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </>
          )}

          {save.error && (
            <p className="form-error" role="alert">
              {save.error.message}
            </p>
          )}
          <div className="modal-actions">
            <button className="button secondary" type="button" onClick={onClose}>
              Cancel
            </button>
            <button
              className="button primary"
              type="submit"
              disabled={save.isPending || !sendValid || !arrivalValid}
            >
              {save.isPending ? "Saving…" : remittance ? "Confirm received" : "Save"}
            </button>
          </div>
        </form>
      </section>
    </div>,
    document.body,
  );
}
