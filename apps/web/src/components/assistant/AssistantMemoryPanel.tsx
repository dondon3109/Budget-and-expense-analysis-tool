import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Brain, Check, Info, ShieldCheck, Sparkles, Trash2, X } from "lucide-react";
import { useRef, useState, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";

import { useRootLock } from "../../hooks/useRootLock";
import {
  clearAssistantMemory,
  getAssistantMemory,
  getAssistantMemoryPreferences,
  updateAssistantMemoryPreferences,
} from "../../lib/api";
import { queryKeys } from "../../lib/queryKeys";
import type { AuthenticatedWorkspace } from "../../lib/workspace";

interface AssistantMemoryPanelProps {
  workspace: AuthenticatedWorkspace;
  open: boolean;
  onClose: () => void;
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

  if (!open) return null;

  function handleKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key !== "Escape") return;
    event.preventDefault();
    onClose();
  }

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

  const clearMutation = useMutation({
    mutationFn: () => clearAssistantMemory(workspace),
    onSuccess: () => {
      queryClient.setQueryData(queryKeys.assistantMemory(workspace), []);
      setConfirmingClear(false);
      setError(undefined);
    },
    onError: (cause) =>
      setError(cause instanceof Error ? cause.message : "Memory could not be cleared."),
  });

  const currentStrategy = preferences.data?.debtStrategy ?? null;
  const facts = (memories.data ?? []).filter((memory) => memory.kind !== "summary");

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
              yourself. Data is private to this workspace, retained for up to 90 days, and never
              alters your transactions or accounts.
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
                Prioritizes debts with the highest interest rate first to minimize total interest paid.
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
                Prioritizes debts with the smallest balance first to build momentum through quick payoffs.
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
                return (
                  <li key={memory.id} className="fact-item-card">
                    <div className="fact-header">
                      <span className={`fact-source-tag ${isUserStated ? "user" : "learned"}`}>
                        {isUserStated ? "💬 You shared this" : "🧠 Learned from context"}
                      </span>
                      {dateLabel ? <span className="fact-date">{dateLabel}</span> : null}
                    </div>
                    <p className="fact-content">{memory.value}</p>
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
