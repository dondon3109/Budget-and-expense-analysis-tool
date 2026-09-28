import { FileUp, LoaderCircle } from "lucide-react";
import type { ChangeEvent, DragEvent } from "react";

import { useImportDraft } from "../../import/ImportDraftProvider";
import type { WorkbookImportClient } from "../../lib/workbookImportClient";

interface ImportFileStepProps {
  dragActive: boolean;
  handleDragEnter: (event: DragEvent<HTMLLabelElement>) => void;
  handleDragOver: (event: DragEvent<HTMLLabelElement>) => void;
  handleDragLeave: (event: DragEvent<HTMLLabelElement>) => void;
  handleDrop: (event: DragEvent<HTMLLabelElement>) => void;
  chooseFile: (event: ChangeEvent<HTMLInputElement>) => void;
  convertWorkbookWorksheet: (
    client: WorkbookImportClient,
    worksheetName: string,
    selectionId: number,
    sourceFileName: string,
  ) => Promise<void>;
}

/** Step 1: pick or drop a CSV or Excel file, and choose the worksheet of a workbook. */
export function ImportFileStep({
  dragActive,
  handleDragEnter,
  handleDragOver,
  handleDragLeave,
  handleDrop,
  chooseFile,
  convertWorkbookWorksheet,
}: ImportFileStepProps) {
  const {
    fileName,
    fileError,
    workbookBusy,
    worksheetNames,
    selectedWorksheet,
    worksheetRowCount,
    workbookWarnings,
    workbookClientRef,
    fileSelectionIdRef,
  } = useImportDraft();

  return (
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
  );
}
