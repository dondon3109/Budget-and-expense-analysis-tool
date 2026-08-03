import type { AssistantThread } from "@zoption/shared";
import { MessageSquareText, Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";

interface AssistantThreadListProps {
  assistantName: string;
  threads: AssistantThread[];
  activeThreadId: string | null;
  busy: boolean;
  onSelect: (threadId: string) => void;
  onNew: () => void;
  onEditIdentity: () => void;
  onDelete: (threadId: string) => Promise<void>;
  onDeleteAll: () => Promise<void>;
}

function relativeDate(value: string): string {
  const date = new Date(value);
  const today = new Date();
  if (date.toDateString() === today.toDateString()) return "Today";
  return new Intl.DateTimeFormat("en-PH", { month: "short", day: "numeric" }).format(date);
}

export function AssistantThreadList({
  assistantName,
  threads,
  activeThreadId,
  busy,
  onSelect,
  onNew,
  onEditIdentity,
  onDelete,
  onDeleteAll,
}: AssistantThreadListProps) {
  const [confirmThread, setConfirmThread] = useState<string>();
  const [confirmAll, setConfirmAll] = useState(false);

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
            <button
              className="assistant-history-edit"
              type="button"
              onClick={onEditIdentity}
              aria-label="Edit assistant names"
            >
              <Pencil size={13} aria-hidden="true" /> Edit
            </button>
          </div>
        </div>
        <button className="assistant-new-chat" type="button" onClick={onNew} aria-label="Start a new chat">
          <Plus size={16} aria-hidden="true" /> New chat
        </button>
      </div>

      <div className="assistant-thread-list">
        {threads.length === 0 && (
          <p className="assistant-history-empty">Your recent questions will appear here.</p>
        )}
        {threads.map((thread) => (
          <div
            className={`assistant-thread-row ${thread.id === activeThreadId ? "current" : ""}`}
            key={thread.id}
          >
            <button type="button" onClick={() => onSelect(thread.id)}>
              <MessageSquareText size={15} aria-hidden="true" />
              <span>
                <strong>{thread.title}</strong>
                <small>{relativeDate(thread.lastMessageAt)}</small>
              </span>
            </button>
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
              <div className="assistant-delete-confirm" role="alertdialog" aria-label="Delete chat">
                <span>Delete this chat?</span>
                <button
                  type="button"
                  onClick={() => void onDelete(thread.id).then(() => setConfirmThread(undefined))}
                >
                  Delete
                </button>
                <button type="button" onClick={() => setConfirmThread(undefined)}>
                  Keep
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      {threads.length > 0 && (
        <div className="assistant-history-footer">
          {confirmAll ? (
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
