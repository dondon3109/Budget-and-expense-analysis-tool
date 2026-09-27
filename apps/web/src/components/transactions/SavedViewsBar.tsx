import { Trash2 } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";

import { sameFilters } from "../../hooks/useTransactionFilters";
import {
  persistSavedViews,
  readSavedViews,
  savedViewId,
  SAVED_VIEW_NAME_MAX,
  type SavedTransactionFilters,
  type SavedTransactionView,
} from "../../transactions/savedViews";

interface SavedViewsBarProps {
  filters: SavedTransactionFilters;
  onApply: (filters: SavedTransactionFilters) => void;
}

/**
 * Picks, saves, and deletes named filter sets for the ledger. Styles live in SavedViewsBar.css,
 * which TransactionsPage imports right after its own stylesheet to keep the cascade order.
 */
export function SavedViewsBar({ filters, onApply }: SavedViewsBarProps) {
  const [views, setViews] = useState<SavedTransactionView[]>(() => readSavedViews());
  const [viewName, setViewName] = useState("");
  const [saveViewOpen, setSaveViewOpen] = useState(false);
  const [activeViewId, setActiveViewId] = useState("");
  const activeView = views.find((view) => view.id === activeViewId);

  // The Views select only reflects reality: a manual filter change drops the applied view.
  useEffect(() => {
    if (!activeViewId) return;
    const applied = views.find((candidate) => candidate.id === activeViewId);
    if (!applied || !sameFilters(filters, applied.filters)) setActiveViewId("");
  }, [activeViewId, filters, views]);

  function applySavedView(id: string) {
    const view = views.find((candidate) => candidate.id === id);
    if (!view) {
      setActiveViewId("");
      return;
    }
    onApply(view.filters);
    setActiveViewId(view.id);
  }

  function saveCurrentView(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = viewName.trim().slice(0, SAVED_VIEW_NAME_MAX);
    if (!name) return;
    const view: SavedTransactionView = { id: savedViewId(), name, filters };
    // Saving under an existing name replaces that view instead of stacking duplicates.
    const next = [...views.filter((candidate) => candidate.name !== name), view];
    setViews(next);
    persistSavedViews(next);
    setActiveViewId(view.id);
    setViewName("");
    setSaveViewOpen(false);
  }

  function deleteSavedView(view: SavedTransactionView) {
    const next = views.filter((candidate) => candidate.id !== view.id);
    setViews(next);
    persistSavedViews(next);
    if (activeViewId === view.id) setActiveViewId("");
  }

  return (
    <div className="transaction-views">
      <label className="transaction-sort-control">
        <span>Views</span>
        <select
          value={activeViewId}
          onChange={(event) => applySavedView(event.target.value)}
          disabled={views.length === 0}
        >
          <option value="">{views.length === 0 ? "No saved views" : "Select a view"}</option>
          {views.map((view) => (
            <option key={view.id} value={view.id}>
              {view.name}
            </option>
          ))}
        </select>
      </label>
      {saveViewOpen ? (
        <form className="transaction-view-save" onSubmit={saveCurrentView}>
          <label className="transaction-view-name">
            <span className="sr-only">View name</span>
            <input
              value={viewName}
              maxLength={SAVED_VIEW_NAME_MAX}
              placeholder="Name this view"
              onChange={(event) => setViewName(event.target.value)}
            />
          </label>
          <button className="button secondary" type="submit" disabled={!viewName.trim()}>
            Save
          </button>
          <button
            className="button secondary"
            type="button"
            onClick={() => {
              setSaveViewOpen(false);
              setViewName("");
            }}
          >
            Cancel
          </button>
        </form>
      ) : (
        <button className="button secondary" type="button" onClick={() => setSaveViewOpen(true)}>
          Save view
        </button>
      )}
      {activeView && (
        <button
          className="icon-button"
          type="button"
          aria-label={`Delete view ${activeView.name}`}
          onClick={() => deleteSavedView(activeView)}
        >
          <Trash2 size={15} aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
