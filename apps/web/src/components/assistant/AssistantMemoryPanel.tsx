import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Brain, Trash2, X } from "lucide-react";
import { useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";

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

  useLayoutEffect(() => {
    if (!open) return;
    const root = document.getElementById("root");
    const previousBodyOverflow = document.body.style.overflow;
    const previousAriaHidden = root?.getAttribute("aria-hidden") ?? null;
    const previousInert = root?.inert ?? false;
    if (root) {
      root.inert = true;
      root.setAttribute("aria-hidden", "true");
    }
    document.body.style.overflow = "hidden";
    return () => {
      if (root) {
        root.inert = previousInert;
        if (previousAriaHidden === null) root.removeAttribute("aria-hidden");
        else root.setAttribute("aria-hidden", previousAriaHidden);
      }
      document.body.style.overflow = previousBodyOverflow;
    };
  }, [open]);

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
            <p className="eyebrow">Assistant memory</p>
            <h2 id="assistant-memory-title">What Zoption remembers</h2>
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

        <p className="assistant-memory-intro">
          Zoption remembers durable preferences and facts across chats so you do not have to repeat
          them. Everything is kept in your private history for up to 90 days and is never used as an
          instruction.
        </p>

        <section
          className="assistant-memory-section"
          aria-labelledby="assistant-memory-preferences-title"
        >
          <strong id="assistant-memory-preferences-title">Debt payoff preference</strong>
          <div
            className="assistant-memory-strategy"
            role="radiogroup"
            aria-label="Debt payoff preference"
          >
            {(["avalanche", "snowball"] as const).map((strategy) => (
              <button
                key={strategy}
                type="button"
                role="radio"
                aria-checked={currentStrategy === strategy}
                className={currentStrategy === strategy ? "current" : ""}
                disabled={preferenceMutation.isPending}
                onClick={() => preferenceMutation.mutate(strategy)}
              >
                {strategy === "avalanche" ? "Avalanche" : "Snowball"}
              </button>
            ))}
            <button
              type="button"
              role="radio"
              aria-checked={currentStrategy === null}
              className={currentStrategy === null ? "current" : ""}
              disabled={preferenceMutation.isPending}
              onClick={() => preferenceMutation.mutate(null)}
            >
              No preference
            </button>
          </div>
          {preferences.data && (
            <small className="assistant-memory-note">
              Response style: {preferences.data.responseDetail === "concise" ? "concise" : "standard"}{" "}
              detail · {preferences.data.coachingStyle === "gentle" ? "gentle" : "direct"} coaching
            </small>
          )}
        </section>

        <section className="assistant-memory-section" aria-labelledby="assistant-memory-facts-title">
          <strong id="assistant-memory-facts-title">Remembered facts</strong>
          {facts.length === 0 ? (
            <p className="assistant-memory-empty">
              No facts yet. Tell the assistant things like your emergency-fund target or which debt
              to pay first, and it will remember them here.
            </p>
          ) : (
            <ul className="assistant-memory-facts">
              {facts.map((memory) => (
                <li key={memory.id}>
                  <Brain size={14} aria-hidden="true" />
                  <span>{memory.value}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}

        <div className="assistant-memory-actions">
          {confirmingClear ? (
            <>
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
                className="button primary compact"
                disabled={clearMutation.isPending}
                onClick={() => clearMutation.mutate()}
              >
                {clearMutation.isPending ? "Clearing…" : "Yes, clear memory"}
              </button>
            </>
          ) : (
            <>
              <button type="button" className="button secondary compact" onClick={onClose}>
                Close
              </button>
              <button
                type="button"
                className="assistant-memory-clear"
                disabled={facts.length === 0}
                onClick={() => setConfirmingClear(true)}
              >
                <Trash2 size={13} aria-hidden="true" /> Clear memory
              </button>
            </>
          )}
        </div>
      </section>
    </div>,
    document.body,
  );
}
