import type { CategoryInput, CategoryRecord, TransactionKind } from "@zoption/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Archive, Check, Pencil, Plus, RotateCcw, X } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";

import { createCategory, updateCategory } from "../../lib/api";
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
  const [name, setName] = useState("");
  const [kind, setKind] = useState<TransactionKind>("expense");
  const [color, setColor] = useState(palette[0]!);
  const [editingId, setEditingId] = useState<string>();
  const [editingName, setEditingName] = useState("");
  const [error, setError] = useState<string>();

  useEffect(() => {
    function handleKeydown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKeydown);
    return () => window.removeEventListener("keydown", handleKeydown);
  }, [onClose]);

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: queryKeys.allCategories(workspace) });
  };
  const createMutation = useMutation({
    mutationFn: (input: CategoryInput) => createCategory(workspace, input),
    onSuccess: async () => {
      setName("");
      setError(undefined);
      await refresh();
    },
    onError: (mutationError) => setError(mutationError.message),
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
    onError: (mutationError) => setError(mutationError.message),
  });

  function handleCreate(event: FormEvent) {
    event.preventDefault();
    const input: CategoryInput = { name, kind, color };
    createMutation.mutate(input);
  }

  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        className="form-modal category-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="category-manager-title"
      >
        <header className="modal-header">
          <div>
            <p className="eyebrow">Organize spending</p>
            <h2 id="category-manager-title">Manage categories</h2>
          </div>
          <button className="icon-button" type="button" onClick={onClose} aria-label="Close">
            <X size={19} />
          </button>
        </header>
        <form className="new-category-form" onSubmit={handleCreate}>
          <label>
            <span>New category</span>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="e.g. Health"
              maxLength={80}
              required
            />
          </label>
          <label>
            <span>Type</span>
            <select
              value={kind}
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
                  onClick={() => setColor(option)}
                  aria-label={`Use color ${option}`}
                  aria-pressed={color === option}
                >
                  {color === option && <Check size={13} />}
                </button>
              ))}
            </div>
          </fieldset>
          <button className="button primary" type="submit" disabled={createMutation.isPending}>
            <Plus size={16} /> Add
          </button>
        </form>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <div className="category-manager-list">
          {categories.map((category) => (
            <div
              className={category.archived ? "manager-category archived" : "manager-category"}
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
                        onClick={() =>
                          updateMutation.mutate({
                            id: category.id,
                            input: { archived: !category.archived },
                          })
                        }
                        aria-label={`${category.archived ? "Restore" : "Archive"} ${category.name}`}
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
    </div>
  );
}
