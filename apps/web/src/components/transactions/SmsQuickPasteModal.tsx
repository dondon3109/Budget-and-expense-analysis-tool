import React, { useState, useEffect, useMemo } from "react";
import {
  parseSmsNotification,
  type AccountRecord,
  type CategoryRecord,
  type TransactionListItem,
} from "@zoption/shared";
import "./SmsQuickPasteModal.css";

export interface ParsedSmsTransaction {
  amount?: number;
  type: "expense" | "income" | "transfer";
  merchant?: string;
  account?: string;
  date?: string;
  rawText: string;
  suggestedCategory?: string;
  referenceNumber?: string;
  channel?: string;
  currency?: string;
}

export interface SmsQuickPasteModalProps {
  isOpen: boolean;
  onClose: () => void;
  onApply: (transaction: ParsedSmsTransaction) => void;
  initialText?: string;
  categories?: CategoryRecord[];
  accounts?: AccountRecord[];
  existingTransactions?: TransactionListItem[];
}

export function parseSmsText(text: string): ParsedSmsTransaction {
  const clean = text.trim();
  if (!clean) {
    return {
      amount: undefined,
      type: "expense",
      merchant: undefined,
      account: undefined,
      date: new Date().toISOString().split("T")[0] ?? "",
      rawText: text,
    };
  }

  const result = parseSmsNotification(clean);
  if (!result) {
    return {
      amount: undefined,
      type: "expense",
      merchant: undefined,
      account: undefined,
      date: new Date().toISOString().split("T")[0] ?? "",
      rawText: text,
    };
  }

  return {
    amount: result.amountMinor / 100,
    type: result.type,
    merchant: result.payeeOrMerchant,
    account: result.accountSuffix,
    date: result.date,
    rawText: text,
    suggestedCategory: result.suggestedCategory,
    referenceNumber: result.referenceNumber,
    channel: result.channel,
    currency: result.currency,
  };
}

export const SmsQuickPasteModal: React.FC<SmsQuickPasteModalProps> = ({
  isOpen,
  onClose,
  onApply,
  initialText = "",
  existingTransactions,
}) => {
  const [smsText, setSmsText] = useState(initialText);
  const [parsedData, setParsedData] = useState<ParsedSmsTransaction>(() =>
    parseSmsText(initialText),
  );

  useEffect(() => {
    if (isOpen) {
      setSmsText(initialText);
      setParsedData(parseSmsText(initialText));
    }
  }, [isOpen, initialText]);

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const text = e.target.value;
    setSmsText(text);
    setParsedData(parseSmsText(text));
  };

  const handlePasteClipboard = async () => {
    if (navigator?.clipboard?.readText) {
      try {
        const text = await navigator.clipboard.readText();
        setSmsText(text);
        setParsedData(parseSmsText(text));
      } catch {
        // Clipboard read permission denied or unavailable
      }
    }
  };

  const handleClear = () => {
    setSmsText("");
    setParsedData(parseSmsText(""));
  };

  const handleFieldChange = (
    field: keyof ParsedSmsTransaction,
    value: string | number | undefined,
  ) => {
    setParsedData((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onApply(parsedData);
    onClose();
  };

  const duplicateWarning = useMemo(() => {
    if (!parsedData.amount || !existingTransactions?.length) return null;
    const minor = Math.round(parsedData.amount * 100);
    return existingTransactions.find((tx) => {
      if (parsedData.referenceNumber && tx.notes?.includes(parsedData.referenceNumber)) {
        return true;
      }
      return (
        tx.date === parsedData.date &&
        Math.abs(tx.amountMinor) === minor &&
        Boolean(parsedData.merchant) &&
        (tx.description.toLowerCase().includes((parsedData.merchant ?? "").toLowerCase()) ||
          (parsedData.merchant ?? "").toLowerCase().includes(tx.description.toLowerCase()))
      );
    });
  }, [parsedData, existingTransactions]);

  if (!isOpen) {
    return null;
  }

  return (
    <div
      className="sms-modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="sms-modal-title"
    >
      <div className="sms-modal-container">
        <div className="sms-modal-header">
          <h2 id="sms-modal-title" className="sms-modal-title">
            Quick Paste from SMS / Alert
          </h2>
          <button
            type="button"
            className="sms-modal-close-btn"
            onClick={onClose}
            aria-label="Close"
          >
            &times;
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="sms-modal-body">
            <div className="sms-input-group">
              <label htmlFor="sms-textarea-input" className="sms-label">
                Paste SMS or Notification Text
              </label>
              <div className="sms-textarea-wrapper">
                <textarea
                  id="sms-textarea-input"
                  className="sms-textarea"
                  value={smsText}
                  onChange={handleTextChange}
                  placeholder="e.g. Your card ending in 4321 was charged $42.50 at Target on 2026-09-02."
                  rows={4}
                />
              </div>
              <div className="sms-paste-tools">
                <button type="button" className="sms-tool-btn" onClick={handlePasteClipboard}>
                  Paste from Clipboard
                </button>
                <button type="button" className="sms-tool-btn" onClick={handleClear}>
                  Clear
                </button>
              </div>
            </div>

            {duplicateWarning && (
              <div className="sms-duplicate-alert" role="alert">
                <strong>Possible duplicate:</strong> A transaction matching this amount and date was
                already recorded ({duplicateWarning.description} on {duplicateWarning.date}).
              </div>
            )}

            <div className="sms-preview-section">
              <div className="sms-preview-header">
                <h3 className="sms-preview-title">Extracted Details</h3>
                <span className={`sms-badge-type sms-badge-${parsedData.type || "expense"}`}>
                  {parsedData.type}
                </span>
              </div>

              <div className="sms-grid">
                <div className="sms-input-group">
                  <label htmlFor="sms-amount" className="sms-label">
                    Amount
                  </label>
                  <input
                    id="sms-amount"
                    type="number"
                    step="any"
                    className="sms-form-input"
                    value={parsedData.amount ?? ""}
                    onChange={(e) =>
                      handleFieldChange(
                        "amount",
                        e.target.value ? parseFloat(e.target.value) : undefined,
                      )
                    }
                    placeholder="0.00"
                    required
                  />
                </div>

                <div className="sms-input-group">
                  <label htmlFor="sms-type" className="sms-label">
                    Type
                  </label>
                  <select
                    id="sms-type"
                    className="sms-select"
                    value={parsedData.type}
                    onChange={(e) => handleFieldChange("type", e.target.value)}
                  >
                    <option value="expense">Expense</option>
                    <option value="income">Income</option>
                    <option value="transfer">Transfer</option>
                  </select>
                </div>

                <div className="sms-input-group sms-grid-full">
                  <label htmlFor="sms-merchant" className="sms-label">
                    Merchant / Description
                  </label>
                  <input
                    id="sms-merchant"
                    type="text"
                    className="sms-form-input"
                    value={parsedData.merchant ?? ""}
                    onChange={(e) => handleFieldChange("merchant", e.target.value)}
                    placeholder="e.g. Target, Uber, Salary"
                  />
                </div>

                <div className="sms-input-group">
                  <label htmlFor="sms-account" className="sms-label">
                    Account / Card
                  </label>
                  <input
                    id="sms-account"
                    type="text"
                    className="sms-form-input"
                    value={parsedData.account ?? ""}
                    onChange={(e) => handleFieldChange("account", e.target.value)}
                    placeholder="*1234"
                  />
                </div>

                <div className="sms-input-group">
                  <label htmlFor="sms-date" className="sms-label">
                    Date
                  </label>
                  <input
                    id="sms-date"
                    type="date"
                    className="sms-form-input"
                    value={parsedData.date ?? ""}
                    onChange={(e) => handleFieldChange("date", e.target.value)}
                  />
                </div>

                {parsedData.referenceNumber ? (
                  <div className="sms-input-group">
                    <label htmlFor="sms-ref" className="sms-label">
                      Reference No.
                    </label>
                    <input
                      id="sms-ref"
                      type="text"
                      className="sms-form-input"
                      value={parsedData.referenceNumber}
                      readOnly
                    />
                  </div>
                ) : null}

                {parsedData.suggestedCategory ? (
                  <div className="sms-input-group">
                    <label className="sms-label">Suggested Category</label>
                    <div className="sms-badge-category">{parsedData.suggestedCategory}</div>
                  </div>
                ) : null}
              </div>
            </div>
          </div>

          <div className="sms-modal-footer">
            <button type="button" className="sms-btn-cancel" onClick={onClose}>
              Cancel
            </button>
            <button
              type="submit"
              className="sms-btn-apply"
              disabled={parsedData.amount === undefined || isNaN(parsedData.amount)}
            >
              Apply Transaction
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default SmsQuickPasteModal;
