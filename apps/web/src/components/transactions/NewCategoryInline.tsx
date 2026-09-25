import { categoryInputSchema, type CategoryRecord, type TransactionKind } from "@zoption/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { useRef, useState, type KeyboardEvent } from "react";

import { UpgradePrompt } from "../billing/UpgradePrompt";
import { createCategory, isBillingEnforcementError } from "../../lib/api";
import { queryKeys } from "../../lib/queryKeys";
import type { AuthenticatedWorkspace } from "../../lib/workspace";
import { categoryPalette } from "./CategoryManager";

interface NewCategoryInlineProps {
  workspace: AuthenticatedWorkspace;
  kind: TransactionKind;
  /** Rotates the palette so quick-added categories do not all share one color. */
  categoryCount: number;
  onCreated: (category: CategoryRecord) => void;
  onCancel: () => void;
}

/** Creates a category from inside the transaction form so the entry in progress survives.
 *  Rendered as fields, not a nested <form>, because it sits inside the transaction form. */
export function NewCategoryInline({
  workspace,
  kind,
  categoryCount,
  onCreated,
  onCancel,
}: NewCategoryInlineProps) {
  const queryClient = useQueryClient();
  const nameRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState("");
  const [iconEmoji, setIconEmoji] = useState("");
  const [error, setError] = useState<Error>();

  const createMutation = useMutation({
    mutationFn: (input: Parameters<typeof createCategory>[1]) => createCategory(workspace, input),
    onSuccess: (saved) => {
      queryClient.setQueriesData<CategoryRecord[]>(
        { queryKey: queryKeys.allCategories(workspace) },
        (current) =>
          current && !current.some((item) => item.id === saved.id) ? [...current, saved] : current,
      );
      void Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.allCategories(workspace) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.billing(workspace) }),
      ]);
      onCreated(saved);
    },
    onError: (mutationError) => {
      setError(
        mutationError instanceof Error
          ? mutationError
          : new Error("The category could not be saved."),
      );
    },
  });

  function create() {
    if (createMutation.isPending) return;
    setError(undefined);
    if (!name.trim()) {
      setError(new Error("Enter a category name."));
      nameRef.current?.focus();
      return;
    }
    const parsed = categoryInputSchema.safeParse({
      name,
      kind,
      color: categoryPalette[categoryCount % categoryPalette.length],
      iconEmoji: iconEmoji.trim() || null,
    });
    if (!parsed.success) {
      setError(new Error(parsed.error.issues[0]?.message ?? "Check the category details."));
      return;
    }
    createMutation.mutate(parsed.data);
  }

  // Enter would otherwise submit the surrounding transaction form.
  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== "Enter" || event.metaKey || event.ctrlKey) return;
    event.preventDefault();
    create();
  }

  return (
    <div className="new-category-inline" role="group" aria-label="New category">
      <div className="new-category-inline-fields">
        <label>
          <span>New category name</span>
          <input
            ref={nameRef}
            value={name}
            onChange={(event) => setName(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="e.g. Pet care"
            maxLength={80}
            disabled={createMutation.isPending}
            autoFocus
          />
        </label>
        <label className="new-category-inline-emoji">
          <span>
            Emoji <small>Optional</small>
          </span>
          <input
            value={iconEmoji}
            onChange={(event) => setIconEmoji(event.target.value)}
            onKeyDown={handleKeyDown}
            maxLength={32}
            disabled={createMutation.isPending}
          />
        </label>
      </div>
      <div className="new-category-inline-actions">
        <button
          className="button secondary"
          type="button"
          onClick={onCancel}
          disabled={createMutation.isPending}
        >
          Cancel
        </button>
        <button
          className="button primary"
          type="button"
          onClick={create}
          disabled={createMutation.isPending}
        >
          <Plus size={16} /> {createMutation.isPending ? "Adding…" : "Add category"}
        </button>
      </div>
      <UpgradePrompt error={error} />
      {error && !isBillingEnforcementError(error) && (
        <p className="form-error" role="alert">
          {error.message}
        </p>
      )}
    </div>
  );
}
