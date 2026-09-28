import {
  CsvParseError,
  formatMinorAmount,
  importPreviewRequestSchema,
  inspectCsv,
  parseCsv,
  type ImportCommitRequest,
  type ImportMapping,
} from "@zoption/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Camera, CheckCircle2, Download, FileSpreadsheet, FileUp, RotateCcw } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ChangeEvent, type DragEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";

import { captureFunnelEvent } from "../analytics/funnel";
import { readWorkspaceTransactionTotal } from "../analytics/workspaceTransactionTotal";
import { useAuth } from "../auth/AuthProvider";
import { ReceiptEntry, type ReceiptEntryDraft } from "../components/receipts/ReceiptEntry";
import { BillingLimitDialog } from "../components/billing/BillingLimitDialog";
import { SpreadsheetMigrationWizard } from "../components/onboarding/SpreadsheetMigrationWizard";
import { AppShell } from "../components/layout/AppShell";
import { useBillingSummary } from "../hooks/useBillingSummary";
import { emptyImportMapping, localToday, useImportDraft } from "../import/ImportDraftProvider";
import "../import/import.css";
import { commitImport, isMonthlyLimitReachedError, previewImport } from "../lib/api";
// The step components load after import.css, where ImportSubscriptionSuggestions used to be
// imported, so its stylesheet keeps its place in the cascade. ImportReviewStep also brings
// PlanUsageIndicator.css and UpgradePrompt.css, which now load after import.css too: an
// import.css override of those components needs a more specific selector, not source order.
import { ImportFileStep } from "../components/import/ImportFileStep";
import { ImportMappingStep } from "../components/import/ImportMappingStep";
import { ImportReviewStep } from "../components/import/ImportReviewStep";
import {
  detectImportPreset,
  getImportPreset,
  resolvePresetMapping,
  type ImportAmountMode,
  type ImportPreset,
  type ImportPresetId,
} from "../lib/importPresets";
import { queryKeys } from "../lib/queryKeys";
import { WorkbookImportClient } from "../lib/workbookImportClient";
import { userWorkspace } from "../lib/workspace";
import { useAccounts } from "../queries/accounts";
import { invalidateBillingSummary } from "../queries/billing";
import { useCategories } from "../queries/categories";
import { subscriptionsQueryOptions } from "../queries/subscriptions";

const MAX_CSV_FILE_BYTES = 1_000_000;
const MAX_WORKBOOK_FILE_BYTES = 5_000_000;
const MAX_IMPORT_ROWS = 500;

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

export function ImportPage() {
  const { user } = useAuth();
  const workspace = userWorkspace(user!);
  const queryClient = useQueryClient();
  const billingQuery = useBillingSummary(workspace);
  const limitTriggerRef = useRef<HTMLElement | null>(null);
  const [limitDialogOpen, setLimitDialogOpen] = useState(false);
  const {
    fileName,
    setFileName,
    csvText,
    setCsvText,
    setInspection,
    headerRowNumber,
    setHeaderRowNumber,
    selectedRowCount,
    setSelectedRowCount,
    headers,
    setHeaders,
    mapping,
    setMapping,
    setAmountMode,
    selectedPresetId,
    setSelectedPresetId,
    resolvedPresetId,
    setResolvedPresetId,
    phpConfirmed,
    setPhpConfirmed,
    fallbackDate,
    setFallbackDate,
    setWorksheetNames,
    selectedWorksheet,
    setSelectedWorksheet,
    setWorksheetRowCount,
    setWorkbookWarnings,
    workbookBusy,
    setWorkbookBusy,
    setFileError,
    setPreviewError,
    previewAttempted,
    setPreviewAttempted,
    preview,
    setPreview,
    setPreviewPage,
    setCategoryOverrides,
    setKindOverrides,
    setBulkKind,
    setSelectedRows,
    setBulkCategoryId,
    result,
    setResult,
    workbookClientRef,
    fileSelectionIdRef,
    previewGenerationRef,
  } = useImportDraft();
  const [dragActive, setDragActive] = useState(false);
  const dragDepthRef = useRef(0);
  const [searchParams, setSearchParams] = useSearchParams();
  const [migrationWizardOpen, setMigrationWizardOpen] = useState(false);
  const entryMode = searchParams.get("mode") === "receipt" ? "receipt" : "file";

  useEffect(() => {
    if (searchParams.get("wizard") === "true") {
      setMigrationWizardOpen(true);
    }
  }, [searchParams]);

  function csvField(value: string): string {
    return '"' + value.replaceAll('"', '""') + '"';
  }

  function beginReceiptPreview(draft: ReceiptEntryDraft) {
    const headers = ["Description", "Amount", "Category", "Type"];
    const rows = draft.lines.map((line) => {
      const signedAmount =
        draft.kind === "expense"
          ? -Math.abs(line.amountMinor)
          : draft.kind === "income"
            ? Math.abs(line.amountMinor)
            : line.amountMinor;
      return [
        csvField(line.description),
        formatMinorAmount(signedAmount),
        csvField(line.categoryName),
        draft.kind,
      ].join(",");
    });
    const receiptCsv = [headers.join(","), ...rows].join("\r\n");

    beginFileSelection();
    setFileName("receipt-" + draft.date + ".csv");
    setCsvText(receiptCsv);
    setInspection(inspectCsv(receiptCsv));
    setHeaderRowNumber(1);
    setHeaders(headers);
    setSelectedRowCount(draft.lines.length);
    setMapping({
      description: "Description",
      amount: "Amount",
      category: "Category",
      kind: "Type",
    });
    setAmountMode("amount");
    setSelectedPresetId("generic");
    setResolvedPresetId("generic");
    setFallbackDate(draft.date);
    setFileError(undefined);
    setSearchParams({}, { replace: true });
  }

  const categoriesQuery = useCategories(workspace);
  const categories = categoriesQuery.data ?? [];
  const accountsQuery = useAccounts(workspace);
  const accounts = accountsQuery.data ?? [];
  const subscriptionsQuery = useQuery({
    ...subscriptionsQueryOptions(
      workspace,
      `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}-01`,
    ),
    enabled: Boolean(preview),
  });

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
      // The rows this commit inserted, read back against the workspace total, tell whether
      // the workspace was empty before it. A failed or unknown read never fires, a commit
      // that inserted nothing never fires, and the module keeps the event to one per page load.
      const transactionTotal = await readWorkspaceTransactionTotal(queryClient, workspace);
      if (
        transactionTotal !== undefined &&
        data.importedCount > 0 &&
        transactionTotal === data.importedCount
      ) {
        captureFunnelEvent("first_import_committed", {});
      }
      // Account balances are sums of transactions, so they change with every committed row.
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.allTransactions(workspace) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.dashboard(workspace) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.accounts(workspace) }),
      ]);
    },
    onError: (error) => {
      if (isMonthlyLimitReachedError(error)) setLimitDialogOpen(true);
    },
    onSettled: () => invalidateBillingSummary(queryClient, workspace),
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

  const importUsage = billingQuery.data?.usages.find((usage) => usage.feature === "file_import");
  const isFreePlan = billingQuery.data?.plan === "free";

  return (
    <AppShell>
      <div className="dashboard-page import-page">
        <header className="dashboard-header transaction-header">
          <div>
            <p className="eyebrow">
              <Download size={14} />
              Import · 3 steps
            </p>
            <h1>Import transactions</h1>
            <p>
              Bring your bank or credit-card statement in as a CSV or Excel file. We'll help you
              match the columns, review the rows, then save them to your budget.
            </p>
          </div>
          <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
            <button
              className="button primary"
              type="button"
              onClick={() => setMigrationWizardOpen(true)}
            >
              <FileSpreadsheet size={17} aria-hidden="true" /> Migration Wizard
            </button>
            <button className="button secondary" type="button" onClick={downloadTemplate}>
              <Download size={17} aria-hidden="true" /> Download template
            </button>
          </div>
        </header>

        <nav className="import-tabs" aria-label="Import source">
          <Link className={`import-tab ${entryMode === "file" ? "active" : ""}`} to="/app/import">
            <FileUp size={15} /> CSV / Excel file
          </Link>
          <Link
            className={`import-tab ${entryMode === "receipt" ? "active" : ""}`}
            to="/app/import?mode=receipt"
          >
            <Camera size={15} /> Photo receipt
          </Link>
        </nav>
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
        ) : entryMode === "receipt" ? (
          <div className="import-layout">
            <ReceiptEntry
              workspace={workspace}
              categories={categoriesQuery.data ?? []}
              onContinue={beginReceiptPreview}
            />
          </div>
        ) : (
          <>
            <div className="import-layout">
              <ImportFileStep
                dragActive={dragActive}
                handleDragEnter={handleDragEnter}
                handleDragOver={handleDragOver}
                handleDragLeave={handleDragLeave}
                handleDrop={handleDrop}
                chooseFile={chooseFile}
                convertWorkbookWorksheet={convertWorkbookWorksheet}
              />

              <ImportMappingStep
                resolvedPreset={resolvedPreset}
                requiresPhpConfirmation={requiresPhpConfirmation}
                canAttemptPreview={canAttemptPreview}
                descriptionMappingMissing={descriptionMappingMissing}
                previewPending={previewMutation.isPending}
                applyPreset={applyPreset}
                changeHeader={changeHeader}
                changeAmountMode={changeAmountMode}
                updateMapping={updateMapping}
                invalidatePreview={invalidatePreview}
                requestPreview={requestPreview}
              />

              <ImportReviewStep
                workspace={workspace}
                categories={categories}
                categoriesFailed={categoriesQuery.isError}
                accounts={accounts}
                existingSubscriptions={subscriptionsQuery.data?.items}
                commitMutation={commitMutation}
                limitTriggerRef={limitTriggerRef}
                importUsage={importUsage}
                isFreePlan={isFreePlan}
              />
            </div>
          </>
        )}
        {limitDialogOpen && (
          <BillingLimitDialog
            error={commitMutation.error}
            returnFocus={limitTriggerRef.current}
            onClose={() => setLimitDialogOpen(false)}
          />
        )}
        <SpreadsheetMigrationWizard
          open={migrationWizardOpen}
          onClose={() => setMigrationWizardOpen(false)}
          onComplete={() => setMigrationWizardOpen(false)}
        />
      </div>
    </AppShell>
  );
}
