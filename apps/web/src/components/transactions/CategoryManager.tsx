import {
  categoryIconEmojiSchema,
  type CategoryInput,
  type CategoryRecord,
  type TransactionKind,
} from "@zoption/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Archive, Check, Pencil, Plus, RotateCcw, X } from "lucide-react";
import { useLayoutEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";

import { useBillingSummary } from "../../hooks/useBillingSummary";
import { useRootLock } from "../../hooks/useRootLock";
import { PlanUsageIndicator } from "../billing/PlanUsageIndicator";
import { UpgradePrompt } from "../billing/UpgradePrompt";
import { createCategory, isBillingEnforcementError, updateCategory } from "../../lib/api";
import {
  optimisticId,
  restoreOptimisticSnapshot,
  updateOptimistically,
} from "../../lib/optimistic";
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

const emojiPalette = ["🍔", "🛒", "🏠", "🚗", "💡", "🎁", "💊", "✈️", "💼", "💰"];

function emojiValue(value: string): string | null | undefined {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = categoryIconEmojiSchema.safeParse(trimmed);
  return parsed.success ? parsed.data : undefined;
}

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
  const [iconEmoji, setIconEmoji] = useState("");
  const [editingId, setEditingId] = useState<string>();
  const [editingName, setEditingName] = useState("");
  const [editingIconEmoji, setEditingIconEmoji] = useState("");
  const [error, setError] = useState<Error>();

  useRootLock(true);

  useLayoutEffect(() => {
    const activeElement = document.activeElement;

    if (activeElement instanceof HTMLElement && activeElement !== document.body) {
      openerRef.current = activeElement;
    }
    closeButtonRef.current?.focus();

    return () => {
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
    onMutate: async (input) => {
      const id = optimisticId("category");
      const category: CategoryRecord = {
        ...input,
        id,
        iconEmoji: input.iconEmoji ?? null,
        archived: false,
        system: false,
        origin: "custom",
        requiredPlan: "free",
        locked: false,
      };
      const snapshot = await updateOptimistically<CategoryRecord[]>(
        queryClient,
        queryKeys.allCategories(workspace),
        (current) => (current ? [...current, category] : current),
        false,
      );
      setName("");
      setIconEmoji("");
      setError(undefined);
      return { id, input, snapshot };
    },
    onSuccess: (saved, _input, context) => {
      queryClient.setQueriesData<CategoryRecord[]>(
        { queryKey: queryKeys.allCategories(workspace) },
        (current) => current?.map((item) => (item.id === context.id ? saved : item)),
      );
    },
    onSettled: () => {
      void refresh();
    },
    onError: (mutationError, _input, context) => {
      restoreOptimisticSnapshot(queryClient, context?.snapshot);
      if (context) {
        setName(context.input.name);
        setKind(context.input.kind);
        setColor(context.input.color);
        setIconEmoji(context.input.iconEmoji ?? "");
      }
      setError(
        mutationError instanceof Error
          ? mutationError
          : new Error("The category could not be saved."),
      );
    },
  });
  const updateMutation = useMutation({
    mutationFn: (args: Parameters<typeof updateCategory>[1]) => updateCategory(workspace, args),
    onMutate: async ({ id, input }) => {
      const form = { id: editingId, name: editingName, iconEmoji: editingIconEmoji };
      const snapshot = await updateOptimistically<CategoryRecord[]>(
        queryClient,
        queryKeys.allCategories(workspace),
        (current) =>
          current?.map((item) =>
            item.id === id
              ? {
                  ...item,
                  ...input,
                  iconEmoji: input.iconEmoji === undefined ? item.iconEmoji : input.iconEmoji,
                }
              : item,
          ),
        false,
      );
      setEditingId(undefined);
      setError(undefined);
      return { form, snapshot };
    },
    onSuccess: (saved) => {
      queryClient.setQueriesData<CategoryRecord[]>(
        { queryKey: queryKeys.allCategories(workspace) },
        (current) => current?.map((item) => (item.id === saved.id ? saved : item)),
      );
    },
    onSettled: () => {
      void Promise.all([
        refresh(),
        queryClient.invalidateQueries({ queryKey: queryKeys.allTransactions(workspace) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.dashboard(workspace) }),
      ]);
    },
    onError: (mutationError, _args, context) => {
      restoreOptimisticSnapshot(queryClient, context?.snapshot);
      if (context) {
        setEditingId(context.form.id);
        setEditingName(context.form.name);
        setEditingIconEmoji(context.form.iconEmoji);
      }
      setError(
        mutationError instanceof Error
          ? mutationError
          : new Error("The category could not be saved."),
      );
    },
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
    const parsedIcon = categoryIconEmojiSchema
      .nullable()
      .safeParse(iconEmoji.trim() ? iconEmoji.trim() : null);
    if (!parsedIcon.success) {
      setError(new Error("Choose one emoji for the category icon."));
      return;
    }
    const input: CategoryInput = { name, kind, color, iconEmoji: parsedIcon.data };
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
                  ? "Free includes 4 active custom categories. Pro-required categories stay visible but cannot be used until you upgrade; archive a Free custom category to free the slot."
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
          <fieldset className="emoji-fieldset">
            <legend>
              Icon <span>Optional</span>
            </legend>
            <div className="emoji-input-row">
              <input
                aria-label="Custom category emoji"
                value={iconEmoji}
                inputMode="text"
                maxLength={32}
                placeholder="Add one emoji"
                disabled={createDisabled}
                onChange={(event) => {
                  setIconEmoji(event.target.value);
                  setError(undefined);
                }}
              />
              {iconEmoji ? (
                <button type="button" onClick={() => setIconEmoji("")} disabled={createDisabled}>
                  Clear
                </button>
              ) : null}
            </div>
            <div className="emoji-picker" aria-label="Suggested category icons">
              {emojiPalette.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  disabled={createDisabled}
                  className={iconEmoji === emoji ? "selected" : ""}
                  aria-label={`Use ${emoji} as category icon`}
                  aria-pressed={iconEmoji === emoji}
                  onClick={() => setIconEmoji(emoji)}
                >
                  {emoji}
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
              <span
                className={`category-icon-preview${category.iconEmoji ? " has-emoji" : ""}`}
                style={{ backgroundColor: category.iconEmoji ? undefined : category.color }}
                aria-hidden="true"
              >
                {category.iconEmoji}
              </span>
              {editingId === category.id ? (
                <div className="manager-category-editor">
                  <input
                    value={editingName}
                    onChange={(event) => setEditingName(event.target.value)}
                    maxLength={80}
                    autoFocus
                    aria-label="Category name"
                  />
                  <div className="emoji-input-row compact">
                    <input
                      value={editingIconEmoji}
                      onChange={(event) => setEditingIconEmoji(event.target.value)}
                      maxLength={32}
                      placeholder="Emoji icon (optional)"
                      aria-label="Category emoji icon"
                    />
                    {editingIconEmoji ? (
                      <button type="button" onClick={() => setEditingIconEmoji("")}>
                        Clear
                      </button>
                    ) : null}
                  </div>
                  <div className="emoji-picker compact" aria-label="Suggested category icons">
                    {emojiPalette.map((emoji) => (
                      <button
                        key={emoji}
                        type="button"
                        className={editingIconEmoji === emoji ? "selected" : ""}
                        aria-label={`Use ${emoji} as category icon`}
                        aria-pressed={editingIconEmoji === emoji}
                        onClick={() => setEditingIconEmoji(emoji)}
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                </div>
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
                        onClick={() => {
                          const nextIconEmoji = emojiValue(editingIconEmoji);
                          if (nextIconEmoji === undefined) {
                            setError(new Error("Choose one emoji for the category icon."));
                            return;
                          }
                          updateMutation.mutate({
                            id: category.id,
                            input: { name: editingName, iconEmoji: nextIconEmoji },
                          });
                        }}
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
                          setEditingIconEmoji(category.iconEmoji ?? "");
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
