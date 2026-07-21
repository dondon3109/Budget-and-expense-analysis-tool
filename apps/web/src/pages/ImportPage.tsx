import {
  CsvParseError,
  parseCsv,
  type ImportCommitResult,
  type ImportMapping,
  type ImportPreview,
} from "@budget/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  CheckCircle2,
  Download,
  FileCheck2,
  FileUp,
  LoaderCircle,
  RotateCcw,
  ShieldCheck,
} from "lucide-react";
import { useEffect, useRef, useState, type ChangeEvent } from "react";

import { useAuth } from "../auth/AuthProvider";
import { AppShell } from "../components/layout/AppShell";
import { commitImport, previewImport } from "../lib/api";
import { formatMoney } from "../lib/formatters";
import { queryKeys } from "../lib/queryKeys";
import { WorkbookImportClient } from "../lib/workbookImportClient";
import { userWorkspace } from "../lib/workspace";

const MAX_CSV_FILE_BYTES = 1_000_000;
const MAX_WORKBOOK_FILE_BYTES = 5_000_000;

function localToday(): string {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function emptyMapping(): ImportMapping {
  return { description: "", amount: "" };
}

function findHeader(headers: string[], aliases: string[]): string {
  return headers.find((header) => aliases.includes(header.trim().toLocaleLowerCase("en"))) ?? "";
}

function suggestMapping(headers: string[]): ImportMapping {
  return {
    date: findHeader(headers, ["date", "transaction date", "posted date"]) || undefined,
    description: findHeader(headers, ["description", "details", "merchant", "memo"]),
    amount: findHeader(headers, ["amount", "value", "transaction amount"]),
    category: findHeader(headers, ["category", "category name"]) || undefined,
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
  const [mapping, setMapping] = useState<ImportMapping>(emptyMapping);
  const [fallbackDate, setFallbackDate] = useState(localToday);
  const [worksheetNames, setWorksheetNames] = useState<string[]>([]);
  const [selectedWorksheet, setSelectedWorksheet] = useState("");
  const [worksheetRowCount, setWorksheetRowCount] = useState<number>();
  const [workbookWarnings, setWorkbookWarnings] = useState<string[]>([]);
  const [workbookBusy, setWorkbookBusy] = useState(false);
  const [fileError, setFileError] = useState<string>();
  const [preview, setPreview] = useState<ImportPreview>();
  const [result, setResult] = useState<ImportCommitResult>();
  const workbookClientRef = useRef<WorkbookImportClient | undefined>(undefined);
  const fileSelectionIdRef = useRef(0);

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

  useEffect(
    () => () => {
      workbookClientRef.current?.dispose();
    },
    [],
  );

  function clearConvertedImport() {
    setCsvText("");
    setHeaders([]);
    setMapping(emptyMapping());
    setFallbackDate(localToday());
    setWorksheetRowCount(undefined);
    setWorkbookWarnings([]);
    setPreview(undefined);
    setResult(undefined);
    previewMutation.reset();
    commitMutation.reset();
  }

  async function convertWorkbookWorksheet(
    client: WorkbookImportClient,
    worksheetName: string,
    selectionId: number,
  ) {
    setSelectedWorksheet(worksheetName);
    clearConvertedImport();
    setWorkbookBusy(true);
    setFileError(undefined);
    try {
      const converted = await client.convert(worksheetName);
      if (selectionId !== fileSelectionIdRef.current || client !== workbookClientRef.current)
        return;
      setCsvText(converted.csvText);
      setHeaders(converted.headers);
      setMapping(suggestMapping(converted.headers));
      setWorksheetRowCount(converted.rowCount);
      setWorkbookWarnings(converted.warnings);
    } catch (error) {
      if (selectionId !== fileSelectionIdRef.current || client !== workbookClientRef.current)
        return;
      setSelectedWorksheet("");
      setFileError(
        error instanceof Error
          ? error.message
          : "The selected worksheet could not be converted for import.",
      );
    } finally {
      if (selectionId === fileSelectionIdRef.current && client === workbookClientRef.current) {
        setWorkbookBusy(false);
      }
    }
  }

  async function chooseFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    fileSelectionIdRef.current += 1;
    const selectionId = fileSelectionIdRef.current;
    workbookClientRef.current?.dispose();
    workbookClientRef.current = undefined;
    setFileName(file?.name ?? "");
    setWorksheetNames([]);
    setSelectedWorksheet("");
    setWorkbookBusy(false);
    setFileError(undefined);
    clearConvertedImport();
    if (!file) return;

    const extension = file.name.split(".").pop()?.toLocaleLowerCase("en") ?? "";
    if (!["csv", "xlsx", "xls"].includes(extension)) {
      setFileError("Choose a CSV, XLSX, or XLS file.");
      return;
    }

    if (extension === "csv") {
      if (file.size > MAX_CSV_FILE_BYTES) {
        setFileError("Choose a CSV file no larger than 1 MB.");
        return;
      }
      try {
        const text = new TextDecoder("utf-8", { fatal: true }).decode(await file.arrayBuffer());
        const parsed = parseCsv(text);
        if (selectionId !== fileSelectionIdRef.current) return;
        setCsvText(text);
        setHeaders(parsed.headers);
        setMapping(suggestMapping(parsed.headers));
      } catch (error) {
        if (selectionId !== fileSelectionIdRef.current) return;
        setFileError(
          error instanceof CsvParseError
            ? error.message
            : "This CSV could not be read. Make sure it uses UTF-8 encoding.",
        );
      }
      return;
    }

    if (file.size > MAX_WORKBOOK_FILE_BYTES) {
      setFileError("Choose an Excel workbook no larger than 5 MB.");
      return;
    }

    const client = new WorkbookImportClient();
    workbookClientRef.current = client;
    setWorkbookBusy(true);
    try {
      const sheetNames = await client.inspect(await file.arrayBuffer());
      if (selectionId !== fileSelectionIdRef.current || client !== workbookClientRef.current)
        return;
      setWorksheetNames(sheetNames);
      if (sheetNames.length === 1) {
        await convertWorkbookWorksheet(client, sheetNames[0]!, selectionId);
      } else {
        setWorkbookBusy(false);
      }
    } catch (error) {
      if (selectionId !== fileSelectionIdRef.current || client !== workbookClientRef.current)
        return;
      setWorkbookBusy(false);
      setFileError(
        error instanceof Error ? error.message : "This workbook could not be opened for import.",
      );
    }
  }

  function resetImport() {
    fileSelectionIdRef.current += 1;
    workbookClientRef.current?.dispose();
    workbookClientRef.current = undefined;
    setFileName("");
    setWorksheetNames([]);
    setSelectedWorksheet("");
    setWorkbookBusy(false);
    setFileError(undefined);
    clearConvertedImport();
  }

  const requiredMappingComplete =
    mapping.description && mapping.amount && (mapping.date || fallbackDate);

  return (
    <AppShell>
      <div className="dashboard-page import-page">
        <header className="dashboard-header transaction-header">
          <div>
            <p className="eyebrow">Preview before saving</p>
            <h1>Import transactions</h1>
            <p>Choose a CSV or Excel worksheet, review every issue, then save ready rows.</p>
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
              CSV files are limited to 1 MB, Excel files to 5 MB, and worksheets to 500 rows.
              Previewing does not change your workspace.
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
                  <strong>Choose a CSV or Excel file</strong>
                  <small>CSV, Excel Workbook (.xlsx), or Excel 97–2003 (.xls)</small>
                </div>
              </div>
              <label className={`file-drop ${fileName ? "selected" : ""}`}>
                <FileUp size={27} />
                <strong>{fileName || "Select a CSV or Excel file"}</strong>
                <span>
                  {fileName
                    ? "Choose a different file"
                    : "CSV up to 1 MB · Excel up to 5 MB · maximum 500 rows"}
                </span>
                <input
                  type="file"
                  accept=".csv,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
                  onChange={(event) => void chooseFile(event)}
                />
              </label>
              {workbookBusy && worksheetNames.length === 0 && (
                <span className="worksheet-loading" role="status">
                  <LoaderCircle className="spinning" size={16} /> Reading workbook…
                </span>
              )}
              {worksheetNames.length > 0 && (
                <div className="worksheet-picker">
                  <label>
                    <span>Worksheet</span>
                    <select
                      value={selectedWorksheet}
                      disabled={workbookBusy}
                      onChange={(event) => {
                        const client = workbookClientRef.current;
                        if (!client || !event.target.value) return;
                        void convertWorkbookWorksheet(
                          client,
                          event.target.value,
                          fileSelectionIdRef.current,
                        );
                      }}
                    >
                      <option value="">Choose a worksheet</option>
                      {worksheetNames.map((worksheetName) => (
                        <option key={worksheetName} value={worksheetName}>
                          {worksheetName}
                        </option>
                      ))}
                    </select>
                  </label>
                  {workbookBusy && (
                    <span className="worksheet-loading" role="status">
                      <LoaderCircle className="spinning" size={16} /> Reading worksheet…
                    </span>
                  )}
                  {selectedWorksheet && worksheetRowCount !== undefined && (
                    <span className="worksheet-summary">
                      Worksheet: {selectedWorksheet} · {worksheetRowCount} data{" "}
                      {worksheetRowCount === 1 ? "row" : "rows"}
                    </span>
                  )}
                </div>
              )}
              {workbookWarnings.length > 0 && (
                <div className="workbook-warning" role="status">
                  {workbookWarnings.map((warning) => (
                    <span key={warning}>{warning}</span>
                  ))}
                </div>
              )}
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
                  <small>
                    Date, category, and type are optional; amount sign can identify the type
                  </small>
                </div>
              </div>
              <div className="mapping-grid">
                {(
                  [
                    ["date", "Date (optional)"],
                    ["description", "Description"],
                    ["amount", "Amount"],
                    ["category", "Category (optional)"],
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
                        {key === "date"
                          ? "Use one date for all rows"
                          : key === "category"
                            ? "Use Uncategorized"
                            : key === "kind"
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
                {!mapping.date && (
                  <label>
                    <span>Date for every row</span>
                    <input
                      type="date"
                      value={fallbackDate}
                      disabled={headers.length === 0}
                      onChange={(event) => {
                        setFallbackDate(event.target.value);
                        setPreview(undefined);
                        previewMutation.reset();
                      }}
                    />
                  </label>
                )}
              </div>
              <button
                className="button primary preview-import-button"
                type="button"
                disabled={!csvText || !requiredMappingComplete || previewMutation.isPending}
                onClick={() =>
                  previewMutation.mutate({
                    fileName,
                    csvText,
                    mapping,
                    ...(mapping.date ? {} : { fallbackDate }),
                  })
                }
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
