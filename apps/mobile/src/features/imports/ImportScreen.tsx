import { MaterialCommunityIcons } from "@expo/vector-icons";
import { getDocumentAsync } from "expo-document-picker";
import { File } from "expo-file-system";
import { router } from "expo-router";
import {
  convertWorksheet,
  importPresets,
  inspectCsv,
  inspectWorkbook,
  parseCsv,
  resolvePresetMapping,
  type ImportPreview,
  type ImportPreviewRow,
  type ImportPresetId,
} from "@zoption/shared";
import { useMemo, useState } from "react";
import { FlatList, Pressable, Text, View, type ColorValue } from "react-native";

import { ImportTransportError, commitImport, previewImport, previewPdfImport } from "@/api/imports";
import { useSessionSnapshot } from "@/auth/session-state";
import { useLocalReferenceData } from "@/db/local-workspace-state";
import { useSyncState } from "@/sync/sync-state";
import { BottomSheet, Button, Card, FormField, MoneyValue, SelectionField } from "@/ui/components";
import { Screen } from "@/ui/screen";
import { useZoptionTheme } from "@/ui/theme-provider";
import { radii, spacing, typography } from "@/ui/tokens";

import {
  buildImportPreviewRequest,
  importFileKind,
  importKindLabels,
  importPresetLabels,
  initialMappingState,
  mappingProblems,
  MAX_CSV_FILE_BYTES,
  MAX_IMPORT_FILE_BYTES,
  MAX_IMPORT_ROWS,
  type ImportFileKind,
  type ImportMappingState,
} from "./import-form";

type Step = "choose" | "configure" | "preview" | "done";

interface Overrides {
  categoryId?: string;
  kind?: "expense" | "income";
}

const pickerTypes = [
  "text/csv",
  "text/plain",
  "text/comma-separated-values",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
  "application/pdf",
  "application/octet-stream",
];

export function ImportScreen() {
  const theme = useZoptionTheme();
  const session = useSessionSnapshot();
  const sync = useSyncState();
  const reference = useLocalReferenceData();
  const [step, setStep] = useState<Step>("choose");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fileName, setFileName] = useState("");
  const [fileKind, setFileKind] = useState<ImportFileKind | null>(null);
  const [csvText, setCsvText] = useState("");
  const [headerRowNumber, setHeaderRowNumber] = useState(1);
  const [headerCandidates, setHeaderCandidates] = useState<
    { id: string; label: string; detail: string }[]
  >([]);
  const [workbookBytes, setWorkbookBytes] = useState<Uint8Array | null>(null);
  const [worksheetNames, setWorksheetNames] = useState<string[]>([]);
  const [worksheetName, setWorksheetName] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [localRowCount, setLocalRowCount] = useState(0);
  const [mappingState, setMappingState] = useState<ImportMappingState | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [overrides, setOverrides] = useState<Map<number, Overrides>>(new Map());
  const [editingRow, setEditingRow] = useState<ImportPreviewRow | null>(null);
  const [result, setResult] = useState<{ importedCount: number; rejectedCount: number } | null>(
    null,
  );
  const [needsAiEntryConsent, setNeedsAiEntryConsent] = useState(false);

  const withToken = async <T,>(operation: (token: string) => Promise<T>): Promise<T> => {
    try {
      return await operation(await session.getAccessToken(false));
    } catch (tokenError) {
      if (tokenError instanceof ImportTransportError && tokenError.code === "session_expired") {
        return operation(await session.getAccessToken(true));
      }
      throw tokenError;
    }
  };

  const pickFile = async (): Promise<void> => {
    setError(null);
    try {
      const picked = await getDocumentAsync({
        type: pickerTypes,
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (picked.canceled) return;
      const asset = picked.assets[0];
      if (!asset) return;
      await readFile(asset.name, asset.uri, asset.size ?? 0);
    } catch (readError) {
      setError(
        readError instanceof Error
          ? readError.message
          : "The file could not be opened on this device.",
      );
    }
  };

  const readFile = async (name: string, uri: string, size: number): Promise<void> => {
    const kind = importFileKind(name);
    if (kind === "unsupported") {
      setError("Choose a CSV, XLSX, XLS, or PDF file.");
      return;
    }
    if (size > MAX_IMPORT_FILE_BYTES) {
      setError("Import files must be 5 MB or smaller.");
      return;
    }
    if (kind === "csv" && size > MAX_CSV_FILE_BYTES) {
      setError("CSV files must be 1 MB or smaller.");
      return;
    }
    if (kind === "pdf") {
      await previewPdfFile(name, uri);
      return;
    }
    setBusy(true);
    try {
      const bytes = await new File(uri).bytes();
      if (kind === "workbook") {
        readWorkbook(name, bytes);
      } else {
        readCsv(name, new TextDecoder("utf-8").decode(bytes));
      }
    } catch (readError) {
      setError(readError instanceof Error ? readError.message : "The file could not be read.");
    } finally {
      setBusy(false);
    }
  };

  const previewPdfFile = async (name: string, uri: string): Promise<void> => {
    setBusy(true);
    setError(null);
    setNeedsAiEntryConsent(false);
    try {
      const next = await withToken((accessToken) =>
        previewPdfImport({ accessToken, file: { uri, fileName: name } }),
      );
      setFileName(name);
      setFileKind("pdf");
      setPreview(next);
      setOverrides(new Map());
      setStep("preview");
    } catch (previewError) {
      setNeedsAiEntryConsent(
        previewError instanceof ImportTransportError &&
          previewError.code === "entry_consent_required",
      );
      setError(previewError instanceof Error ? previewError.message : "The PDF preview failed.");
    } finally {
      setBusy(false);
    }
  };

  const readWorkbook = (name: string, bytes: Uint8Array): void => {
    const buffer = bytes.buffer.slice(
      bytes.byteOffset,
      bytes.byteOffset + bytes.byteLength,
    ) as ArrayBuffer;
    const names = inspectWorkbook(buffer);
    setFileName(name);
    setFileKind("workbook");
    setWorkbookBytes(bytes);
    setWorksheetNames(names);
    setWorksheetName(names[0] ?? "");
    applyWorksheet(name, names[0] ?? "", bytes);
  };

  const applyWorksheet = (name: string, sheet: string, bytes: Uint8Array): void => {
    const buffer = bytes.buffer.slice(
      bytes.byteOffset,
      bytes.byteOffset + bytes.byteLength,
    ) as ArrayBuffer;
    const conversion = convertWorksheet(buffer, sheet);
    setWorksheetName(sheet);
    setStep("configure");
    applyCsv(name, conversion.csvText);
  };

  const readCsv = (name: string, text: string): void => {
    setFileName(name);
    setFileKind("csv");
    setWorkbookBytes(null);
    applyCsv(name, text);
  };

  const applyCsv = (name: string, text: string): void => {
    const inspection = inspectCsv(text);
    setCsvText(text);
    setHeaderRowNumber(inspection.suggestedHeaderRowNumber);
    setHeaderCandidates(
      inspection.candidates.slice(0, 8).map((candidate) => ({
        id: String(candidate.rowNumber),
        label: "Row " + candidate.rowNumber,
        detail: candidate.values.slice(0, 4).join(" · "),
      })),
    );
    const parsed = parseCsv(text, { headerRowNumber: inspection.suggestedHeaderRowNumber });
    setHeaders(parsed.headers);
    setLocalRowCount(Math.min(parsed.rows.length, MAX_IMPORT_ROWS));
    setMappingState(initialMappingState(name, parsed.headers));
    setStep("configure");
  };

  const reparseWithHeaderRow = (row: number): void => {
    try {
      const parsed = parseCsv(csvText, { headerRowNumber: row });
      setHeaderRowNumber(row);
      setHeaders(parsed.headers);
      setLocalRowCount(Math.min(parsed.rows.length, MAX_IMPORT_ROWS));
      setMappingState(initialMappingState(fileName, parsed.headers));
      setError(null);
    } catch (parseError) {
      setError(parseError instanceof Error ? parseError.message : "That header row is invalid.");
    }
  };

  const applyPreset = (presetId: ImportPresetId): void => {
    if (!mappingState) return;
    const preset = importPresets.find((candidate) => candidate.id === presetId);
    if (!preset) return;
    setMappingState({
      presetId,
      mapping: resolvePresetMapping(headers, preset).mapping,
      fallbackDate: mappingState.fallbackDate,
    });
  };

  const patchMapping = (patch: Partial<ImportMappingState["mapping"]>): void => {
    if (!mappingState) return;
    setMappingState({ ...mappingState, mapping: { ...mappingState.mapping, ...patch } });
  };

  const problems = useMemo(
    () => (mappingState ? mappingProblems(mappingState, headers) : []),
    [headers, mappingState],
  );

  const continueToPreview = async (): Promise<void> => {
    if (!mappingState) return;
    if (problems.length > 0) {
      setError(problems[0]!.message);
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const input = buildImportPreviewRequest(fileName, csvText, headerRowNumber, mappingState);
      const next = await withToken((token) => previewImport({ accessToken: token, input }));
      setPreview(next);
      setOverrides(new Map());
      setStep("preview");
    } catch (previewError) {
      setError(previewError instanceof Error ? previewError.message : "The import preview failed.");
    } finally {
      setBusy(false);
    }
  };

  const confirmImport = async (): Promise<void> => {
    if (!preview) return;
    setError(null);
    setBusy(true);
    try {
      const categoryOverrides: { rowNumber: number; categoryId: string }[] = [];
      const kindOverrides: { rowNumber: number; kind: "expense" | "income" }[] = [];
      for (const [rowNumber, override] of overrides) {
        if (override.categoryId)
          categoryOverrides.push({ rowNumber, categoryId: override.categoryId });
        if (override.kind) kindOverrides.push({ rowNumber, kind: override.kind });
      }
      const next = await withToken((token) =>
        commitImport({
          accessToken: token,
          input: { token: preview.token, categoryOverrides, kindOverrides },
        }),
      );
      setResult(next);
      setStep("done");
      sync.retry();
    } catch (commitError) {
      if (
        commitError instanceof ImportTransportError &&
        (commitError.code === "preview_expired" || commitError.code === "duplicate_conflict")
      ) {
        setPreview(null);
        setStep("configure");
      }
      setError(
        commitError instanceof Error ? commitError.message : "The import could not be saved.",
      );
    } finally {
      setBusy(false);
    }
  };

  const categoryOptions = useMemo(() => {
    const categories = (reference.data?.categories ?? []).filter(
      (category) => category.kind !== "transfer" && category.syncState !== "pending",
    );
    return categories.map((category) => ({
      id: category.id,
      label: category.name,
      detail: category.kind === "income" ? "Income" : "Expense",
    }));
  }, [reference.data]);

  const headerColumnOptions = useMemo(
    () =>
      headers.map((header, index) => ({
        id: header,
        label: header || "Column " + (index + 1),
      })),
    [headers],
  );

  const presetOptions = useMemo(
    () =>
      importPresets.map((preset) => ({
        id: preset.id,
        label: importPresetLabels[preset.id],
        detail: preset.guidance,
      })),
    [],
  );

  const rowStatusColor = (row: ImportPreviewRow): ColorValue => {
    if (row.status === "ready") return theme.colors.income;
    if (row.status === "duplicate") return theme.colors.warning;
    return theme.colors.danger;
  };

  const editRowOverride = (patch: Partial<Overrides>): void => {
    if (!editingRow) return;
    setOverrides((current) => {
      const next = new Map(current);
      next.set(editingRow.rowNumber, { ...next.get(editingRow.rowNumber), ...patch });
      return next;
    });
  };

  const retryCurrentStep = (): void => {
    setError(null);
    if (step === "choose") void pickFile();
    else if (step === "configure") void continueToPreview();
    else if (step === "preview") void confirmImport();
  };

  return (
    <Screen
      scroll={step !== "preview"}
      title="Import transactions"
      description="Preview first — nothing is added until you confirm."
    >
      {step === "choose" ? (
        <View className="w-full gap-4">
          <Card>
            <View className="gap-2">
              <Text style={[typography.headline, { color: theme.colors.text }]}>
                Import from a bank file
              </Text>
              <Text style={[typography.body, { color: theme.colors.textMuted }]}>
                Choose a CSV, XLSX, XLS, or PDF statement. Zoption detects the rows, flags
                duplicates, and shows every transaction before saving anything.
              </Text>
              <Text style={[typography.caption, { color: theme.colors.textMuted }]}>
                Template: Date, Description, Amount, Type, Category — one row per transaction.
                Philippine pesos only; other currencies are flagged during preview.
              </Text>
              <Button
                accessibilityHint="Opens the system file picker"
                loading={busy}
                onPress={() => void pickFile()}
              >
                Choose file
              </Button>
            </View>
          </Card>
          <Card>
            <View className="flex-row items-center gap-2">
              <MaterialCommunityIcons
                accessibilityElementsHidden
                color={theme.colors.textMuted}
                name="shield-check-outline"
                size={18}
              />
              <Text style={[typography.caption, { color: theme.colors.textMuted, flex: 1 }]}>
                CSV and spreadsheets are read on this device. PDFs are sent only after the AI entry
                notice, processed in-flight, then shown through the same duplicate-aware preview
                before you confirm.
              </Text>
            </View>
          </Card>
        </View>
      ) : null}

      {step === "configure" ? (
        <View className="w-full gap-4">
          <Card>
            <View className="gap-2">
              <Text style={[typography.headline, { color: theme.colors.text }]}>{fileName}</Text>
              <Text style={[typography.caption, { color: theme.colors.textMuted }]}>
                {localRowCount} {localRowCount === 1 ? "row" : "rows"} below the header.
              </Text>
              {fileKind === "workbook" && worksheetNames.length > 1 && workbookBytes ? (
                <SelectionField
                  disabled={busy}
                  label="Worksheet"
                  placeholder="Choose a worksheet"
                  sheetTitle="Worksheets"
                  value={worksheetName}
                  options={worksheetNames.map((name) => ({ id: name, label: name }))}
                  onSelect={(sheet) => applyWorksheet(fileName, sheet, workbookBytes)}
                />
              ) : null}
              {headerCandidates.length > 1 ? (
                <SelectionField
                  disabled={busy}
                  label="Header row"
                  placeholder="Choose the header row"
                  sheetTitle="Header row"
                  value={String(headerRowNumber)}
                  options={headerCandidates}
                  onSelect={(value) => reparseWithHeaderRow(Number(value))}
                />
              ) : null}
            </View>
          </Card>
          {mappingState ? (
            <Card>
              <View className="gap-3">
                <Text style={[typography.headline, { color: theme.colors.text }]}>
                  Column mapping
                </Text>
                <SelectionField
                  label="Bank format"
                  placeholder="Choose a format"
                  sheetTitle="Bank format"
                  value={mappingState.presetId}
                  options={presetOptions}
                  onSelect={(presetId) => applyPreset(presetId as ImportPresetId)}
                />
                <SelectionField
                  label="Date"
                  placeholder="Not mapped"
                  sheetTitle="Date column"
                  value={mappingState.mapping.date ?? ""}
                  options={headerColumnOptions}
                  onSelect={(value) => patchMapping({ date: value })}
                />
                <SelectionField
                  label="Description"
                  placeholder="Not mapped"
                  sheetTitle="Description column"
                  value={mappingState.mapping.description ?? ""}
                  options={headerColumnOptions}
                  onSelect={(value) => patchMapping({ description: value })}
                />
                <SelectionField
                  label="Amount"
                  placeholder="Not mapped"
                  sheetTitle="Amount column"
                  value={mappingState.mapping.amount ?? ""}
                  options={headerColumnOptions}
                  onSelect={(value) =>
                    patchMapping({ amount: value, debit: undefined, credit: undefined })
                  }
                />
                <SelectionField
                  label="Debit"
                  placeholder="Not mapped"
                  sheetTitle="Debit column"
                  value={mappingState.mapping.debit ?? ""}
                  options={headerColumnOptions}
                  onSelect={(value) => patchMapping({ debit: value, amount: undefined })}
                />
                <SelectionField
                  label="Credit"
                  placeholder="Not mapped"
                  sheetTitle="Credit column"
                  value={mappingState.mapping.credit ?? ""}
                  options={headerColumnOptions}
                  onSelect={(value) => patchMapping({ credit: value, amount: undefined })}
                />
                <SelectionField
                  label="Type"
                  placeholder="Not mapped"
                  sheetTitle="Type column"
                  value={mappingState.mapping.kind ?? ""}
                  options={headerColumnOptions}
                  onSelect={(value) => patchMapping({ kind: value })}
                />
                <SelectionField
                  label="Category"
                  placeholder="Not mapped"
                  sheetTitle="Category column"
                  value={mappingState.mapping.category ?? ""}
                  options={headerColumnOptions}
                  onSelect={(value) => patchMapping({ category: value })}
                />
                {!mappingState.mapping.date ? (
                  <FormField
                    autoCapitalize="none"
                    label="Date for every row"
                    placeholder="YYYY-MM-DD"
                    value={mappingState.fallbackDate}
                    onChangeText={(value) =>
                      setMappingState({ ...mappingState, fallbackDate: value })
                    }
                  />
                ) : null}
                {problems.length > 0 ? (
                  <Text
                    accessibilityRole="alert"
                    style={[typography.caption, { color: theme.colors.danger }]}
                  >
                    {problems[0]!.message}
                  </Text>
                ) : null}
              </View>
            </Card>
          ) : null}
          <Button loading={busy} onPress={() => void continueToPreview()}>
            Preview import
          </Button>
        </View>
      ) : null}

      {step === "preview" && preview ? (
        <View className="w-full flex-1 gap-4">
          <Card>
            <View className="gap-2">
              <Text style={[typography.headline, { color: theme.colors.text }]}>
                {preview.fileName}
              </Text>
              <Text style={[typography.body, { color: theme.colors.text }]}>
                {preview.acceptedCount} ready · {preview.duplicateCount} duplicate ·{" "}
                {preview.rejectedCount} invalid
              </Text>
              <Text style={[typography.caption, { color: theme.colors.textMuted }]}>
                Duplicate rows are skipped and invalid rows are not imported. Tap a row to fix its
                category or type. Nothing is saved until you confirm.
              </Text>
            </View>
          </Card>
          <FlatList
            style={{ flexGrow: 0 }}
            contentContainerStyle={{ flexGrow: 1 }}
            data={preview.rows.slice(0, MAX_IMPORT_ROWS)}
            keyExtractor={(row) => String(row.rowNumber)}
            ListHeaderComponent={() => (
              <View
                style={{ flexDirection: "row", gap: spacing.sm, paddingHorizontal: spacing.xs }}
              >
                <Text style={[typography.caption, { color: theme.colors.textMuted, flex: 3 }]}>
                  Transaction
                </Text>
                <Text style={[typography.caption, { color: theme.colors.textMuted, flex: 2 }]}>
                  Amount
                </Text>
                <Text style={[typography.caption, { color: theme.colors.textMuted, flex: 1 }]}>
                  Status
                </Text>
              </View>
            )}
            renderItem={({ item }) => {
              const override = overrides.get(item.rowNumber);
              return (
                <Pressable
                  accessibilityLabel={
                    "Import row " + item.rowNumber + ": " + (item.description ?? "")
                  }
                  accessibilityHint="Opens category and type corrections"
                  onPress={() => setEditingRow(item)}
                  style={({ pressed }) => ({
                    opacity: pressed ? 0.7 : 1,
                    backgroundColor: theme.colors.surface,
                    borderRadius: radii.md,
                    marginVertical: spacing.xs,
                    padding: spacing.sm,
                    flexDirection: "row",
                    gap: spacing.sm,
                    alignItems: "center",
                  })}
                >
                  <View style={{ flex: 3, minWidth: 0 }}>
                    <Text numberOfLines={1} style={[typography.body, { color: theme.colors.text }]}>
                      {item.description ?? "Row " + item.rowNumber}
                    </Text>
                    {item.date ? (
                      <Text style={[typography.caption, { color: theme.colors.textMuted }]}>
                        {item.date}
                      </Text>
                    ) : null}
                    {override?.categoryId || override?.kind ? (
                      <Text style={[typography.caption, { color: theme.colors.brand }]}>
                        Edited
                      </Text>
                    ) : null}
                  </View>
                  <View style={{ flex: 2 }}>
                    {item.amountMinor !== undefined ? (
                      <MoneyValue
                        amountMinor={item.amountMinor}
                        tone={
                          item.kind === "income"
                            ? "income"
                            : item.kind === "expense"
                              ? "expense"
                              : "default"
                        }
                      />
                    ) : (
                      <Text style={[typography.caption, { color: theme.colors.textMuted }]}>—</Text>
                    )}
                  </View>
                  <View
                    style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: spacing.xs }}
                  >
                    <View
                      accessibilityElementsHidden
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: radii.round,
                        backgroundColor: rowStatusColor(item),
                      }}
                    />
                    <Text style={[typography.caption, { color: rowStatusColor(item) }]}>
                      {item.status === "ready"
                        ? "Ready"
                        : item.status === "duplicate"
                          ? "Duplicate"
                          : "Invalid"}
                    </Text>
                  </View>
                </Pressable>
              );
            }}
          />
          <Button
            disabled={preview.acceptedCount === 0}
            loading={busy}
            onPress={() => void confirmImport()}
          >
            Import {preview.acceptedCount}{" "}
            {preview.acceptedCount === 1 ? "transaction" : "transactions"}
          </Button>
        </View>
      ) : null}

      {step === "done" && result ? (
        <View className="w-full gap-4">
          <Card>
            <View className="items-center gap-2">
              <MaterialCommunityIcons
                accessibilityElementsHidden
                color={theme.colors.income}
                name="check-circle-outline"
                size={40}
              />
              <Text style={[typography.headline, { color: theme.colors.text }]}>
                Import complete
              </Text>
              <Text style={[typography.body, { color: theme.colors.text }]}>
                {result.importedCount} {result.importedCount === 1 ? "transaction" : "transactions"}{" "}
                saved to your workspace.
              </Text>
              {result.rejectedCount > 0 ? (
                <Text style={[typography.caption, { color: theme.colors.warning }]}>
                  {result.rejectedCount} rows were rejected and not imported.
                </Text>
              ) : null}
              <Text style={[typography.caption, { color: theme.colors.textMuted }]}>
                New transactions sync to this device on the next synchronization.
              </Text>
              <Button
                accessibilityHint="Returns to the previous screen"
                onPress={() => router.back()}
              >
                Done
              </Button>
            </View>
          </Card>
        </View>
      ) : null}

      {error ? (
        <View className="w-full gap-3">
          <Text accessibilityRole="alert" style={[typography.body, { color: theme.colors.danger }]}>
            {error}
          </Text>
          <Button variant="secondary" onPress={retryCurrentStep}>
            Retry
          </Button>
          {needsAiEntryConsent ? (
            <Button variant="quiet" onPress={() => router.push("/(app)/receipt-scan")}>
              Review AI entry notice
            </Button>
          ) : null}
        </View>
      ) : null}

      <BottomSheet
        visible={editingRow !== null}
        title={"Row " + (editingRow?.rowNumber ?? "")}
        onDismiss={() => setEditingRow(null)}
      >
        <View className="gap-3 pb-4">
          {editingRow && editingRow.errors.length > 0 ? (
            <View className="gap-1">
              {editingRow.errors.map((rowError) => (
                <Text key={rowError} style={[typography.caption, { color: theme.colors.danger }]}>
                  {rowError}
                </Text>
              ))}
            </View>
          ) : null}
          <SelectionField
            label="Category"
            placeholder="Keep detected category"
            sheetTitle="Category"
            value={overrides.get(editingRow?.rowNumber ?? -1)?.categoryId ?? ""}
            options={categoryOptions}
            onSelect={(categoryId) => editRowOverride({ categoryId })}
          />
          <SelectionField
            label="Type"
            placeholder="Keep detected type"
            sheetTitle="Type"
            value={overrides.get(editingRow?.rowNumber ?? -1)?.kind ?? ""}
            options={[
              { id: "expense", label: importKindLabels.expense },
              { id: "income", label: importKindLabels.income },
            ]}
            onSelect={(kind) => editRowOverride({ kind: kind as "expense" | "income" })}
          />
        </View>
      </BottomSheet>
    </Screen>
  );
}
