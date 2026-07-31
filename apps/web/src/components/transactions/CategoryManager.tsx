import type { CategoryInput, CategoryRecord, TransactionKind } from "@zoption/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Archive, Check, Pencil, Plus, RotateCcw, X } from "lucide-react";
import { useLayoutEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";

import { useBillingSummary } from "../../hooks/useBillingSummary";
import { PlanUsageIndicator } from "../billing/PlanUsageIndicator";
import { UpgradePrompt } from "../billing/UpgradePrompt";
import { createCategory, isBillingEnforcementError, updateCategory } from "../../lib/api";
import { queryKeys } from "../../lib/queryKeys";
import type { AuthenticatedWorkspace } from "../../lib/workspace";

interface CategoryManagerProps {
  workspace: AuthenticatedWorkspace;
  categories: CategoryRecord[];
  onClose: () => void;
}

const palette = [
  "#2a78d6",
  "#008300",
  "#e87ba4",
  "#eda100",
  "#1baf7a",
  "#eb6834",
  "#4a3aa7",
  "#e34948",
];

export function CategoryManager({ workspace, categories, onClose }: CategoryManagerProps) {
  const queryClient = useQueryClient();
  const billingQuery = useBillingSummary(workspace);
  const dialogRef = useRef<HTMLElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const [name, setName] = useState("");
  const [kind, setKind] = useState<TransactionKind>("expense");
  const [color, setColor] = useState(palette[0]!);
  const [editingId, setEditingId] = useState<string>();
  const [editingName, setEditingName] = useState("");
  const [error, setError] = useState<Error>();

  useLayoutEffect(() => {
    const root = document.getElementById("root");
    const previousBodyOverflow = document.body.style.overflow;
    const previousAriaHidden = root?.getAttribute("aria-hidden") ?? null;
    const previousInert = root?.inert ?? false;
    const activeElement = document.activeElement;

    if (activeElement instanceof HTMLElement && activeElement !== document.body) {
      openerRef.current = activeElement;
    }
    if (root) {
      root.inert = true;
      root.setAttribute("aria-hidden", "true");
    }
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();

    return () => {
      if (root) {
        root.inert = previousInert;
        if (previousAriaHidden === null) root.removeAttribute("aria-hidden");
        else root.setAttribute("aria-hidden", previousAriaHidden);
      }
      document.body.style.overflow = previousBodyOverflow;
      if (openerRef.current?.isConnected) openerRef.current.focus();
    };
  }, []);

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.allCategories(workspace) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.billing(workspace) }),
    ]);
  };
  const createMutation = useMutation({
    mutationFn: (input: CategoryInput) => createCategory(workspace, input),
    onSuccess: async () => {
      setName("");
      setError(undefined);
      await refresh();
    },
    onError: (mutationError) =>
      setError(
        mutationError instanceof Error
          ? mutationError
          : new Error("The category could not be saved."),
      ),
  });
  const updateMutation = useMutation({
    mutationFn: (args: Parameters<typeof updateCategory>[1]) => updateCategory(workspace, args),
    onSuccess: async () => {
      setEditingId(undefined);
      setError(undefined);
      await refresh();
      await queryClient.invalidateQueries({ queryKey: queryKeys.allTransactions(workspace) });
      await queryClient.invalidateQueries({ queryKey: queryKeys.dashboard(workspace) });
    },
    onError: (mutationError) =>
      setError(
        mutationError instanceof Error
          ? mutationError
          : new Error("The category could not be saved."),
      ),
  });

  const categoryAllowance = billingQuery.data?.allowances.find(
    (allowance) => allowance.resource === "custom_category",
  );
  const categoryAtLimit =
    categoryAllowance?.limit !== null &&
    categoryAllowance?.limit !== undefined &&
    categoryAllowance.used >= categoryAllowance.limit;
  const isFreePlan = billingQuery.data?.plan === "free";
  const createDisabled = createMutation.isPending || categoryAtLimit;

  function handleCreate(event: FormEvent) {
    event.preventDefault();
    if (createDisabled) return;
    const input: CategoryInput = { name, kind, color };
    createMutation.mutate(input);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key !== "Tab") return;

    const focusable = Array.from(
      dialogRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ) ?? [],
    ).filter((element) => element.tabIndex >= 0);
    const first = focusable[0];
    const last = focusable.at(-1);
    if (!first || !last) return;

    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    } else if (!dialogRef.current?.contains(document.activeElement)) {
      event.preventDefault();
      (event.shiftKey ? last : first).focus();
    }
  }

  return createPortal(
    <div
      className="modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        ref={dialogRef}
        className="form-modal category-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="category-manager-title"
        aria-describedby={categoryAllowance ? "category-manager-limit-copy" : undefined}
        onKeyDown={handleKeyDown}
      >
        <header className="modal-header">
          <div>
            <p className="eyebrow">Organize spending</p>
            <h2 id="category-manager-title">Manage categories</h2>
          </div>
          <button
            ref={closeButtonRef}
            className="icon-button"
            type="button"
            onClick={onClose}
            aria-label="Close"
          >
            <X size={19} />
          </button>
        </header>
        {categoryAllowance && (
          <div id="category-manager-limit-copy" className="category-manager-limit">
            <PlanUsageIndicator
              label={isFreePlan ? "Free plan custom categories" : "Active custom categories"}
              used={categoryAllowance.used}
              limit={categoryAllowance.limit}
              detail={
                isFreePlan
                  ? "Free includes 1 active custom category. Pro-required categories stay visible but cannot be used until you upgrade; archive a Free custom category to free the slot."
                  : "Starter and protected Uncategorized categories do not count toward this allowance."
              }
              showUpgrade={isFreePlan}
            />
          </div>
        )}
        <form
          className={`new-category-form${categoryAtLimit ? " limit-reached" : ""}`}
          onSubmit={handleCreate}
          aria-disabled={categoryAtLimit}
        >
          <label>
            <span>New category</span>
            <input
              ref={nameInputRef}
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="e.g. Health"
              maxLength={80}
              disabled={createDisabled}
              required
            />
          </label>
          <label>
            <span>Type</span>
            <select
              value={kind}
              disabled={createDisabled}
              onChange={(event) => setKind(event.target.value as TransactionKind)}
            >
              <option value="expense">Money out</option>
              <option value="income">Money in</option>
              <option value="transfer">Transfer</option>
            </select>
          </label>
          <fieldset>
            <legend>Color</legend>
            <div className="color-picker">
              {palette.map((option) => (
                <button
                  key={option}
                  type="button"
                  className={color === option ? "selected" : ""}
                  style={{ backgroundColor: option }}
                  disabled={createDisabled}
                  onClick={() => setColor(option)}
                  aria-label={`Use color ${option}`}
                  aria-pressed={color === option}
                >
                  {color === option && <Check size={13} />}
                </button>
              ))}
            </div>
          </fieldset>
          <button
            className={categoryAtLimit ? "button secondary category-limit-add" : "button primary"}
            type="submit"
            disabled={createDisabled}
          >
            <Plus size={16} /> Add
          </button>
        </form>
        <UpgradePrompt error={error} />
        {error && !isBillingEnforcementError(error) && (
          <p className="form-error" role="alert">
            {error.message}
          </p>
        )}
        <div className="category-manager-list">
          {categories.map((category) => (
            <div
              className={`manager-category${category.archived ? " archived" : ""}${category.locked ? " locked" : ""}`}
              key={category.id}
            >
              <i style={{ backgroundColor: category.color }} />
              {editingId === category.id ? (
                <input
                  value={editingName}
                  onChange={(event) => setEditingName(event.target.value)}
                  maxLength={80}
                  autoFocus
                />
              ) : (
                <div>
                  <strong>{category.name}</strong>
                  <span>
                    {category.kind === "income"
                      ? "Money in"
                      : category.kind === "expense"
                        ? "Money out"
                        : "Transfer"}
                    {category.archived ? " · Archived" : ""}
                    {category.origin === "starter" ? " · Included starter" : ""}
                    {category.origin === "custom" ? " · Custom" : ""}
                    {category.requiredPlan === "zoption_pro" ? " · Pro required" : ""}
                    {category.system ? " · Required for imports" : ""}
                  </span>
                </div>
              )}
              <div className="manager-actions">
                {!category.system &&
                  (editingId === category.id ? (
                    <>
                      <button
                        type="button"
                        onClick={() =>
                          updateMutation.mutate({ id: category.id, input: { name: editingName } })
                        }
                        aria-label="Save category name"
                      >
                        <Check size={15} />
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingId(undefined)}
                        aria-label="Cancel edit"
                      >
                        <X size={15} />
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => {
                          setEditingId(category.id);
                          setEditingName(category.name);
                        }}
                        aria-label={`Rename ${category.name}`}
                      >
                        <Pencil size={15} />
                      </button>
                      <button
                        type="button"
                        disabled={
                          updateMutation.isPending ||
                          (category.archived &&
                            category.origin === "custom" &&
                            (category.locked || categoryAtLimit))
                        }
                        onClick={() =>
                          updateMutation.mutate({
                            id: category.id,
                            input: { archived: !category.archived },
                          })
                        }
                        aria-label={`${category.archived ? "Restore" : "Archive"} ${category.name}`}
                        title={
                          category.archived && category.locked
                            ? "Upgrade to Zoption Pro before restoring this category."
                            : category.archived && category.origin === "custom" && categoryAtLimit
                              ? "Archive an active Free custom category or upgrade before restoring this one."
                              : undefined
                        }
                      >
                        {category.archived ? <RotateCcw size={15} /> : <Archive size={15} />}
                      </button>
                    </>
                  ))}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>,
    document.body,
  );
}
