import {
  detectImportPreset,
  inspectCsv,
  parseCsv,
  resolvePresetMapping,
  type ImportAmountMode,
  type ImportCommitRequest,
  type ImportMapping,
  type ImportPresetId,
  type ImportPreview,
  type ImportPreviewRequest,
} from "@zoption/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  FileUp,
  LoaderCircle,
  X,
} from "lucide-react";
import { useId, useMemo, useRef, useState, type ChangeEvent, type DragEvent } from "react";
import { createPortal } from "react-dom";

import { useAuth } from "../../auth/AuthProvider";
import { useFocusTrap } from "../../hooks/useFocusTrap";
import { useRootLock } from "../../hooks/useRootLock";
import { commitImport, createAccount, getAccounts, previewImport } from "../../lib/api";
import { formatMoney } from "../../lib/formatters";
import { queryKeys } from "../../lib/queryKeys";
import { WorkbookImportClient } from "../../lib/workbookImportClient";
import { userWorkspace } from "../../lib/workspace";
import "./SpreadsheetMigrationWizard.css";

const MAX_CSV_FILE_BYTES = 2_000_000;
const MAX_WORKBOOK_FILE_BYTES = 5_000_000;

export interface SpreadsheetMigrationWizardProps {
  open: boolean;
  onClose: () => void;
  onComplete?: () => void;
}

function downloadSampleTemplate() {
  const sample = [
    "Date,Description,Amount,Category",
    '2026-07-20,"Weekend groceries",-1250.50,"Food & dining"',
    "2026-07-21,Salary deposit,25000.00,Salary",
    '2026-07-22,"Electric bill payment",-3200.00,Utilities',
    '2026-07-23,"Coffee shop",-185.00,"Food & dining"',
  ].join("\n");
  const blob = new Blob([sample], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "zoption-migration-sample.csv";
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Renders the open wizard through a mounted-only dialog so the focus trap's
 * mount effect runs when the wizard opens rather than on its first render.
 */
export function SpreadsheetMigrationWizard({
  open,
  onClose,
  onComplete,
}: SpreadsheetMigrationWizardProps) {
  if (!open) return null;
  return <SpreadsheetMigrationDialog onClose={onClose} onComplete={onComplete} />;
}

function SpreadsheetMigrationDialog({
  onClose,
  onComplete,
}: Omit<SpreadsheetMigrationWizardProps, "open">) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const workspace = user ? userWorkspace(user) : undefined;
  const fileInputId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const dropzoneButtonRef = useRef<HTMLButtonElement>(null);

  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [fileName, setFileName] = useState("");
  const [csvText, setCsvText] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [headerRowNumber, setHeaderRowNumber] = useState<number>(1);
  const [fileError, setFileError] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [fileBusy, setFileBusy] = useState(false);

  // Target account
  const [selectedAccountId, setSelectedAccountId] = useState<string>("");
  const [newAccountName, setNewAccountName] = useState("Checking Account");

  // Step 2 Mapping
  const [detectedPresetId, setDetectedPresetId] = useState<ImportPresetId>("generic");
  const [amountMode, setAmountMode] = useState<ImportAmountMode>("amount");
  const [mapping, setMapping] = useState<ImportMapping>({
    date: "",
    description: "",
    amount: "",
    debit: "",
    credit: "",
    category: "",
    kind: "",
    currency: "",
  });

  // Step 3 Review & Dedupe
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  // Accounts query
  const accountsQuery = useQuery({
    queryKey: workspace ? queryKeys.accounts(workspace) : ["accounts"],
    queryFn: () => (workspace ? getAccounts(workspace) : Promise.resolve([])),
    enabled: Boolean(workspace),
  });
  const accounts = accountsQuery.data ?? [];
  const activeAccounts = useMemo(() => accounts.filter((acc) => !acc.archived), [accounts]);

  // Set default account if none selected
  const targetAccountId = selectedAccountId || activeAccounts[0]?.id || "new";

  // Parse sample rows for interactive mapper
  const sampleRows = useMemo(() => {
    if (!csvText || headers.length === 0) return [];
    const parsed = parseCsv(csvText, { headerRowNumber });
    return parsed.rows.slice(0, 3);
  }, [csvText, headers, headerRowNumber]);

  function getSampleValue(row: { rowNumber: number; values: string[] }, colName?: string): string {
    if (!colName) return "";
    const index = headers.indexOf(colName);
    if (index === -1) return "";
    return row.values[index] ?? "";
  }

  // Handle file input
  async function handleFile(file: File) {
    setFileError(null);
    const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
    if (!["csv", "xlsx", "xls"].includes(extension)) {
      setFileError("Please upload a CSV or Excel (.xlsx/.xls) file.");
      return;
    }

    setFileBusy(true);
    try {
      let text = "";
      if (extension === "csv") {
        if (file.size > MAX_CSV_FILE_BYTES) {
          throw new Error("File exceeds 2 MB. Please select a smaller CSV.");
        }
        text = new TextDecoder("utf-8", { fatal: true }).decode(await file.arrayBuffer());
      } else {
        if (file.size > MAX_WORKBOOK_FILE_BYTES) {
          throw new Error("Excel file exceeds 5 MB. Please select a smaller file.");
        }
        const client = new WorkbookImportClient();
        try {
          const sheetNames = await client.inspect(await file.arrayBuffer());
          const firstSheet = sheetNames[0];
          if (!firstSheet) throw new Error("No worksheets found in this workbook.");
          const converted = await client.convert(firstSheet);
          text = converted.csvText;
        } finally {
          client.dispose();
        }
      }

      const inspection = inspectCsv(text);
      const rowNumber = inspection.suggestedHeaderRowNumber;
      const parsed = parseCsv(text, { headerRowNumber: rowNumber });
      if (parsed.headers.length === 0 || parsed.rows.length === 0) {
        throw new Error("Could not find tabular headers or rows in this file.");
      }

      const preset = detectImportPreset(file.name, parsed.headers);
      const suggested = resolvePresetMapping(parsed.headers, preset);

      setFileName(file.name);
      setCsvText(text);
      setHeaders(parsed.headers);
      setHeaderRowNumber(rowNumber);
      setDetectedPresetId(preset.id);
      setAmountMode(suggested.amountMode);
      setMapping(suggested.mapping);

      // Suggest clean account name from file name if new
      const cleanBaseName = file.name.replace(/\.[^/.]+$/, "").replace(/[-_]/g, " ");
      if (cleanBaseName.length > 2) {
        setNewAccountName(
          cleanBaseName.charAt(0).toUpperCase() + cleanBaseName.slice(1) + " Account",
        );
      }
    } catch (error) {
      setFileError(
        error instanceof Error
          ? error.message
          : "Failed to read this file. Ensure it is a valid UTF-8 CSV or Excel file.",
      );
    } finally {
      setFileBusy(false);
    }
  }

  function onFileInputChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (file) void handleFile(file);
  }

  function onDrop(event: DragEvent<HTMLButtonElement>) {
    event.preventDefault();
    setDragActive(false);
    const file = event.dataTransfer.files?.[0];
    if (file) void handleFile(file);
  }

  // Go to step 2
  function goToMapping() {
    if (!csvText || headers.length === 0) {
      setFileError("Please select a valid spreadsheet file first.");
      return;
    }
    setStep(2);
  }

  // Go to step 3 (Preview & Deduplication)
  async function generatePreview() {
    if (!workspace) return;
    setPreviewLoading(true);
    setPreviewError(null);

    try {
      // If user wants a new account, create it first
      let accountIdToUse = targetAccountId;
      if (accountIdToUse === "new") {
        const createdAccount = await createAccount(workspace, {
          name: newAccountName.trim() || "Imported Account",
          type: "checking",
        });
        accountIdToUse = createdAccount.id;
        setSelectedAccountId(createdAccount.id);
        await queryClient.invalidateQueries({ queryKey: queryKeys.accounts(workspace) });
      }

      const mappingPayload: ImportPreviewRequest["mapping"] = {
        description: mapping.description,
        ...(mapping.date ? { date: mapping.date } : {}),
        ...(amountMode === "amount" && mapping.amount ? { amount: mapping.amount } : {}),
        ...(amountMode === "debit-credit" && mapping.debit && mapping.credit
          ? { debit: mapping.debit, credit: mapping.credit }
          : {}),
        ...(mapping.category ? { category: mapping.category } : {}),
        ...(mapping.kind ? { kind: mapping.kind } : {}),
        ...(mapping.currency ? { currency: mapping.currency } : {}),
      };

      const previewRequest: ImportPreviewRequest = {
        fileName,
        csvText,
        headerRowNumber,
        mapping: mappingPayload,
        ...(mapping.date ? {} : { fallbackDate: new Date().toISOString().slice(0, 10) }),
      };

      const result = await previewImport(workspace, previewRequest);
      setPreview(result);
      setStep(3);
    } catch (error) {
      setPreviewError(
        error instanceof Error ? error.message : "Failed to analyze transactions and duplicates.",
      );
    } finally {
      setPreviewLoading(false);
    }
  }

  // Commit mutation
  const commitMutation = useMutation({
    mutationFn: async () => {
      if (!workspace || !preview) throw new Error("Preview is missing.");

      const commitRequest: ImportCommitRequest = {
        token: preview.token,
        categoryOverrides: [],
        kindOverrides: [],
      };

      return commitImport(workspace, commitRequest);
    },
    onSuccess: async () => {
      if (workspace) {
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: queryKeys.allTransactions(workspace) }),
          queryClient.invalidateQueries({ queryKey: queryKeys.dashboard(workspace) }),
          queryClient.invalidateQueries({ queryKey: queryKeys.accounts(workspace) }),
          queryClient.invalidateQueries({ queryKey: queryKeys.categories(workspace) }),
        ]);
      }
      setStep(4);
    },
  });

  useRootLock(true);

  const handleKeyDown = useFocusTrap(dialogRef, {
    initialFocusRef: dropzoneButtonRef,
    onEscape: () => {
      if (fileBusy || previewLoading || commitMutation.isPending) return;
      onClose();
    },
  });

  function handleComplete() {
    onClose();
    if (onComplete) onComplete();
  }

  // Portalled so the inert application root from useRootLock does not disable the wizard.
  return createPortal(
    <div
      ref={dialogRef}
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="wizard-title"
      onKeyDown={handleKeyDown}
    >
      <div className="migration-wizard-modal">
        <header className="migration-header">
          <div className="migration-header-titles">
            <h2 id="wizard-title">Spreadsheet Migration Wizard</h2>
            <p>Import your Excel, CSV, or bank export in 3 guided steps</p>
          </div>
          <button
            type="button"
            className="icon-button compact"
            aria-label="Close migration wizard"
            onClick={onClose}
          >
            <X size={18} aria-hidden="true" />
          </button>
        </header>

        {/* Stepper indicator */}
        <nav className="migration-stepper" aria-label="Migration progress">
          <div
            className={`migration-step-item ${step === 1 ? "active" : step > 1 ? "completed" : ""}`}
          >
            <span className="migration-step-circle">{step > 1 ? "✓" : "1"}</span>
            <span>1. Choose file</span>
          </div>
          <div
            className={`migration-step-item ${step === 2 ? "active" : step > 2 ? "completed" : ""}`}
          >
            <span className="migration-step-circle">{step > 2 ? "✓" : "2"}</span>
            <span>2. Map columns</span>
          </div>
          <div
            className={`migration-step-item ${step === 3 ? "active" : step > 3 ? "completed" : ""}`}
          >
            <span className="migration-step-circle">{step > 3 ? "✓" : "3"}</span>
            <span>3. Review & dedupe</span>
          </div>
        </nav>

        {/* Step 1: File & Account */}
        {step === 1 && (
          <div className="migration-step-body">
            {!fileName ? (
              <>
                <input
                  id={fileInputId}
                  type="file"
                  accept=".csv,.xlsx,.xls"
                  style={{ display: "none" }}
                  onChange={onFileInputChange}
                />
                <button
                  ref={dropzoneButtonRef}
                  type="button"
                  className={`migration-dropzone ${dragActive ? "drag-active" : ""}`}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragActive(true);
                  }}
                  onDragLeave={() => setDragActive(false)}
                  onDrop={onDrop}
                  onClick={() => document.getElementById(fileInputId)?.click()}
                >
                  <span className="migration-dropzone-icon">
                    <FileSpreadsheet size={36} aria-hidden="true" />
                  </span>
                  <span className="migration-dropzone-text">
                    <strong>Choose a CSV or Excel bank statement</strong>
                    <span>Drag & drop or click to browse (.csv, .xlsx, .xls)</span>
                  </span>
                  {fileBusy && (
                    <span className="migration-busy">
                      <LoaderCircle className="spin" size={16} aria-hidden="true" />
                      <span>Reading file…</span>
                    </span>
                  )}
                </button>
              </>
            ) : (
              <div className="migration-file-selected">
                <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                  <FileSpreadsheet size={20} aria-hidden="true" />
                  <div>
                    <strong>{fileName}</strong>
                    <div style={{ fontSize: "12px", color: "var(--muted)" }}>
                      {headers.length} columns detected
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  className="button quiet compact"
                  onClick={() => {
                    setFileName("");
                    setCsvText("");
                    setHeaders([]);
                  }}
                >
                  Change file
                </button>
              </div>
            )}

            <div className="migration-template-hint">
              <span>Don&apos;t have a file ready yet?</span>
              <button
                type="button"
                className="button quiet compact"
                onClick={downloadSampleTemplate}
              >
                <Download size={14} aria-hidden="true" /> Download sample CSV
              </button>
            </div>

            <div className="migration-account-select-group" style={{ marginTop: "12px" }}>
              <label htmlFor="migration-target-account">Deposit transactions into account:</label>
              <select
                id="migration-target-account"
                value={targetAccountId}
                onChange={(e) => setSelectedAccountId(e.target.value)}
              >
                {activeAccounts.map((acc) => (
                  <option key={acc.id} value={acc.id}>
                    {acc.name} ({acc.currency})
                  </option>
                ))}
                <option value="new">+ Create a new account for this import</option>
              </select>

              {targetAccountId === "new" && (
                <>
                  <label className="sr-only" htmlFor="migration-new-account-name">
                    New account name
                  </label>
                  <input
                    id="migration-new-account-name"
                    type="text"
                    placeholder="New account name (e.g. BPI Savings)"
                    value={newAccountName}
                    onChange={(e) => setNewAccountName(e.target.value)}
                    style={{ marginTop: "6px" }}
                  />
                </>
              )}
            </div>

            {fileError && (
              <div className="form-error" role="alert" style={{ marginTop: "12px" }}>
                {fileError}
              </div>
            )}

            <div className="migration-modal-actions">
              <button type="button" className="button quiet compact" onClick={onClose}>
                Cancel
              </button>
              <button
                type="button"
                className="button primary compact"
                disabled={!fileName || fileBusy}
                onClick={goToMapping}
              >
                Continue to column mapping <ArrowRight size={14} aria-hidden="true" />
              </button>
            </div>
          </div>
        )}

        {/* Step 2: Column Matcher */}
        {step === 2 && (
          <div
            className="migration-step-body"
            style={{ display: "flex", flexDirection: "column", gap: "16px" }}
          >
            <div className="migration-preset-badge">
              Auto-detected format: {detectedPresetId.toUpperCase()}
            </div>

            <div className="migration-mapping-grid">
              <div className="migration-mapping-field">
                <label htmlFor="map-date">Date column *</label>
                <select
                  id="map-date"
                  value={mapping.date}
                  onChange={(e) => setMapping((prev) => ({ ...prev, date: e.target.value }))}
                >
                  <option value="">-- Choose column --</option>
                  {headers.map((h) => (
                    <option key={h} value={h}>
                      {h}
                    </option>
                  ))}
                </select>
              </div>

              <div className="migration-mapping-field">
                <label htmlFor="map-desc">Description / Payee *</label>
                <select
                  id="map-desc"
                  value={mapping.description}
                  onChange={(e) => setMapping((prev) => ({ ...prev, description: e.target.value }))}
                >
                  <option value="">-- Choose column --</option>
                  {headers.map((h) => (
                    <option key={h} value={h}>
                      {h}
                    </option>
                  ))}
                </select>
              </div>

              <div className="migration-mapping-field">
                <label>Amount representation</label>
                <div style={{ display: "flex", gap: "8px" }}>
                  <button
                    type="button"
                    className={`button compact ${amountMode === "amount" ? "primary" : "secondary"}`}
                    onClick={() => setAmountMode("amount")}
                  >
                    Single Amount
                  </button>
                  <button
                    type="button"
                    className={`button compact ${amountMode === "debit-credit" ? "primary" : "secondary"}`}
                    onClick={() => setAmountMode("debit-credit")}
                  >
                    Debit &amp; Credit
                  </button>
                </div>
              </div>

              {amountMode === "amount" ? (
                <div className="migration-mapping-field">
                  <label htmlFor="map-amount">Amount column *</label>
                  <select
                    id="map-amount"
                    value={mapping.amount}
                    onChange={(e) => setMapping((prev) => ({ ...prev, amount: e.target.value }))}
                  >
                    <option value="">-- Choose column --</option>
                    {headers.map((h) => (
                      <option key={h} value={h}>
                        {h}
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <>
                  <div className="migration-mapping-field">
                    <label htmlFor="map-debit">Debit / Outflow *</label>
                    <select
                      id="map-debit"
                      value={mapping.debit}
                      onChange={(e) => setMapping((prev) => ({ ...prev, debit: e.target.value }))}
                    >
                      <option value="">-- Choose column --</option>
                      {headers.map((h) => (
                        <option key={h} value={h}>
                          {h}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="migration-mapping-field">
                    <label htmlFor="map-credit">Credit / Inflow *</label>
                    <select
                      id="map-credit"
                      value={mapping.credit}
                      onChange={(e) => setMapping((prev) => ({ ...prev, credit: e.target.value }))}
                    >
                      <option value="">-- Choose column --</option>
                      {headers.map((h) => (
                        <option key={h} value={h}>
                          {h}
                        </option>
                      ))}
                    </select>
                  </div>
                </>
              )}

              <div className="migration-mapping-field">
                <label htmlFor="map-cat">Category (Optional)</label>
                <select
                  id="map-cat"
                  value={mapping.category}
                  onChange={(e) => setMapping((prev) => ({ ...prev, category: e.target.value }))}
                >
                  <option value="">-- None (Auto-categorize) --</option>
                  {headers.map((h) => (
                    <option key={h} value={h}>
                      {h}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Sample Table Preview */}
            <div className="migration-sample-preview">
              <h4>Sample rows preview ({sampleRows.length} shown)</h4>
              <div className="migration-table-wrapper">
                <table className="migration-table">
                  <caption className="sr-only">Sample rows preview</caption>
                  <thead>
                    <tr>
                      <th scope="col">Date ({mapping.date || "unmapped"})</th>
                      <th scope="col">Description ({mapping.description || "unmapped"})</th>
                      <th scope="col">Amount</th>
                      <th scope="col">Category</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sampleRows.map((row, idx) => (
                      <tr key={idx}>
                        <td>{mapping.date ? getSampleValue(row, mapping.date) || "—" : "—"}</td>
                        <td>
                          {mapping.description
                            ? getSampleValue(row, mapping.description) || "—"
                            : "—"}
                        </td>
                        <td>
                          {amountMode === "amount"
                            ? (mapping.amount ? getSampleValue(row, mapping.amount) : "") || "—"
                            : `${mapping.debit ? `-${getSampleValue(row, mapping.debit)}` : ""} ${mapping.credit ? `+${getSampleValue(row, mapping.credit)}` : ""}`.trim() ||
                              "—"}
                        </td>
                        <td>
                          {mapping.category
                            ? getSampleValue(row, mapping.category) || "Auto"
                            : "Auto"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {previewError && (
              <div className="form-error" role="alert">
                {previewError}
              </div>
            )}

            <div className="migration-modal-actions">
              <button type="button" className="button secondary compact" onClick={() => setStep(1)}>
                <ArrowLeft size={14} aria-hidden="true" /> Back
              </button>
              <button
                type="button"
                className="button primary compact"
                disabled={previewLoading || !mapping.date || !mapping.description}
                onClick={() => void generatePreview()}
              >
                {previewLoading ? (
                  <>
                    <LoaderCircle className="spin" size={14} aria-hidden="true" /> Analyzing…
                  </>
                ) : (
                  <>
                    Review &amp; check duplicates <ArrowRight size={14} aria-hidden="true" />
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Review & Deduplication */}
        {step === 3 && preview && (
          <div
            className="migration-step-body"
            style={{ display: "flex", flexDirection: "column", gap: "16px" }}
          >
            <div className="migration-summary-cards">
              <div className="migration-stat-card ready">
                <span className="label">Ready to import</span>
                <span className="val">{preview.acceptedCount}</span>
              </div>
              <div className="migration-stat-card dupes">
                <span className="label">Duplicates skipped</span>
                <span className="val">{preview.duplicateCount}</span>
              </div>
              <div className="migration-stat-card">
                <span className="label">Total rows</span>
                <span className="val">{preview.rowCount}</span>
              </div>
            </div>

            <div
              className="migration-table-wrapper"
              style={{ maxHeight: "240px", overflowY: "auto" }}
            >
              <table className="migration-table">
                <caption className="sr-only">Migration preview rows</caption>
                <thead>
                  <tr>
                    <th scope="col">Date</th>
                    <th scope="col">Description</th>
                    <th scope="col">Amount</th>
                    <th scope="col">Category</th>
                    <th scope="col">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.rows.slice(0, 30).map((r, i) => (
                    <tr key={i}>
                      <td>{r.date}</td>
                      <td>{r.description}</td>
                      <td
                        style={{
                          color: (r.amountMinor ?? 0) < 0 ? "var(--expense-text)" : "var(--income)",
                        }}
                      >
                        {r.amountMinor != null ? formatMoney(r.amountMinor) : "—"}
                      </td>
                      <td>{r.categoryName || "Uncategorized"}</td>
                      <td>
                        {r.status === "duplicate" ? (
                          <span className="migration-badge-duplicate">Duplicate (Skip)</span>
                        ) : (
                          <span className="migration-badge-ready">Ready</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {commitMutation.error && (
              <div className="form-error" role="alert">
                {commitMutation.error instanceof Error
                  ? commitMutation.error.message
                  : "Could not complete import. Please try again."}
              </div>
            )}

            <div className="migration-modal-actions">
              <button
                type="button"
                className="button secondary compact"
                disabled={commitMutation.isPending}
                onClick={() => setStep(2)}
              >
                <ArrowLeft size={14} aria-hidden="true" /> Adjust mapping
              </button>
              <button
                type="button"
                className="button primary compact"
                disabled={commitMutation.isPending || preview.acceptedCount === 0}
                onClick={() => commitMutation.mutate()}
              >
                {commitMutation.isPending ? (
                  <>
                    <LoaderCircle className="spin" size={14} aria-hidden="true" /> Importing…
                  </>
                ) : (
                  <>
                    <FileUp size={14} aria-hidden="true" /> Import {preview.acceptedCount}{" "}
                    transactions
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {/* Step 4: Instant Gratification (Success) */}
        {step === 4 && (
          <div className="migration-success-box">
            <div className="migration-success-icon">
              <CheckCircle2 size={54} aria-hidden="true" />
            </div>
            <h3>Migration Complete!</h3>
            <p>
              Your transactions have been successfully recorded. Your monthly cash flow, category
              breakdown, and account totals are now live on your dashboard.
            </p>
            <button
              type="button"
              className="button primary"
              style={{ marginTop: "12px" }}
              onClick={handleComplete}
            >
              View My Populated Dashboard
            </button>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
