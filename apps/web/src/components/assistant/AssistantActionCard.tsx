import { assistantActionSchema } from "@zoption/shared";
import type { AssistantMessage } from "@zoption/shared";
import { Check } from "lucide-react";

import type { AssistantDraftSave } from "./AssistantConversation";
import "./AssistantTransactionDraft.css";

const DONE_LABEL: Record<string, string> = {
  create: "Added",
  update: "Changed",
  set: "Changed",
  delete: "Deleted",
  archive: "Archived",
  adjust: "Balance updated",
};

/**
 * The review card for a subscription, goal, or debt change the assistant proposed. The summary
 * is written by the server from the stored proposal; Confirm applies that proposal and nothing
 * the browser sends.
 */
export function AssistantActionCard({
  message,
  save,
  superseded,
}: {
  message: AssistantMessage;
  save?: AssistantDraftSave;
  /** A later proposal in this chat replaced this one, so confirming it could apply both. */
  superseded: boolean;
}) {
  const parsed = assistantActionSchema.safeParse(message.metadata?.assistantAction);
  if (!parsed.success) return null;
  const action = parsed.data;
  const destructive = action.kind.startsWith("delete_");
  const done = action.status === "done";
  // A stored "saving" state is not trusted: the server refuses a live claim, so a tap is safe.
  const working = save?.savingMessageId === message.id;
  const error = save?.failedMessageId === message.id ? save.error : undefined;

  return (
    <section
      className={`assistant-draft action${destructive ? " destructive" : ""}`}
      aria-label="Proposed change"
    >
      <p className="assistant-draft-summary">{action.summary}</p>
      {done ? (
        <p className="assistant-draft-saved" role="status">
          <Check size={14} aria-hidden="true" /> {DONE_LABEL[action.kind.split("_")[0]!]}
        </p>
      ) : superseded ? (
        <small>Replaced by a newer proposal below.</small>
      ) : (
        <button
          type="button"
          className={`assistant-draft-save${destructive ? " destructive" : ""}`}
          disabled={working || !save}
          onClick={() => save?.onSave(message.id)}
        >
          {working ? "Working…" : destructive ? "Delete" : "Confirm"}
        </button>
      )}
      {!done && !superseded && !error && (
        <small>Nothing changes until you confirm. Ask me to adjust anything first.</small>
      )}
      {error && (
        <small className="assistant-draft-error" role="alert">
          {error}
        </small>
      )}
    </section>
  );
}
