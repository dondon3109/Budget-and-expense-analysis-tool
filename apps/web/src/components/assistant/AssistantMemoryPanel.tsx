import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ShieldCheck, Sparkles, Trash2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { useFocusTrap } from "../../hooks/useFocusTrap";
import { useRootLock } from "../../hooks/useRootLock";
import {
  clearAssistantMemory,
  deleteAssistantMemory,
  getAssistantMemory,
  getAssistantMemoryPreferences,
  updateAssistantMemory,
  updateAssistantMemoryPreferences,
} from "../../lib/api";
import { assistantPayoffPreferenceKeys, type AssistantMemoryPreferences } from "@zoption/shared";

import { queryKeys } from "../../lib/queryKeys";
import type { AuthenticatedWorkspace } from "../../lib/workspace";

interface AssistantMemoryPanelProps {
  workspace: AuthenticatedWorkspace;
  open: boolean;
  onClose: () => void;
}

const MEMORY_KEY_LABELS: Record<string, string> = {
  debt_strategy: "Debt payoff preference",
  emergency_fund_target: "Emergency fund target",
  savings_target: "Savings target",
  savings_rule: "Savings rule",
  monthly_budget_cap: "Monthly budget cap",
  budget_preference: "Budget preference",
  checking_buffer: "Checking buffer",
  payday_schedule: "Payday schedule",
  recurring_bill: "Recurring bill",
  spending_rule: "Spending rule",
  coaching_preference: "Coaching preference",
};

/** Stored keys are snake_case; users see a readable label instead. */
function memoryLabel(key: string): string {
  const known = MEMORY_KEY_LABELS[key];
  if (known) return known;
  const words = key.replace(/[_:]+/g, " ").trim();
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : key;
}

function formatMemoryDate(isoString?: string): string {
  if (!isoString) return "";
  try {
    const date = new Date(isoString);
    if (isNaN(date.getTime())) return "";
    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    }).format(date);
  } catch {
    return "";
  }
}

export function AssistantMemoryPanel({ workspace, open, onClose }: AssistantMemoryPanelProps) {
  const queryClient = useQueryClient();
  const dialogRef = useRef<HTMLElement>(null);
  const [confirmingClear, setConfirmingClear] = useState(false);
  const [error, setError] = useState<string>();

  const preferences = useQuery({
    queryKey: queryKeys.assistantMemoryPreferences(workspace),
    queryFn: () => getAssistantMemoryPreferences(workspace),
    enabled: open,
    staleTime: Infinity,
  });
  const memories = useQuery({
    queryKey: queryKeys.assistantMemory(workspace),
    queryFn: () => getAssistantMemory(workspace),
    enabled: open,
  });

  useRootLock(open);
  const handleKeyDown = useFocusTrap(dialogRef, { onEscape: onClose });

  const preferenceMutation = useMutation({
    mutationFn: (debtStrategy: "avalanche" | "snowball" | null) =>
      updateAssistantMemoryPreferences(workspace, { debtStrategy }),
    onSuccess: (data) => {
      queryClient.setQueryData(queryKeys.assistantMemoryPreferences(workspace), data);
      setError(undefined);
    },
    onError: (cause) =>
      setError(cause instanceof Error ? cause.message : "The preference could not be saved."),
  });

  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftValue, setDraftValue] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const factInputRef = useRef<HTMLInputElement>(null);
  const editTriggersRef = useRef(new Map<string, HTMLButtonElement>());
  const lastEditingIdRef = useRef<string | null>(null);

  // The editor replaces the row's Edit button, so focus follows it in and back out.
  // React drops a plain ref when that button unmounts to make room for the editor, so
  // the rebuilt buttons are tracked by memory id instead.
  useEffect(() => {
    if (editingId) {
      factInputRef.current?.focus();
      return;
    }
    const editedId = lastEditingIdRef.current;
    if (editedId) editTriggersRef.current.get(editedId)?.focus();
  }, [editingId]);

  const updateMutation = useMutation({
    mutationFn: ({ id, value }: { id: string; value: string }) =>
      updateAssistantMemory(workspace, id, value),
    onSuccess: (data) => {
      queryClient.setQueryData(
        queryKeys.assistantMemory(workspace),
        (previous: { id: string }[] | undefined) =>
          (previous ?? []).map((item) => (item.id === data.id ? data : item)),
      );
      setEditingId(null);
      setError(undefined);
    },
    onError: (cause) =>
      setError(cause instanceof Error ? cause.message : "Memory could not be updated."),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteAssistantMemory(workspace, id),
    onSuccess: (_data, id) => {
      queryClient.setQueryData(
        queryKeys.assistantMemory(workspace),
        (previous: { id: string }[] | undefined) =>
          (previous ?? []).filter((item) => item.id !== id),
      );
      setDeletingId(null);
      setError(undefined);
    },
    onError: (cause) =>
      setError(cause instanceof Error ? cause.message : "Memory could not be deleted."),
  });

  const clearMutation = useMutation({
    mutationFn: () => clearAssistantMemory(workspace),
    onSuccess: () => {
      queryClient.setQueryData(queryKeys.assistantMemory(workspace), []);
      // Clearing memory also clears the stored payoff preference, and this query
      // never goes stale on its own, so the control has to be reset here.
      queryClient.setQueryData(
        queryKeys.assistantMemoryPreferences(workspace),
        (previous: AssistantMemoryPreferences | undefined) =>
          previous ? { ...previous, debtStrategy: null } : previous,
      );
      setConfirmingClear(false);
      setError(undefined);
    },
    onError: (cause) =>
      setError(cause instanceof Error ? cause.message : "Memory could not be cleared."),
  });

  // The panel can be rendered closed, so this return has to sit below every hook in the
  // component: a conditional return above them changes the hook order when `open` flips.
  if (!open) return null;

  const currentStrategy = preferences.data?.debtStrategy ?? null;
  // Only facts are editable here; payoff preference rows belong to the control above.
  const facts = (memories.data ?? []).filter(
    (memory) => memory.kind === "fact" && !assistantPayoffPreferenceKeys.has(memory.key),
  );

  return createPortal(
    <div className="modal-backdrop" role="presentation">
      <section
        ref={dialogRef}
        className="form-modal assistant-memory-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="assistant-memory-title"
        onKeyDown={handleKeyDown}
      >
        <div className="modal-header">
          <div>
            <p className="eyebrow">Assistant context</p>
            <h2 id="assistant-memory-title">Memory & Preferences</h2>
          </div>
          <button
            type="button"
            className="icon-button compact"
            aria-label="Close assistant memory"
            onClick={onClose}
          >
            <X size={16} aria-hidden="true" />
          </button>
        </div>

        <div className="assistant-memory-trust-banner">
          <div className="trust-icon-wrap">
            <ShieldCheck size={18} aria-hidden="true" />
          </div>
          <div className="trust-text-wrap">
            <strong>Private & Read-Only</strong>
            <p>
              Your assistant remembers key facts across conversations so you don't have to repeat
              yourself. Data is private to this workspace, kept until you delete it, and never
              alters your transactions or accounts. You can edit or remove what it remembers below.
            </p>
          </div>
        </div>

        <section
          className="assistant-memory-section"
          aria-labelledby="assistant-memory-preferences-title"
        >
          <div className="section-title-row">
            <strong id="assistant-memory-preferences-title">Debt payoff preference</strong>
            <span className="section-help-text">Guides debt reduction recommendations</span>
          </div>

          <div
            className="assistant-memory-strategy-grid"
            role="radiogroup"
            aria-label="Debt payoff preference"
          >
            <button
              type="button"
              role="radio"
              aria-checked={currentStrategy === "avalanche"}
              className={`strategy-card ${currentStrategy === "avalanche" ? "current" : ""}`}
              disabled={preferenceMutation.isPending}
              onClick={() => preferenceMutation.mutate("avalanche")}
            >
              <div className="strategy-card-header">
                <span className="strategy-title">Avalanche</span>
                <span className="strategy-pill">Saves interest</span>
              </div>
              <p className="strategy-desc">
                Prioritizes debts with the highest interest rate first to minimize total interest
                paid.
              </p>
            </button>

            <button
              type="button"
              role="radio"
              aria-checked={currentStrategy === "snowball"}
              className={`strategy-card ${currentStrategy === "snowball" ? "current" : ""}`}
              disabled={preferenceMutation.isPending}
              onClick={() => preferenceMutation.mutate("snowball")}
            >
              <div className="strategy-card-header">
                <span className="strategy-title">Snowball</span>
                <span className="strategy-pill">Fastest wins</span>
              </div>
              <p className="strategy-desc">
                Prioritizes debts with the smallest balance first to build momentum through quick
                payoffs.
              </p>
            </button>

            <button
              type="button"
              role="radio"
              aria-checked={currentStrategy === null}
              className={`strategy-card ${currentStrategy === null ? "current" : ""}`}
              disabled={preferenceMutation.isPending}
              onClick={() => preferenceMutation.mutate(null)}
            >
              <div className="strategy-card-header">
                <span className="strategy-title">No preference</span>
                <span className="strategy-pill neutral">Automatic</span>
              </div>
              <p className="strategy-desc">
                Let the assistant evaluate context dynamically based on your question and cash flow.
              </p>
            </button>
          </div>

          {preferences.data && (
            <div className="assistant-memory-style-card">
              <div className="style-item">
                <span className="style-label">Detail level</span>
                <span className="style-value">
                  {preferences.data.responseDetail === "concise"
                    ? "⚡ Concise (direct & bulleted)"
                    : "📖 Standard (comprehensive)"}
                </span>
              </div>
              <div className="style-divider" />
              <div className="style-item">
                <span className="style-label">Coaching tone</span>
                <span className="style-value">
                  {preferences.data.coachingStyle === "gentle"
                    ? "🤝 Gentle (encouraging)"
                    : "🎯 Direct (straightforward)"}
                </span>
              </div>
            </div>
          )}
        </section>

        <section
          className="assistant-memory-section"
          aria-labelledby="assistant-memory-facts-title"
        >
          <div className="section-title-row">
            <strong id="assistant-memory-facts-title">Remembered facts</strong>
            <span className="facts-count-badge">{facts.length}</span>
          </div>

          {facts.length === 0 ? (
            <div className="assistant-memory-empty-card">
              <div className="empty-icon-wrap">
                <Sparkles size={20} aria-hidden="true" />
              </div>
              <h4>No remembered facts yet</h4>
              <p>
                When you share ongoing financial goals or preferences in chat, your assistant saves
                them here to personalize future answers.
              </p>
              <div className="empty-examples">
                <span className="examples-header">Examples you can share in chat:</span>
                <ul>
                  <li>“My emergency fund goal is ₱100,000”</li>
                  <li>“I prefer keeping 1 month of expenses in my checking account”</li>
                  <li>“Remind me about quarterly insurance dues”</li>
                </ul>
              </div>
            </div>
          ) : (
            <ul className="assistant-memory-facts-list">
              {facts.map((memory) => {
                const dateLabel = formatMemoryDate(memory.createdAt || memory.updatedAt);
                const isUserStated = memory.source === "user_stated";
                const isEditing = editingId === memory.id;
                return (
                  <li key={memory.id} className="fact-item-card">
                    <div className="fact-header">
                      <span className={`fact-source-tag ${isUserStated ? "user" : "learned"}`}>
                        {isUserStated ? "💬 You shared this" : "🧠 Learned from context"}
                      </span>
                      {dateLabel ? <span className="fact-date">{dateLabel}</span> : null}
                    </div>
                    {isEditing ? (
                      <div className="fact-edit-row">
                        <input
                          ref={factInputRef}
                          aria-label="Edit remembered fact"
                          value={draftValue}
                          maxLength={240}
                          onChange={(event) => setDraftValue(event.target.value)}
                        />
                        <button
                          type="button"
                          className="button secondary compact"
                          disabled={updateMutation.isPending || draftValue.trim().length === 0}
                          onClick={() =>
                            updateMutation.mutate({ id: memory.id, value: draftValue.trim() })
                          }
                        >
                          Save
                        </button>
                        <button
                          type="button"
                          className="button secondary compact"
                          onClick={() => setEditingId(null)}
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <p className="fact-content">{memory.value}</p>
                    )}
                    <p className="fact-meta">
                      {memoryLabel(memory.key)}
                      {memory.threadTitle ? ` · from “${memory.threadTitle}”` : null}
                    </p>
                    {!isEditing && (
                      <div className="fact-actions">
                        <button
                          type="button"
                          ref={(node) => {
                            if (node) editTriggersRef.current.set(memory.id, node);
                            else editTriggersRef.current.delete(memory.id);
                          }}
                          className="button secondary compact"
                          onClick={() => {
                            lastEditingIdRef.current = memory.id;
                            setEditingId(memory.id);
                            setDraftValue(memory.value);
                          }}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          className="button secondary compact"
                          onClick={() => setDeletingId(memory.id)}
                        >
                          Delete
                        </button>
                      </div>
                    )}
                    {deletingId === memory.id && (
                      <div className="assistant-memory-clear-confirm" role="alert">
                        <div className="confirm-text">
                          <strong>Delete this memory?</strong>
                          <p>“{memory.value}” is removed from what the assistant remembers.</p>
                        </div>
                        <div className="confirm-buttons">
                          <button
                            type="button"
                            className="button secondary compact"
                            disabled={deleteMutation.isPending}
                            onClick={() => setDeletingId(null)}
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            className="button danger compact"
                            disabled={deleteMutation.isPending}
                            onClick={() => deleteMutation.mutate(memory.id)}
                          >
                            {deleteMutation.isPending ? "Deleting…" : "Yes, delete"}
                          </button>
                        </div>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}

        {confirmingClear ? (
          <div className="assistant-memory-clear-confirm">
            <div className="confirm-text">
              <strong>Clear all assistant memory?</strong>
              <p>
                This removes all remembered facts and resets debt payoff preferences. Your recorded
                transactions, accounts, and budgets are never affected.
              </p>
            </div>
            <div className="confirm-buttons">
              <button
                type="button"
                className="button secondary compact"
                disabled={clearMutation.isPending}
                onClick={() => setConfirmingClear(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="button danger compact"
                disabled={clearMutation.isPending}
                onClick={() => clearMutation.mutate()}
              >
                {clearMutation.isPending ? "Clearing…" : "Yes, clear memory"}
              </button>
            </div>
          </div>
        ) : (
          <div className="assistant-memory-actions">
            <button
              type="button"
              className="assistant-memory-clear-btn"
              disabled={facts.length === 0}
              onClick={() => setConfirmingClear(true)}
            >
              <Trash2 size={13} aria-hidden="true" /> Clear memory
            </button>
            <button type="button" className="button secondary compact" onClick={onClose}>
              Close
            </button>
          </div>
        )}
      </section>
    </div>,
    document.body,
  );
}
