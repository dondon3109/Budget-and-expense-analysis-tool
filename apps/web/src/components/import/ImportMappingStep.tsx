import type { ImportMapping } from "@zoption/shared";
import { AlertTriangle, FileCheck2 } from "lucide-react";

import { useImportDraft } from "../../import/ImportDraftProvider";
import { useWorkspaceCurrency } from "../../lib/workspaceCurrency";
import {
  importPresets,
  type ImportAmountMode,
  type ImportPreset,
  type ImportPresetId,
} from "../../lib/importPresets";

interface ImportMappingStepProps {
  resolvedPreset: ImportPreset;
  requiresCurrencyConfirmation: boolean;
  canAttemptPreview: boolean;
  descriptionMappingMissing: boolean;
  previewPending: boolean;
  applyPreset: (presetId: ImportPresetId) => void;
  changeHeader: (headerRowNumber: number) => void;
  changeAmountMode: (mode: ImportAmountMode) => void;
  updateMapping: (key: keyof ImportMapping, value: string) => void;
  invalidatePreview: () => void;
  requestPreview: () => void;
}

/** Step 2: match the bank export's header row, format, amount layout, and columns. */
export function ImportMappingStep({
  resolvedPreset,
  requiresCurrencyConfirmation,
  canAttemptPreview,
  descriptionMappingMissing,
  previewPending,
  applyPreset,
  changeHeader,
  changeAmountMode,
  updateMapping,
  invalidatePreview,
  requestPreview,
}: ImportMappingStepProps) {
  const {
    headers,
    selectedPresetId,
    headerRowNumber,
    inspection,
    amountMode,
    mapping,
    fallbackDate,
    setFallbackDate,
    currencyConfirmed,
    setCurrencyConfirmed,
    previewError,
  } = useImportDraft();
  const importCurrency = useWorkspaceCurrency();

  return (
    <section className={`import-card ${headers.length === 0 ? "disabled-card" : ""}`}>
      <div className="import-step-heading">
        <span>2</span>
        <div>
          <strong>Match your bank export</strong>
          <small>Choose the header, bank format, amount layout, and columns</small>
        </div>
      </div>

      <div className="source-controls-card">
        <div className="import-source-controls">
          <label>
            <span>Bank format</span>
            <select
              aria-label="Bank format"
              value={selectedPresetId}
              disabled={headers.length === 0}
              onChange={(event) => applyPreset(event.target.value as ImportPresetId)}
            >
              <option value="auto">Auto detect</option>
              {importPresets.map((preset) => (
                <option key={preset.id} value={preset.id}>
                  {preset.label}
                </option>
              ))}
            </select>
            {selectedPresetId === "auto" && <small>Using {resolvedPreset.label}</small>}
          </label>
          <label>
            <span>Header row</span>
            <select
              aria-label="Header row"
              value={headerRowNumber ?? ""}
              disabled={!inspection}
              onChange={(event) => changeHeader(Number(event.target.value))}
            >
              {inspection?.candidates.map((candidate) => (
                <option key={candidate.rowNumber} value={candidate.rowNumber}>
                  Row {candidate.rowNumber} — {candidate.values.slice(0, 4).join(" · ")}
                </option>
              ))}
            </select>
            {headerRowNumber !== undefined && headerRowNumber > 1 && (
              <small>
                Ignoring {headerRowNumber - 1} introductory {headerRowNumber === 2 ? "row" : "rows"}
              </small>
            )}
          </label>
          <label>
            <span>Amount format</span>
            <select
              aria-label="Amount format"
              value={amountMode}
              disabled={headers.length === 0}
              onChange={(event) => changeAmountMode(event.target.value as ImportAmountMode)}
            >
              <option value="amount">One signed Amount column</option>
              <option value="debit-credit">Separate Debit and Credit columns</option>
            </select>
          </label>
        </div>

        <p className="import-preset-guidance">{resolvedPreset.guidance}</p>
      </div>

      <div className="mapping-grid">
        {(
          [
            ["date", "Date (optional)"],
            ["description", "Description"],
            ...(amountMode === "amount"
              ? ([["amount", "Amount"]] as const)
              : ([
                  ["debit", "Debit"],
                  ["credit", "Credit"],
                ] as const)),
            ["category", "Category (optional)"],
            ["kind", "Type (optional)"],
            ["currency", "Currency (optional)"],
          ] as Array<readonly [keyof ImportMapping, string]>
        ).map(([key, label]) => (
          <label
            key={key}
            className={
              key === "description" && descriptionMappingMissing
                ? "mapping-field-invalid"
                : undefined
            }
          >
            <span>{label}</span>
            <select
              value={mapping[key] ?? ""}
              disabled={headers.length === 0}
              aria-invalid={key === "description" && descriptionMappingMissing ? true : undefined}
              aria-describedby={
                key === "description" && descriptionMappingMissing
                  ? "description-mapping-error"
                  : undefined
              }
              onChange={(event) => updateMapping(key, event.target.value)}
            >
              <option value="">
                {key === "date"
                  ? "Use one date for all rows"
                  : key === "category"
                    ? "Use Uncategorized"
                    : key === "kind"
                      ? "Infer from amount"
                      : key === "currency"
                        ? `Assume ${importCurrency}`
                        : "Choose column"}
              </option>
              {headers.map((header) => (
                <option key={header} value={header}>
                  {header}
                </option>
              ))}
            </select>
            {key === "description" && descriptionMappingMissing && (
              <small id="description-mapping-error" className="mapping-field-error">
                Select a column before previewing.
              </small>
            )}
          </label>
        ))}
        {!mapping.date && (
          <label>
            <span>Date for every row</span>
            <input
              type="date"
              value={fallbackDate}
              disabled={headers.length === 0}
              onChange={(event) => {
                setFallbackDate(event.target.value);
                invalidatePreview();
              }}
            />
          </label>
        )}
      </div>

      {resolvedPreset.exportCurrency !== null && resolvedPreset.exportCurrency !== importCurrency && (
        <div className="php-import-warning" role="alert">
          <AlertTriangle size={20} />
          <div>
            <strong>{importCurrency}-only import</strong>
            <span>
              {resolvedPreset.label} exports commonly contain {resolvedPreset.exportCurrency}.
              Imports are saved in {importCurrency}, your workspace currency, without conversion,
              and any mapped currency other than {importCurrency} will be rejected.
            </span>
            {requiresCurrencyConfirmation ? (
              <label>
                <input
                  type="checkbox"
                  checked={currencyConfirmed}
                  onChange={(event) => {
                    setCurrencyConfirmed(event.target.checked);
                    invalidatePreview();
                  }}
                />
                Store these numeric values as {importCurrency} without currency conversion
              </label>
            ) : (
              <small>The mapped Currency column confirms that every row is {importCurrency}.</small>
            )}
          </div>
        </div>
      )}

      <button
        className="button primary preview-import-button"
        type="button"
        disabled={!canAttemptPreview || previewPending}
        onClick={requestPreview}
      >
        <FileCheck2 size={17} /> {previewPending ? "Checking rows…" : "Preview import"}
      </button>
      {previewError && (
        <p className="page-error" role="alert">
          {previewError.message}
        </p>
      )}
    </section>
  );
}
