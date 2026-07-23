import type {
  CsvInspection,
  ImportCommitResult,
  ImportMapping,
  ImportPreview,
  TransactionKind,
} from "@zoption/shared";
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";

import { useAuth } from "../auth/AuthProvider";
import type { ImportAmountMode, ImportPreset, ImportPresetId } from "../lib/importPresets";
import type { WorkbookImportClient } from "../lib/workbookImportClient";

export function localToday(): string {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function emptyImportMapping(): ImportMapping {
  return { description: "", amount: "" };
}

function useImportDraftState() {
  const [fileName, setFileName] = useState("");
  const [csvText, setCsvText] = useState("");
  const [inspection, setInspection] = useState<CsvInspection>();
  const [headerRowNumber, setHeaderRowNumber] = useState<number>();
  const [selectedRowCount, setSelectedRowCount] = useState(0);
  const [headers, setHeaders] = useState<string[]>([]);
  const [mapping, setMapping] = useState<ImportMapping>(emptyImportMapping);
  const [amountMode, setAmountMode] = useState<ImportAmountMode>("amount");
  const [selectedPresetId, setSelectedPresetId] = useState<ImportPresetId>("auto");
  const [resolvedPresetId, setResolvedPresetId] = useState<ImportPreset["id"]>("generic");
  const [phpConfirmed, setPhpConfirmed] = useState(false);
  const [fallbackDate, setFallbackDate] = useState(localToday);
  const [worksheetNames, setWorksheetNames] = useState<string[]>([]);
  const [selectedWorksheet, setSelectedWorksheet] = useState("");
  const [worksheetRowCount, setWorksheetRowCount] = useState<number>();
  const [workbookWarnings, setWorkbookWarnings] = useState<string[]>([]);
  const [workbookBusy, setWorkbookBusy] = useState(false);
  const [fileError, setFileError] = useState<string>();
  const [previewError, setPreviewError] = useState<Error>();
  const [previewAttempted, setPreviewAttempted] = useState(false);
  const [preview, setPreview] = useState<ImportPreview>();
  const [previewPage, setPreviewPage] = useState(1);
  const [categoryOverrides, setCategoryOverrides] = useState<Record<number, string>>({});
  const [kindOverrides, setKindOverrides] = useState<Record<number, TransactionKind>>({});
  const [bulkKind, setBulkKind] = useState<TransactionKind>();
  const [selectedRows, setSelectedRows] = useState<number[]>([]);
  const [bulkCategoryId, setBulkCategoryId] = useState("");
  const [result, setResult] = useState<ImportCommitResult>();
  const workbookClientRef = useRef<WorkbookImportClient | undefined>(undefined);
  const fileSelectionIdRef = useRef(0);
  const previewGenerationRef = useRef(0);

  useEffect(
    () => () => {
      workbookClientRef.current?.dispose();
    },
    [],
  );

  return {
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
  };
}

type ImportDraftContextValue = ReturnType<typeof useImportDraftState>;

const ImportDraftContext = createContext<ImportDraftContextValue | undefined>(undefined);

function ImportDraftStateProvider({ children }: { children: ReactNode }) {
  const value = useImportDraftState();
  return <ImportDraftContext.Provider value={value}>{children}</ImportDraftContext.Provider>;
}

export function ImportDraftProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  return (
    <ImportDraftStateProvider key={user?.id ?? "signed-out"}>{children}</ImportDraftStateProvider>
  );
}

export function useImportDraft(): ImportDraftContextValue {
  const context = useContext(ImportDraftContext);
  if (!context) throw new Error("useImportDraft must be used within ImportDraftProvider.");
  return context;
}
