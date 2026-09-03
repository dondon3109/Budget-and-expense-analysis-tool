import React, { useState, useEffect } from 'react';
import type { AccountRecord, CategoryRecord } from '@zoption/shared';
import './SmsQuickPasteModal.css';

export interface ParsedSmsTransaction {
  amount?: number;
  type: 'expense' | 'income' | 'transfer';
  merchant?: string;
  account?: string;
  date?: string;
  rawText: string;
}

export interface SmsQuickPasteModalProps {
  isOpen: boolean;
  onClose: () => void;
  onApply: (transaction: ParsedSmsTransaction) => void;
  initialText?: string;
  categories?: CategoryRecord[];
  accounts?: AccountRecord[];
}

export function parseSmsText(text: string): ParsedSmsTransaction {
  const clean = text.trim();
  const lower = clean.toLowerCase();

  // Determine transaction type
  let type: 'expense' | 'income' | 'transfer' = 'expense';
  if (
    lower.includes('credited') ||
    lower.includes('received') ||
    lower.includes('deposit') ||
    lower.includes('refund') ||
    lower.includes('cashback')
  ) {
    type = 'income';
  } else if (lower.includes('transfer') || lower.includes('sent to')) {
    type = 'transfer';
  }

  // Extract amount
  let amount: number | undefined;
  const keywordAmountRegex =
    /(?:debited|credited|spent|paid|purchase of|sent|withdrawn|charged|amounting to|for)\s*(?:(?:by|of|for|rs\.?|usd|\$|€|£|₹)\s*)?([0-9,]{1,15}(?:\.[0-9]{1,2})?)/i;

  const keywordMatch = clean.match(keywordAmountRegex);
  if (keywordMatch && keywordMatch[1]) {
    const rawVal = keywordMatch[1].replace(/,/g, '');
    const parsed = parseFloat(rawVal);
    if (!isNaN(parsed)) {
      amount = parsed;
    }
  } else {
    const amountRegex =
      /(?:[$€£₹]|USD|EUR|GBP|INR|RS\.?|AUD|CAD|SGD|HKD)?\s*([0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]{1,2})?|[0-9]+(?:\.[0-9]{1,2})?)\s*(?:USD|EUR|GBP|INR|RS\.?|AUD|CAD|SGD|HKD)?/i;
    const amountMatch = clean.match(amountRegex);
    if (amountMatch && amountMatch[1]) {
      const rawVal = amountMatch[1].replace(/,/g, '');
      const parsed = parseFloat(rawVal);
      if (!isNaN(parsed) && parsed > 0) {
        amount = parsed;
      }
    }
  }

  // Extract merchant / recipient / counterparty
  let merchant: string | undefined;
  const merchantRegex =
    /(?:at|to|for|merchant|info|vpa|in\*)\s+([A-Za-z0-9._&'-]+(?:[ \t]+[A-Za-z0-9._&'-]+){0,4}?)(?=\s+(?:on|using|via|with|from|through|ref|bal|avl|card|a\/c|acc|ending|dated|\.|\n|$))/i;
  const merchantMatch = clean.match(merchantRegex);
  if (merchantMatch && merchantMatch[1]) {
    const m = merchantMatch[1].trim().replace(/[.,]$/, '');
    if (m && !/^(the|a|an|your|card|bank|account)$/i.test(m)) {
      merchant = m;
    }
  }

  // Extract account / card info
  let account: string | undefined;
  const accountRegex =
    /(?:a\/c|acc|account|card|ending(?:\s+in)?)\s*(?:(?:no\.?|num\.?)\s*)?[*xX.-]*([0-9]{3,4})/i;
  const accountMatch = clean.match(accountRegex);
  if (accountMatch && accountMatch[1]) {
    account = `*${accountMatch[1]}`;
  }

  // Extract date if present, or default to current ISO date (YYYY-MM-DD)
  let date: string = new Date().toISOString().split('T')[0] ?? '';
  const dateRegex =
    /(?:on|dated)\s*([0-9]{4}[-/.][0-9]{1,2}[-/.][0-9]{1,2}|[0-9]{1,2}[-/.][0-9]{1,2}[-/.][0-9]{2,4}|[0-9]{1,2}-[A-Za-z]{3}(?:-[0-9]{2,4})?)/i;
  const dateMatch = clean.match(dateRegex);
  if (dateMatch && dateMatch[1]) {
    const rawDateStr = dateMatch[1];
    // If already YYYY-MM-DD format
    if (/^\d{4}-\d{2}-\d{2}$/.test(rawDateStr)) {
      date = rawDateStr;
    } else {
      const parsedDate = new Date(rawDateStr);
      if (!isNaN(parsedDate.getTime())) {
        date = parsedDate.toISOString().split('T')[0] ?? '';
      }
    }
  }

  return {
    amount,
    type,
    merchant,
    account,
    date,
    rawText: text,
  };
}

export const SmsQuickPasteModal: React.FC<SmsQuickPasteModalProps> = ({
  isOpen,
  onClose,
  onApply,
  initialText = '',
}) => {
  const [smsText, setSmsText] = useState(initialText);
  const [parsedData, setParsedData] = useState<ParsedSmsTransaction>(() =>
    parseSmsText(initialText)
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
    setSmsText('');
    setParsedData(parseSmsText(''));
  };

  const handleFieldChange = (
    field: keyof ParsedSmsTransaction,
    value: string | number | undefined
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
                <button
                  type="button"
                  className="sms-tool-btn"
                  onClick={handlePasteClipboard}
                >
                  Paste from Clipboard
                </button>
                <button
                  type="button"
                  className="sms-tool-btn"
                  onClick={handleClear}
                >
                  Clear
                </button>
              </div>
            </div>

            <div className="sms-preview-section">
              <div className="sms-preview-header">
                <h3 className="sms-preview-title">Extracted Details</h3>
                <span
                  className={`sms-badge-type sms-badge-${parsedData.type || 'expense'}`}
                >
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
                    value={parsedData.amount ?? ''}
                    onChange={(e) =>
                      handleFieldChange(
                        'amount',
                        e.target.value ? parseFloat(e.target.value) : undefined
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
                    onChange={(e) =>
                      handleFieldChange('type', e.target.value)
                    }
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
                    value={parsedData.merchant ?? ''}
                    onChange={(e) =>
                      handleFieldChange('merchant', e.target.value)
                    }
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
                    value={parsedData.account ?? ''}
                    onChange={(e) =>
                      handleFieldChange('account', e.target.value)
                    }
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
                    value={parsedData.date ?? ''}
                    onChange={(e) =>
                      handleFieldChange('date', e.target.value)
                    }
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="sms-modal-footer">
            <button
              type="button"
              className="sms-btn-cancel"
              onClick={onClose}
            >
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
