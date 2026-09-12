import type { AssistantThread } from "@zoption/shared";
import { Check, MessageSquareText, Mic, Pencil, Plus, Trash2, X } from "lucide-react";
import { useEffect, useState, type Ref } from "react";

interface AssistantThreadListProps {
  assistantName: string;
  threads: AssistantThread[];
  activeThreadId: string | null;
  busy: boolean;
  closeButtonRef: Ref<HTMLButtonElement>;
  onClose: () => void;
  onSelect: (threadId: string) => void;
  onNew: () => void;
  onVoice: () => void;
  onEditIdentity: () => void;
  onDelete: (threadIds: string[]) => Promise<void>;
  onDeleteAll: () => Promise<void>;
}

function relativeDate(value: string): string {
  const date = new Date(value);
  const today = new Date();
  if (date.toDateString() === today.toDateString()) return "Today";
  return new Intl.DateTimeFormat("en-PH", { month: "short", day: "numeric" }).format(date);
}

function threadGroup(value: string): string {
  const date = new Date(value);
  const now = new Date();
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diffDays = Math.round((startOfDay(now) - startOfDay(date)) / 86_400_000);
  if (diffDays <= 0) return "Today";
  if (diffDays <= 7) return "Previous 7 days";
  return "Older";
}

export function AssistantThreadList({
  assistantName,
  threads,
  activeThreadId,
  busy,
  closeButtonRef,
  onClose,
  onSelect,
  onNew,
  onVoice,
  onEditIdentity,
  onDelete,
  onDeleteAll,
}: AssistantThreadListProps) {
  const [confirmThread, setConfirmThread] = useState<string>();
  const [confirmAll, setConfirmAll] = useState(false);
  const [confirmSelection, setConfirmSelection] = useState(false);
  const [managing, setManaging] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const selected = new Set(selectedIds);
  // Derived from the live list so a thread that disappears never inflates the count.
  const selectedThreadIds = threads.filter((thread) => selected.has(thread.id)).map((t) => t.id);

  function endSelecting() {
    setManaging(false);
    setSelectedIds([]);
    setConfirmSelection(false);
  }

  function toggleSelection(threadId: string) {
    setSelectedIds((current) =>
      current.includes(threadId) ? current.filter((id) => id !== threadId) : [...current, threadId],
    );
  }

  // Deleting the last chat hides the Select toggle, so leave select mode with it.
  useEffect(() => {
    if (!managing || threads.length > 0) return;
    endSelecting();
  }, [managing, threads.length]);

  function deleteSelected() {
    if (selectedThreadIds.length === 0) return;
    void onDelete(selectedThreadIds).then(() => {
      setConfirmSelection(false);
      setSelectedIds([]);
    });
  }

  const groups = new Map<string, AssistantThread[]>();
  for (const thread of threads) {
    const group = threadGroup(thread.lastMessageAt);
    groups.set(group, [...(groups.get(group) ?? []), thread]);
  }

  return (
    <aside
      id="assistant-chat-history"
      className="assistant-history"
      aria-label="Assistant chat history"
    >
      <div className="assistant-history-heading">
        <div className="assistant-history-title-row">
          <div>
            <p className="eyebrow">History</p>
            <h2 title={`Chats with ${assistantName}`}>Chats with {assistantName}</h2>
          </div>
          <div className="assistant-history-actions">
            {threads.length > 0 ? (
              <button
                className="assistant-history-edit"
                type="button"
                onClick={() => {
                  if (managing) {
                    endSelecting();
                    return;
                  }
                  setConfirmThread(undefined);
                  setManaging(true);
                }}
                aria-pressed={managing}
                aria-label={managing ? "Done selecting chats" : "Select chats"}
              >
                {managing ? "Done" : "Select"}
              </button>
            ) : null}
            <button
              className="assistant-history-edit"
              type="button"
              onClick={onEditIdentity}
              aria-label="Edit assistant names"
            >
              <Pencil size={13} aria-hidden="true" /> Edit
            </button>
            <button
              ref={closeButtonRef}
              className="assistant-history-close"
              type="button"
              onClick={onClose}
              aria-label="Close chat history"
            >
              <X size={18} aria-hidden="true" />
            </button>
          </div>
        </div>
        <div className="assistant-history-cta-row">
          <button
            className="assistant-new-chat"
            type="button"
            onClick={onNew}
            aria-label="Start a new chat"
          >
            <Plus size={15} aria-hidden="true" />
            <span>New chat</span>
          </button>
          <button
            className="assistant-new-chat assistant-new-voice-chat"
            type="button"
            onClick={onVoice}
            aria-label="Start a voice chat"
            title="Start a voice chat"
          >
            <Mic size={14} aria-hidden="true" />
            <span>Voice</span>
          </button>
        </div>
      </div>

      <div className="assistant-thread-list">
        {threads.length === 0 && (
          <p className="assistant-history-empty">Your recent questions will appear here.</p>
        )}
        {Array.from(groups.entries()).map(([group, groupThreads]) => (
          <section className="assistant-thread-group" key={group} aria-label={group}>
            <h3 className="assistant-thread-group-label">{group}</h3>
            {groupThreads.map((thread) => {
              const isSelected = selected.has(thread.id);
              return (
                <div
                  className={`assistant-thread-row ${thread.id === activeThreadId ? "current" : ""}${
                    isSelected ? " is-selected" : ""
                  }${confirmThread === thread.id ? " is-confirming" : ""}`}
                  key={thread.id}
                >
                  <button
                    type="button"
                    onClick={() => (managing ? toggleSelection(thread.id) : onSelect(thread.id))}
                    aria-pressed={managing ? isSelected : undefined}
                    aria-label={
                      managing ? `${isSelected ? "Deselect" : "Select"} ${thread.title}` : undefined
                    }
                  >
                    <span
                      className={`assistant-thread-icon ${thread.kind === "voice" ? "voice" : ""}${
                        managing && isSelected ? " checked" : ""
                      }`}
                      aria-hidden="true"
                    >
                      {managing ? (
                        isSelected ? (
                          <Check size={14} />
                        ) : null
                      ) : thread.kind === "voice" ? (
                        <Mic size={14} />
                      ) : (
                        <MessageSquareText size={14} />
                      )}
                    </span>
                    <span className="assistant-thread-details">
                      <span className="assistant-thread-title-line">
                        <strong>{thread.title}</strong>
                        {thread.kind === "voice" && (
                          <span className="assistant-thread-kind-badge" aria-hidden="true">
                            Voice
                          </span>
                        )}
                      </span>
                      <small>{relativeDate(thread.lastMessageAt)}</small>
                    </span>
                  </button>
                  {/* Select mode owns deletion, so per-chat trash and its confirm step aside. */}
                  {!managing && (
                    <>
                      <button
                        className="assistant-thread-delete"
                        type="button"
                        aria-label={`Delete ${thread.title}`}
                        onClick={() => setConfirmThread(thread.id)}
                        disabled={busy}
                      >
                        <Trash2 size={14} />
                      </button>
                      {confirmThread === thread.id && (
                        <div
                          className="assistant-delete-confirm"
                          role="alertdialog"
                          aria-label="Delete chat"
                        >
                          <span>Delete this chat?</span>
                          <button
                            type="button"
                            onClick={() =>
                              void onDelete([thread.id]).then(() => setConfirmThread(undefined))
                            }
                          >
                            Delete
                          </button>
                          <button type="button" onClick={() => setConfirmThread(undefined)}>
                            Keep
                          </button>
                        </div>
                      )}
                    </>
                  )}
                </div>
              );
            })}
          </section>
        ))}
      </div>

      {threads.length > 0 && (
        <div className="assistant-history-footer">
          {managing ? (
            confirmSelection ? (
              <div
                className="assistant-delete-all-confirm"
                role="alertdialog"
                aria-label="Delete selected chats"
              >
                <strong>Delete {selectedThreadIds.length} selected?</strong>
                <p>This permanently removes them from your assistant history.</p>
                <div>
                  <button className="button danger compact" type="button" onClick={deleteSelected}>
                    Delete selected
                  </button>
                  <button
                    className="button secondary compact"
                    type="button"
                    onClick={() => setConfirmSelection(false)}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmSelection(true)}
                disabled={busy || selectedThreadIds.length === 0}
              >
                <Trash2 size={13} aria-hidden="true" /> Delete selected ({selectedThreadIds.length})
              </button>
            )
          ) : confirmAll ? (
            <div
              className="assistant-delete-all-confirm"
              role="alertdialog"
              aria-label="Delete all chats"
            >
              <strong>Delete every chat?</strong>
              <p>This permanently removes your active Zoption assistant history.</p>
              <div>
                <button
                  className="button danger compact"
                  type="button"
                  onClick={() => void onDeleteAll().then(() => setConfirmAll(false))}
                >
                  Delete all
                </button>
                <button
                  className="button secondary compact"
                  type="button"
                  onClick={() => setConfirmAll(false)}
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button type="button" onClick={() => setConfirmAll(true)} disabled={busy}>
              <Trash2 size={13} aria-hidden="true" /> Delete all chats
            </button>
          )}
          <small>History expires after 90 days.</small>
        </div>
      )}
    </aside>
  );
}
