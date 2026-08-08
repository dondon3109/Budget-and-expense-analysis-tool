import { Bot, Send, ShieldCheck } from "lucide-react";
import type { FormEvent, KeyboardEvent } from "react";

interface AssistantComposerProps {
  value: string;
  busy: boolean;
  error?: string;
  onChange: (value: string) => void;
  onSend: () => void;
}

export function AssistantComposer({
  value,
  busy,
  error,
  onChange,
  onSend,
}: AssistantComposerProps) {
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (value.trim() && !busy) onSend();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      if (value.trim() && !busy) onSend();
    }
  }

  return (
    <form className="assistant-composer" onSubmit={submit}>
      <span className="assistant-composer-ai" aria-hidden="true">
        <Bot size={18} />
      </span>
      <label className="sr-only" htmlFor="assistant-message">
        Ask about your finances
      </label>
      <textarea
        id="assistant-message"
        value={value}
        maxLength={2_000}
        rows={2}
        placeholder="Ask about spending, budgets, recurring charges, goals, or debt…"
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={handleKeyDown}
        disabled={busy}
      />
      <button
        className="assistant-send"
        type="submit"
        disabled={busy || !value.trim()}
        aria-label="Send message"
      >
        <Send size={18} />
      </button>
      <div className="assistant-composer-note">
        <span>
          <ShieldCheck size={13} aria-hidden="true" /> Read-only · Server-verified calculations
        </span>
        <small>{value.length}/2,000</small>
      </div>
      {error && (
        <p className="assistant-composer-error" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}
