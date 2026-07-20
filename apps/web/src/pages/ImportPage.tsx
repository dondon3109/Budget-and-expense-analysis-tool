import {
  CsvParseError,
  parseCsv,
  type ImportCommitResult,
  type ImportMapping,
  type ImportPreview,
} from "@budget/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Download, FileCheck2, FileUp, RotateCcw, ShieldCheck } from "lucide-react";
import { useState, type ChangeEvent } from "react";

import { useAuth } from "../auth/AuthProvider";
import { AppShell } from "../components/layout/AppShell";
import { commitImport, previewImport } from "../lib/api";
import { formatMoney } from "../lib/formatters";
import { queryKeys } from "../lib/queryKeys";
import { userWorkspace } from "../lib/workspace";

const MAX_FILE_BYTES = 1_000_000;

function findHeader(headers: string[], aliases: string[]): string {
  return headers.find((header) => aliases.includes(header.trim().toLocaleLowerCase("en"))) ?? "";
}

function suggestMapping(headers: string[]): ImportMapping {
  return {
    date: findHeader(headers, ["date", "transaction date", "posted date"]),
    description: findHeader(headers, ["description", "details", "merchant", "memo"]),
    amount: findHeader(headers, ["amount", "value", "transaction amount"]),
    category: findHeader(headers, ["category", "category name"]),
    kind: findHeader(headers, ["type", "kind", "transaction type"]) || undefined,
    currency: findHeader(headers, ["currency", "currency code"]) || undefined,
  };
}

function downloadTemplate() {
  const content = [
    "Date,Description,Amount,Currency,Type,Category",
    '2026-07-20,"Weekend groceries",-1250.50,PHP,expense,"Food & dining"',
    "2026-07-21,Freelance payment,8000.00,PHP,income,Salary",
  ].join("\n");
  const url = URL.createObjectURL(new Blob([content], { type: "text/csv;charset=utf-8" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "clarity-import-template.csv";
  anchor.click();
  URL.revokeObjectURL(url);
}

export function ImportPage() {
  const { user } = useAuth();
  const workspace = userWorkspace(user!);
  const queryClient = useQueryClient();
  const [fileName, setFileName] = useState("");
  const [csvText, setCsvText] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [mapping, setMapping] = useState<ImportMapping>({
    date: "",
    description: "",
    amount: "",
    category: "",
  });
  const [fileError, setFileError] = useState<string>();
  const [preview, setPreview] = useState<ImportPreview>();
  const [result, setResult] = useState<ImportCommitResult>();

  const previewMutation = useMutation({
    mutationFn: (input: Parameters<typeof previewImport>[1]) => previewImport(workspace, input),
    onSuccess: (data) => {
      setPreview(data);
      setResult(undefined);
    },
  });
  const commitMutation = useMutation({
    mutationFn: (token: string) => commitImport(workspace, token),
    onSuccess: async (data) => {
      setResult(data);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.allTransactions(workspace) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.dashboard(workspace) }),
      ]);
    },
  });

  async function chooseFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    previewMutation.reset();
    commitMutation.reset();
    setPreview(undefined);
    setResult(undefined);
    setFileError(undefined);
    if (!file) return;
    if (file.size > MAX_FILE_BYTES) {
      setFileError("Choose a CSV file no larger than 1 MB.");
      return;
    }
    const text = await file.text();
    try {
      const parsed = parseCsv(text);
      setFileName(file.name);
      setCsvText(text);
      setHeaders(parsed.headers);
      setMapping(suggestMapping(parsed.headers));
    } catch (error) {
      setFileName(file.name);
      setCsvText("");
      setHeaders([]);
      setFileError(
        error instanceof CsvParseError ? error.message : "This file could not be read as CSV.",
      );
    }
  }

  function resetImport() {
    setFileName("");
    setCsvText("");
    setHeaders([]);
    setPreview(undefined);
    setResult(undefined);
    setFileError(undefined);
    previewMutation.reset();
    commitMutation.reset();
  }

  const requiredMappingComplete =
    mapping.date && mapping.description && mapping.amount && mapping.category;

  return (
    <AppShell mode="user">
      <div className="dashboard-page import-page">
        <header className="dashboard-header transaction-header">
          <div>
            <p className="eyebrow">Preview before saving</p>
            <h1>Import transactions</h1>
            <p>Map a CSV, review every issue, then save only the rows marked ready.</p>
          </div>
          <button className="button secondary" type="button" onClick={downloadTemplate}>
            <Download size={17} /> Download template
          </button>
        </header>

        <div className="import-safety-note">
          <ShieldCheck size={19} />
          <div>
            <strong>Review before saving</strong>
            <span>
              Files are limited to 1 MB and 500 rows. Previewing does not change your workspace.
            </span>
          </div>
        </div>

        {result ? (
          <section className="import-success">
            <CheckCircle2 size={42} />
            <p className="eyebrow">Import complete</p>
            <h2>
              {result.importedCount} transaction{result.importedCount === 1 ? "" : "s"} added
            </h2>
            <p>
              Dashboard totals and transaction lists have been refreshed.
              {result.rejectedCount > 0 &&
                ` ${result.rejectedCount} rejected ${result.rejectedCount === 1 ? "row was" : "rows were"} not saved.`}
            </p>
            <button className="button primary" type="button" onClick={resetImport}>
              <RotateCcw size={16} /> Import another file
            </button>
          </section>
        ) : (
          <div className="import-layout">
            <section className="import-card">
              <div className="import-step-heading">
                <span>1</span>
                <div>
                  <strong>Choose a CSV file</strong>
                  <small>Comma-separated values with a header row</small>
                </div>
              </div>
              <label className={`file-drop ${fileName ? "selected" : ""}`}>
                <FileUp size={27} />
                <strong>{fileName || "Select a CSV file"}</strong>
                <span>
                  {fileName ? "Choose a different file" : "Up to 1 MB · maximum 500 rows"}
                </span>
                <input
                  type="file"
                  accept=".csv,text/csv"
                  onChange={(event) => void chooseFile(event)}
                />
              </label>
              {fileError && (
                <p className="page-error" role="alert">
                  {fileError}
                </p>
              )}
            </section>

            <section className={`import-card ${headers.length === 0 ? "disabled-card" : ""}`}>
              <div className="import-step-heading">
                <span>2</span>
                <div>
                  <strong>Match your columns</strong>
                  <small>Type is optional; amount sign can identify income or expense</small>
                </div>
              </div>
              <div className="mapping-grid">
                {(
                  [
                    ["date", "Date"],
                    ["description", "Description"],
                    ["amount", "Amount"],
                    ["category", "Category"],
                    ["kind", "Type (optional)"],
                    ["currency", "Currency (optional)"],
                  ] as const
                ).map(([key, label]) => (
                  <label key={key}>
                    <span>{label}</span>
                    <select
                      value={mapping[key] ?? ""}
                      disabled={headers.length === 0}
                      onChange={(event) => {
                        setMapping((current) => ({
                          ...current,
                          [key]: event.target.value || undefined,
                        }));
                        setPreview(undefined);
                        previewMutation.reset();
                      }}
                    >
                      <option value="">
                        {key === "kind"
                          ? "Infer from amount"
                          : key === "currency"
                            ? "Assume PHP"
                            : "Choose column"}
                      </option>
                      {headers.map((header) => (
                        <option key={header} value={header}>
                          {header}
                        </option>
                      ))}
                    </select>
                  </label>
                ))}
              </div>
              <button
                className="button primary preview-import-button"
                type="button"
                disabled={!csvText || !requiredMappingComplete || previewMutation.isPending}
                onClick={() => previewMutation.mutate({ fileName, csvText, mapping })}
              >
                <FileCheck2 size={17} />{" "}
                {previewMutation.isPending ? "Checking rows…" : "Preview import"}
              </button>
              {previewMutation.isError && (
                <p className="page-error" role="alert">
                  {previewMutation.error.message}
                </p>
              )}
            </section>

            <section
              className={`import-card import-preview-card ${preview ? "" : "disabled-card"}`}
            >
              <div className="import-step-heading">
                <span>3</span>
                <div>
                  <strong>Review and import</strong>
                  <small>Invalid and duplicate rows will not be saved</small>
                </div>
              </div>
              {!preview && (
                <div className="preview-placeholder">Your row-by-row preview will appear here.</div>
              )}
              {preview && (
                <>
                  <div className="import-counts">
                    <div>
                      <strong>{preview.acceptedCount}</strong>
                      <span>Ready</span>
                    </div>
                    <div>
                      <strong>{preview.rejectedCount - preview.duplicateCount}</strong>
                      <span>Invalid</span>
                    </div>
                    <div>
                      <strong>{preview.duplicateCount}</strong>
                      <span>Duplicates</span>
                    </div>
                  </div>
                  <div className="import-table-wrap">
                    <table className="import-table">
                      <thead>
                        <tr>
                          <th>Row</th>
                          <th>Status</th>
                          <th>Transaction</th>
                          <th>Amount</th>
                          <th>Details</th>
                        </tr>
                      </thead>
                      <tbody>
                        {preview.rows.slice(0, 100).map((row) => (
                          <tr key={row.rowNumber}>
                            <td>{row.rowNumber}</td>
                            <td>
                              <span className={`import-status ${row.status}`}>{row.status}</span>
                            </td>
                            <td>
                              <strong>{row.description || "—"}</strong>
                              <small>
                                {row.date || "No valid date"} · {row.categoryName || "No category"}
                              </small>
                            </td>
                            <td>
                              {row.amountMinor === undefined ? "—" : formatMoney(row.amountMinor)}
                            </td>
                            <td>{row.errors[0] || "Ready to import"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {preview.rows.length > 100 && (
                    <p className="import-table-note">
                      Showing the first 100 of {preview.rows.length} rows.
                    </p>
                  )}
                  <div className="import-commit-row">
                    <span>Preview expires in 15 minutes.</span>
                    <button
                      className="button primary"
                      type="button"
                      disabled={preview.acceptedCount === 0 || commitMutation.isPending}
                      onClick={() => commitMutation.mutate(preview.token)}
                    >
                      {commitMutation.isPending
                        ? "Importing…"
                        : `Import ${preview.acceptedCount} ready rows`}
                    </button>
                  </div>
                  {commitMutation.isError && (
                    <p className="page-error" role="alert">
                      {commitMutation.error.message}
                    </p>
                  )}
                </>
              )}
            </section>
          </div>
        )}
      </div>
    </AppShell>
  );
}
