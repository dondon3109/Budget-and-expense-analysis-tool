import {
  CsvParseError,
  importPreviewRequestSchema,
  inspectCsv,
  normalizeSignedAmount,
  parseCsv,
  transactionKinds,
  type CategoryRecord,
  type ImportCommitRequest,
  type ImportMapping,
  type TransactionKind,
} from "@zoption/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Download,
  FileCheck2,
  FileUp,
  LoaderCircle,
  RotateCcw,
  ShieldCheck,
  Tags,
} from "lucide-react";
import { useMemo, useRef, useState, type ChangeEvent, type DragEvent } from "react";

import { useAuth } from "../auth/AuthProvider";
import { AppShell } from "../components/layout/AppShell";
import { emptyImportMapping, localToday, useImportDraft } from "../import/ImportDraftProvider";
import "../import/import.css";
import { commitImport, getCategories, previewImport } from "../lib/api";
import { formatMoney } from "../lib/formatters";
import {
  detectImportPreset,
  getImportPreset,
  importPresets,
  resolvePresetMapping,
  type ImportAmountMode,
  type ImportPreset,
  type ImportPresetId,
} from "../lib/importPresets";
import { queryKeys } from "../lib/queryKeys";
import { WorkbookImportClient } from "../lib/workbookImportClient";
import { userWorkspace } from "../lib/workspace";

const MAX_CSV_FILE_BYTES = 1_000_000;
const MAX_WORKBOOK_FILE_BYTES = 5_000_000;
const MAX_IMPORT_ROWS = 500;
const PREVIEW_PAGE_SIZE = 100;

function downloadTemplate() {
  const content = [
    "Date,Description,Amount,Currency,Type,Category",
    '2026-07-20,"Weekend groceries",-1250.50,PHP,expense,"Food & dining"',
    "2026-07-21,Freelance payment,8000.00,PHP,income,Salary",
  ].join("\n");
  const url = URL.createObjectURL(new Blob([content], { type: "text/csv;charset=utf-8" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "zoption-import-template.csv";
  anchor.click();
  URL.revokeObjectURL(url);
}

function mappingForAmountMode(
  headers: string[],
  preset: ImportPreset,
  amountMode: ImportAmountMode,
): ImportMapping {
  return resolvePresetMapping(headers, { ...preset, preferredAmountMode: amountMode }).mapping;
}

function categoryName(
  categories: CategoryRecord[],
  categoryId: string | undefined,
): string | undefined {
  return categories.find((category) => category.id === categoryId)?.name;
}

export function ImportPage() {
  const { user } = useAuth();
  const workspace = userWorkspace(user!);
  const queryClient = useQueryClient();
  const {
    fileName,
    setFileName,
    csvText,
    setCsvText,
    inspection,
    setInspection,
    headerRowNumber,
    setHeaderRowNumber,
    selectedRowCount,
    setSelectedRowCount,
    headers,
    setHeaders,
    mapping,
    setMapping,
    amountMode,
    setAmountMode,
    selectedPresetId,
    setSelectedPresetId,
    resolvedPresetId,
    setResolvedPresetId,
    phpConfirmed,
    setPhpConfirmed,
    fallbackDate,
    setFallbackDate,
    worksheetNames,
    setWorksheetNames,
    selectedWorksheet,
    setSelectedWorksheet,
    worksheetRowCount,
    setWorksheetRowCount,
    workbookWarnings,
    setWorkbookWarnings,
    workbookBusy,
    setWorkbookBusy,
    fileError,
    setFileError,
    previewError,
    setPreviewError,
    previewAttempted,
    setPreviewAttempted,
    preview,
    setPreview,
    previewPage,
    setPreviewPage,
    categoryOverrides,
    setCategoryOverrides,
    kindOverrides,
    setKindOverrides,
    bulkKind,
    setBulkKind,
    selectedRows,
    setSelectedRows,
    bulkCategoryId,
    setBulkCategoryId,
    result,
    setResult,
    workbookClientRef,
    fileSelectionIdRef,
    previewGenerationRef,
  } = useImportDraft();
  const [dragActive, setDragActive] = useState(false);
  const dragDepthRef = useRef(0);

  const categoriesQuery = useQuery({
    queryKey: queryKeys.categories(workspace),
    queryFn: () => getCategories(workspace),
  });
  const categories = categoriesQuery.data ?? [];

  const previewMutation = useMutation({
    mutationFn: ({ input }: { input: Parameters<typeof previewImport>[1]; generation: number }) =>
      previewImport(workspace, input),
    onSuccess: (data, variables) => {
      if (variables.generation !== previewGenerationRef.current) return;
      setPreviewError(undefined);
      setPreview(data);
      setResult(undefined);
      setPreviewPage(1);
      setCategoryOverrides({});
      setKindOverrides({});
      setPreviewAttempted(false);
      setSelectedRows([]);
      setBulkCategoryId("");
      setBulkKind(
        data.rows.find((row) => row.status === "ready" && row.categoryIsUncategorized && row.kind)
          ?.kind,
      );
    },
    onError: (error, variables) => {
      if (variables.generation === previewGenerationRef.current) setPreviewError(error);
    },
  });
  const commitMutation = useMutation({
    mutationFn: (input: ImportCommitRequest) => commitImport(workspace, input),
    onSuccess: async (data) => {
      workbookClientRef.current?.dispose();
      workbookClientRef.current = undefined;
      setResult(data);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.allTransactions(workspace) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.dashboard(workspace) }),
      ]);
    },
  });

  function invalidatePreview() {
    previewGenerationRef.current += 1;
    setPreviewError(undefined);
    setPreview(undefined);
    setResult(undefined);
    setPreviewPage(1);
    setCategoryOverrides({});
    setKindOverrides({});
    setSelectedRows([]);
    setBulkCategoryId("");
    setBulkKind(undefined);
    previewMutation.reset();
    commitMutation.reset();
  }

  function clearConvertedImport() {
    setCsvText("");
    setInspection(undefined);
    setHeaderRowNumber(undefined);
    setSelectedRowCount(0);
    setHeaders([]);
    setMapping(emptyImportMapping());
    setAmountMode("amount");
    setSelectedPresetId("auto");
    setResolvedPresetId("generic");
    setPhpConfirmed(false);
    setFallbackDate(localToday());
    setWorksheetRowCount(undefined);
    setWorkbookWarnings([]);
    setPreviewAttempted(false);
    invalidatePreview();
  }

  function updateSelectedSource(
    text: string,
    nextHeaderRowNumber: number,
    presetSelection: ImportPresetId,
  ): number {
    const parsed = parseCsv(text, { headerRowNumber: nextHeaderRowNumber });
    const detectedPreset = detectImportPreset(fileName, parsed.headers);
    const preset = presetSelection === "auto" ? detectedPreset : getImportPreset(presetSelection);
    const suggested = resolvePresetMapping(parsed.headers, preset);

    setHeaderRowNumber(nextHeaderRowNumber);
    setSelectedRowCount(parsed.rows.length);
    setHeaders(parsed.headers);
    setResolvedPresetId(preset.id);
    setAmountMode(suggested.amountMode);
    setMapping(suggested.mapping);
    setPhpConfirmed(false);
    setFileError(
      parsed.rows.length === 0
        ? "The selected header has no data rows below it."
        : parsed.rows.length > MAX_IMPORT_ROWS
          ? `The selected header has ${parsed.rows.length} data rows. Choose a file with at most ${MAX_IMPORT_ROWS}.`
          : undefined,
    );
    invalidatePreview();
    return parsed.rows.length;
  }

  function configureSource(text: string, sourceFileName: string): number {
    const nextInspection = inspectCsv(text);
    const parsed = parseCsv(text, { headerRowNumber: nextInspection.suggestedHeaderRowNumber });
    const detectedPreset = detectImportPreset(sourceFileName, parsed.headers);
    const suggested = resolvePresetMapping(parsed.headers, detectedPreset);

    setCsvText(text);
    setInspection(nextInspection);
    setHeaderRowNumber(nextInspection.suggestedHeaderRowNumber);
    setSelectedRowCount(parsed.rows.length);
    setHeaders(parsed.headers);
    setSelectedPresetId("auto");
    setResolvedPresetId(detectedPreset.id);
    setAmountMode(suggested.amountMode);
    setMapping(suggested.mapping);
    setPhpConfirmed(false);
    setFallbackDate(localToday());
    setFileError(
      parsed.rows.length === 0
        ? "The detected header has no data rows below it. Choose another header row."
        : parsed.rows.length > MAX_IMPORT_ROWS
          ? `The detected header has ${parsed.rows.length} data rows. Choose a file with at most ${MAX_IMPORT_ROWS}.`
          : undefined,
    );
    invalidatePreview();
    return parsed.rows.length;
  }

  async function convertWorkbookWorksheet(
    client: WorkbookImportClient,
    worksheetName: string,
    selectionId: number,
    sourceFileName: string,
  ) {
    setSelectedWorksheet(worksheetName);
    clearConvertedImport();
    setWorkbookBusy(true);
    setFileError(undefined);
    try {
      const converted = await client.convert(worksheetName);
      if (selectionId !== fileSelectionIdRef.current || client !== workbookClientRef.current)
        return;
      const rowCount = configureSource(converted.csvText, sourceFileName);
      setWorksheetRowCount(rowCount);
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

  function beginFileSelection(): number {
    fileSelectionIdRef.current += 1;
    workbookClientRef.current?.dispose();
    workbookClientRef.current = undefined;
    dragDepthRef.current = 0;
    setDragActive(false);
    setFileName("");
    setWorksheetNames([]);
    setSelectedWorksheet("");
    setWorkbookBusy(false);
    setFileError(undefined);
    clearConvertedImport();
    return fileSelectionIdRef.current;
  }

  async function processFile(file: File) {
    const selectionId = beginFileSelection();
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
      setFileName(file.name);
      try {
        const text = new TextDecoder("utf-8", { fatal: true }).decode(await file.arrayBuffer());
        if (selectionId !== fileSelectionIdRef.current) return;
        configureSource(text, file.name);
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

    setFileName(file.name);
    const client = new WorkbookImportClient();
    workbookClientRef.current = client;
    setWorkbookBusy(true);
    try {
      const sheetNames = await client.inspect(await file.arrayBuffer());
      if (selectionId !== fileSelectionIdRef.current || client !== workbookClientRef.current)
        return;
      setWorksheetNames(sheetNames);
      if (sheetNames.length === 1) {
        await convertWorkbookWorksheet(client, sheetNames[0]!, selectionId, file.name);
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

  function chooseFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (file) void processFile(file);
  }

  function isFileDrag(event: DragEvent<HTMLElement>): boolean {
    return Array.from(event.dataTransfer.types).includes("Files");
  }

  function handleDragEnter(event: DragEvent<HTMLLabelElement>) {
    if (!isFileDrag(event)) return;
    event.preventDefault();
    dragDepthRef.current += 1;
    setDragActive(true);
  }

  function handleDragOver(event: DragEvent<HTMLLabelElement>) {
    if (!isFileDrag(event)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
  }

  function handleDragLeave(event: DragEvent<HTMLLabelElement>) {
    if (!isFileDrag(event)) return;
    event.preventDefault();
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) setDragActive(false);
  }

  function handleDrop(event: DragEvent<HTMLLabelElement>) {
    if (!isFileDrag(event)) return;
    event.preventDefault();
    dragDepthRef.current = 0;
    setDragActive(false);
    const files = Array.from(event.dataTransfer.files);
    if (files.length !== 1) {
      beginFileSelection();
      setFileError("Drop one CSV, XLSX, or XLS file at a time.");
      return;
    }
    void processFile(files[0]!);
  }

  function resetImport() {
    beginFileSelection();
  }

  function changeHeader(nextHeaderRowNumber: number) {
    try {
      updateSelectedSource(csvText, nextHeaderRowNumber, selectedPresetId);
      if (selectedWorksheet) {
        const parsed = parseCsv(csvText, { headerRowNumber: nextHeaderRowNumber });
        setWorksheetRowCount(parsed.rows.length);
      }
    } catch (error) {
      setFileError(error instanceof Error ? error.message : "The selected header row is invalid.");
    }
  }

  function applyPreset(nextPresetId: ImportPresetId) {
    const preset =
      nextPresetId === "auto"
        ? detectImportPreset(fileName, headers)
        : getImportPreset(nextPresetId);
    const suggested = resolvePresetMapping(headers, preset);
    setSelectedPresetId(nextPresetId);
    setResolvedPresetId(preset.id);
    setAmountMode(suggested.amountMode);
    setMapping(suggested.mapping);
    setPhpConfirmed(false);
    invalidatePreview();
  }

  function changeAmountMode(nextMode: ImportAmountMode) {
    const preset = getImportPreset(resolvedPresetId);
    const suggested = mappingForAmountMode(headers, preset, nextMode);
    setAmountMode(nextMode);
    setMapping((current) => {
      const next: ImportMapping = {
        ...current,
        ...(nextMode === "amount"
          ? { amount: suggested.amount ?? "", debit: undefined, credit: undefined }
          : {
              amount: undefined,
              debit: suggested.debit ?? "",
              credit: suggested.credit ?? "",
            }),
      };
      return next;
    });
    invalidatePreview();
  }

  function updateMapping(key: keyof ImportMapping, value: string) {
    const required =
      key === "description" || key === "amount" || key === "debit" || key === "credit";
    setMapping((current) => ({
      ...current,
      [key]: value || (required ? "" : undefined),
    }));
    invalidatePreview();
  }

  const currencyColumnProvesPhp = useMemo(() => {
    if (!csvText || !headerRowNumber || !mapping.currency) return false;
    try {
      const parsed = parseCsv(csvText, { headerRowNumber });
      const index = parsed.headers.indexOf(mapping.currency);
      return (
        index >= 0 &&
        parsed.rows.length > 0 &&
        parsed.rows.every((row) => (row.values[index]?.trim().toUpperCase() ?? "") === "PHP")
      );
    } catch {
      return false;
    }
  }, [csvText, headerRowNumber, mapping.currency]);

  const resolvedPreset = getImportPreset(resolvedPresetId);
  const requiresPhpConfirmation =
    resolvedPreset.requiresPhpConfirmation && !currencyColumnProvesPhp;
  const canAttemptPreview = Boolean(
    csvText &&
    !workbookBusy &&
    selectedRowCount > 0 &&
    selectedRowCount <= MAX_IMPORT_ROWS &&
    (!requiresPhpConfirmation || phpConfirmed),
  );
  const descriptionMappingMissing = previewAttempted && !mapping.description.trim();

  function requestPreview() {
    previewGenerationRef.current += 1;
    setPreviewAttempted(true);
    const generation = previewGenerationRef.current;
    setPreviewError(undefined);

    if (!mapping.description.trim()) return;

    const parsed = importPreviewRequestSchema.safeParse({
      fileName,
      csvText,
      headerRowNumber,
      mapping,
      ...(mapping.date ? {} : { fallbackDate }),
    });
    if (!parsed.success) {
      const messages = [...new Set(parsed.error.issues.map((issue) => issue.message))];
      setPreviewError(new Error(messages.join(" ")));
      return;
    }

    previewMutation.mutate({ generation, input: parsed.data });
  }

  const previewPages = preview
    ? Math.max(1, Math.ceil(preview.rows.length / PREVIEW_PAGE_SIZE))
    : 1;
  const visibleRows = preview
    ? preview.rows.slice((previewPage - 1) * PREVIEW_PAGE_SIZE, previewPage * PREVIEW_PAGE_SIZE)
    : [];
  const eligibleRows =
    preview?.rows.filter(
      (row) => row.status === "ready" && row.categoryIsUncategorized && row.kind,
    ) ?? [];
  const availableBulkCategories = categories.filter(
    (category) => !category.archived && !category.system && category.kind === bulkKind,
  );
  const allEligibleSelected =
    eligibleRows.length > 0 && eligibleRows.every((row) => selectedRows.includes(row.rowNumber));

  function toggleRow(rowNumber: number) {
    setSelectedRows((current) =>
      current.includes(rowNumber)
        ? current.filter((candidate) => candidate !== rowNumber)
        : [...current, rowNumber],
    );
  }

  function toggleAllEligible() {
    setSelectedRows(allEligibleSelected ? [] : eligibleRows.map((row) => row.rowNumber));
  }

  function applyBulkChanges() {
    if (!bulkKind || selectedRows.length === 0) return;
    const selected = new Set(selectedRows);
    setKindOverrides((current) => {
      const next = { ...current };
      for (const row of eligibleRows) {
        if (!selected.has(row.rowNumber)) continue;
        if (row.kind === bulkKind) delete next[row.rowNumber];
        else next[row.rowNumber] = bulkKind;
      }
      return next;
    });
    setCategoryOverrides((current) => {
      const next = { ...current };
      for (const rowNumber of selectedRows) {
        if (bulkCategoryId) next[rowNumber] = bulkCategoryId;
        else delete next[rowNumber];
      }
      return next;
    });
    setSelectedRows([]);
  }

  const commitRequest: ImportCommitRequest | undefined = preview
    ? {
        token: preview.token,
        categoryOverrides: Object.entries(categoryOverrides).map(([rowNumber, categoryId]) => ({
          rowNumber: Number(rowNumber),
          categoryId,
        })),
        kindOverrides: Object.entries(kindOverrides).map(([rowNumber, kind]) => ({
          rowNumber: Number(rowNumber),
          kind,
        })),
      }
    : undefined;

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
              CSV files are limited to 1 MB, Excel files to 5 MB, and imports to 500 data rows.
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
              <label
                className={[
                  "file-drop",
                  fileName ? "selected" : "",
                  dragActive ? "drag-active" : "",
                  fileError && !fileName ? "rejected" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                htmlFor="transaction-file-input"
                onDragEnter={handleDragEnter}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
              >
                <FileUp size={27} />
                <strong>
                  {dragActive
                    ? "Drop one file to import"
                    : fileName || "Choose or drag a CSV or Excel file"}
                </strong>
                <span id="transaction-file-help">
                  {dragActive
                    ? "CSV, XLSX, or XLS"
                    : fileName
                      ? "Choose or drop another file"
                      : "CSV up to 1 MB · Excel up to 5 MB · maximum 500 data rows"}
                </span>
                <input
                  id="transaction-file-input"
                  type="file"
                  aria-label="Choose transaction file"
                  aria-describedby="transaction-file-help"
                  accept=".csv,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
                  onChange={chooseFile}
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
                          fileName,
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
                  <strong>Match your bank export</strong>
                  <small>Choose the header, bank format, amount layout, and columns</small>
                </div>
              </div>

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
                      Ignoring {headerRowNumber - 1} introductory{" "}
                      {headerRowNumber === 2 ? "row" : "rows"}
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
                      aria-invalid={
                        key === "description" && descriptionMappingMissing ? true : undefined
                      }
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
                                ? "Assume PHP"
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

              {resolvedPreset.requiresPhpConfirmation && (
                <div className="php-import-warning" role="alert">
                  <AlertTriangle size={20} />
                  <div>
                    <strong>PHP-only import</strong>
                    <span>
                      {resolvedPreset.label} exports commonly contain USD. Zoption does not convert
                      currencies, and any mapped non-PHP currency will be rejected.
                    </span>
                    {requiresPhpConfirmation ? (
                      <label>
                        <input
                          type="checkbox"
                          checked={phpConfirmed}
                          onChange={(event) => {
                            setPhpConfirmed(event.target.checked);
                            invalidatePreview();
                          }}
                        />
                        Store these numeric values as PHP without currency conversion
                      </label>
                    ) : (
                      <small>The mapped Currency column confirms that every row is PHP.</small>
                    )}
                  </div>
                </div>
              )}

              <button
                className="button primary preview-import-button"
                type="button"
                disabled={!canAttemptPreview || previewMutation.isPending}
                onClick={requestPreview}
              >
                <FileCheck2 size={17} />{" "}
                {previewMutation.isPending ? "Checking rows…" : "Preview import"}
              </button>
              {previewError && (
                <p className="page-error" role="alert">
                  {previewError.message}
                </p>
              )}
            </section>

            <section
              className={`import-card import-preview-card ${preview ? "" : "disabled-card"}`}
            >
              <div className="import-step-heading">
                <span>3</span>
                <div>
                  <strong>Review, categorize, and import</strong>
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

                  {eligibleRows.length > 0 && (
                    <div className="bulk-category-toolbar">
                      <div className="bulk-category-heading">
                        <Tags size={18} />
                        <div>
                          <strong>Update Uncategorized rows</strong>
                          <span>Selections include eligible rows on every preview page.</span>
                        </div>
                      </div>
                      <div className="bulk-category-controls">
                        <label>
                          <span>Import selected rows as</span>
                          <select
                            value={bulkKind ?? ""}
                            onChange={(event) => {
                              setBulkKind(event.target.value as TransactionKind);
                              setSelectedRows([]);
                              setBulkCategoryId("");
                            }}
                          >
                            {transactionKinds.map((kind) => (
                              <option key={kind} value={kind}>
                                {kind.charAt(0).toUpperCase() + kind.slice(1)}
                              </option>
                            ))}
                          </select>
                        </label>
                        <button
                          className="button secondary"
                          type="button"
                          onClick={toggleAllEligible}
                        >
                          {allEligibleSelected
                            ? "Clear selection"
                            : `Select all ${eligibleRows.length}`}
                        </button>
                        <label>
                          <span>New category (optional)</span>
                          <select
                            value={bulkCategoryId}
                            onChange={(event) => setBulkCategoryId(event.target.value)}
                          >
                            <option value="">Use Uncategorized</option>
                            {availableBulkCategories.map((category) => (
                              <option key={category.id} value={category.id}>
                                {category.name}
                              </option>
                            ))}
                          </select>
                        </label>
                        <button
                          className="button primary"
                          type="button"
                          disabled={!bulkKind || selectedRows.length === 0}
                          onClick={applyBulkChanges}
                        >
                          Apply to {selectedRows.length} selected
                        </button>
                      </div>
                      {categoriesQuery.isError && (
                        <p className="page-error">Categories could not be loaded.</p>
                      )}
                    </div>
                  )}

                  <div className="import-table-wrap">
                    <table className="import-table">
                      <thead>
                        <tr>
                          <th className="import-select-column">Select</th>
                          <th>Row</th>
                          <th>Status</th>
                          <th>Transaction</th>
                          <th>Amount</th>
                          <th>Details</th>
                        </tr>
                      </thead>
                      <tbody>
                        {visibleRows.map((row) => {
                          const eligible =
                            row.status === "ready" && row.categoryIsUncategorized && row.kind;
                          const effectiveKind = kindOverrides[row.rowNumber] ?? row.kind;
                          const effectiveAmount =
                            row.amountMinor === undefined || !effectiveKind
                              ? row.amountMinor
                              : effectiveKind === "transfer"
                                ? row.amountMinor
                                : normalizeSignedAmount(row.amountMinor, effectiveKind);
                          const overrideName = categoryName(
                            categories,
                            categoryOverrides[row.rowNumber],
                          );
                          const effectiveCategory =
                            overrideName ||
                            (effectiveKind !== row.kind ? "Uncategorized" : row.categoryName) ||
                            "No category";
                          const changed = Boolean(
                            overrideName || (effectiveKind && effectiveKind !== row.kind),
                          );
                          return (
                            <tr key={row.rowNumber}>
                              <td className="import-select-column">
                                {row.status === "ready" && row.categoryIsUncategorized ? (
                                  <input
                                    type="checkbox"
                                    aria-label={`Select row ${row.rowNumber}`}
                                    checked={selectedRows.includes(row.rowNumber)}
                                    disabled={!eligible}
                                    onChange={() => toggleRow(row.rowNumber)}
                                  />
                                ) : (
                                  "—"
                                )}
                              </td>
                              <td>{row.rowNumber}</td>
                              <td>
                                <span className={`import-status ${row.status}`}>{row.status}</span>
                              </td>
                              <td>
                                <strong>{row.description || "—"}</strong>
                                <small>
                                  {row.date || "No valid date"} · {effectiveKind || "No type"} ·{" "}
                                  {effectiveCategory}
                                </small>
                              </td>
                              <td>
                                {effectiveAmount === undefined ? "—" : formatMoney(effectiveAmount)}
                              </td>
                              <td>
                                {changed && effectiveKind
                                  ? `Will import as ${effectiveKind} · ${effectiveCategory}`
                                  : row.errors[0] || "Ready to import"}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {previewPages > 1 && (
                    <div className="import-pagination">
                      <button
                        className="button secondary"
                        type="button"
                        disabled={previewPage === 1}
                        onClick={() => setPreviewPage((page) => page - 1)}
                      >
                        <ChevronLeft size={16} /> Previous
                      </button>
                      <span>
                        Page {previewPage} of {previewPages} · {preview.rows.length} rows
                      </span>
                      <button
                        className="button secondary"
                        type="button"
                        disabled={previewPage === previewPages}
                        onClick={() => setPreviewPage((page) => page + 1)}
                      >
                        Next <ChevronRight size={16} />
                      </button>
                    </div>
                  )}

                  <div className="import-commit-row">
                    <span>
                      Preview expires in 15 minutes.
                      {Object.keys(kindOverrides).length > 0 &&
                        ` ${Object.keys(kindOverrides).length} transaction type ${Object.keys(kindOverrides).length === 1 ? "change" : "changes"} will be applied.`}
                      {Object.keys(categoryOverrides).length > 0 &&
                        ` ${Object.keys(categoryOverrides).length} category ${Object.keys(categoryOverrides).length === 1 ? "change" : "changes"} will be applied.`}
                    </span>
                    <button
                      className="button primary"
                      type="button"
                      disabled={
                        preview.acceptedCount === 0 || commitMutation.isPending || !commitRequest
                      }
                      onClick={() => commitRequest && commitMutation.mutate(commitRequest)}
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
