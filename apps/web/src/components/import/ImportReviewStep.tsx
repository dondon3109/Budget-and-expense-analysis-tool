import {
  transactionKinds,
  type AccountRecord,
  type BillingSummary,
  type CategoryRecord,
  type ImportCommitRequest,
  type ImportCommitResult,
  type SubscriptionMonthItem,
  type TransactionKind,
} from "@zoption/shared";
import type { UseMutationResult } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, ShieldCheck, Tags } from "lucide-react";
import type { RefObject } from "react";

import { useImportDraft } from "../../import/ImportDraftProvider";
import { isBillingEnforcementError } from "../../lib/api";
import type { AuthenticatedWorkspace } from "../../lib/workspace";
import { PlanUsageIndicator } from "../billing/PlanUsageIndicator";
import { UpgradePrompt } from "../billing/UpgradePrompt";
import { ImportPreviewTable } from "./ImportPreviewTable";
import { ImportSubscriptionSuggestions } from "./ImportSubscriptionSuggestions";

const PREVIEW_PAGE_SIZE = 100;

interface ImportReviewStepProps {
  workspace: AuthenticatedWorkspace;
  categories: CategoryRecord[];
  categoriesFailed: boolean;
  accounts: AccountRecord[];
  existingSubscriptions: SubscriptionMonthItem[] | undefined;
  commitMutation: UseMutationResult<ImportCommitResult, Error, ImportCommitRequest>;
  /** Receives the control that started the commit, so the limit dialog can return focus to it. */
  limitTriggerRef: RefObject<HTMLElement | null>;
  importUsage: BillingSummary["usages"][number] | undefined;
  isFreePlan: boolean;
}

/** Step 3: review the preview, recategorize Uncategorized rows in bulk, and commit. */
export function ImportReviewStep({
  workspace,
  categories,
  categoriesFailed,
  accounts,
  existingSubscriptions,
  commitMutation,
  limitTriggerRef,
  importUsage,
  isFreePlan,
}: ImportReviewStepProps) {
  const {
    preview,
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
  } = useImportDraft();
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
    <section className={`import-card import-preview-card ${preview ? "" : "disabled-card"}`}>
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

          <ImportSubscriptionSuggestions
            preview={preview}
            categories={categories}
            accounts={accounts}
            workspace={workspace}
            existingSubscriptions={existingSubscriptions}
          />

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
                <button className="button secondary" type="button" onClick={toggleAllEligible}>
                  {allEligibleSelected ? "Clear selection" : `Select all ${eligibleRows.length}`}
                </button>
                <label>
                  <span>New category (optional)</span>
                  <select
                    value={bulkCategoryId}
                    onChange={(event) => setBulkCategoryId(event.target.value)}
                  >
                    <option value="">Use Uncategorized</option>
                    {availableBulkCategories.map((category) => (
                      <option key={category.id} value={category.id} disabled={category.locked}>
                        {category.name}
                        {category.locked ? " — Pro required" : ""}
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
              {categoriesFailed && <p className="page-error">Categories could not be loaded.</p>}
            </div>
          )}

          <ImportPreviewTable
            rows={visibleRows}
            categories={categories}
            kindOverrides={kindOverrides}
            categoryOverrides={categoryOverrides}
            selectedRows={selectedRows}
            toggleRow={toggleRow}
          />

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
              <strong className="import-commit-usage">Saving uses 1 monthly file import.</strong>
              Preview expires in 15 minutes.
              {Object.keys(kindOverrides).length > 0 &&
                ` ${Object.keys(kindOverrides).length} transaction type ${Object.keys(kindOverrides).length === 1 ? "change" : "changes"} will be applied.`}
              {Object.keys(categoryOverrides).length > 0 &&
                ` ${Object.keys(categoryOverrides).length} category ${Object.keys(categoryOverrides).length === 1 ? "change" : "changes"} will be applied.`}
            </span>
            <button
              className="button primary"
              type="button"
              disabled={preview.acceptedCount === 0 || commitMutation.isPending || !commitRequest}
              onClick={() => {
                if (!commitRequest) return;
                limitTriggerRef.current =
                  document.activeElement instanceof HTMLElement ? document.activeElement : null;
                commitMutation.mutate(commitRequest);
              }}
            >
              {commitMutation.isPending
                ? "Importing…"
                : `Import ${preview.acceptedCount} ready rows`}
            </button>
          </div>
          <UpgradePrompt error={commitMutation.error} />
          {commitMutation.isError && !isBillingEnforcementError(commitMutation.error) && (
            <p className="page-error" role="alert">
              {commitMutation.error.message}
            </p>
          )}
        </>
      )}
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
      {importUsage && (
        <div className="import-plan-usage">
          <PlanUsageIndicator
            label={
              isFreePlan
                ? "Free plan committed file imports this month"
                : "Committed file imports this month"
            }
            used={importUsage.used}
            limit={importUsage.limit}
            resetsAt={importUsage.resetsAt}
            detail={
              isFreePlan
                ? "Free includes 1 saved file import each month. Previewing files does not use it."
                : "One import is used only when ready rows are saved."
            }
            showUpgrade={isFreePlan}
          />
        </div>
      )}
    </section>
  );
}
