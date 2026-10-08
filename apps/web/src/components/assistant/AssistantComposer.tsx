import { Bot, Send } from "lucide-react";
import { useLayoutEffect, useRef } from "react";
import type { FormEvent, KeyboardEvent, ReactNode } from "react";

import { captureFunnelEvent } from "../../analytics/funnel";
import "./AssistantComposer.css";

interface AssistantComposerProps {
  value: string;
  busy: boolean;
  error?: string;
  /** Live speech shown as ghost text after the draft until the final transcript lands. */
  liveText?: string;
  onChange: (value: string) => void;
  onSend: () => void;
  voiceControl?: ReactNode;
}

export function AssistantComposer({
  value,
  busy,
  error,
  liveText,
  onChange,
  onSend,
  voiceControl,
}: AssistantComposerProps) {
  // This composer is the chat surface, so a send here is always the chat question.
  function send() {
    captureFunnelEvent("assistant_first_question", { surface: "chat" });
    onSend();
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (value.trim() && !busy) send();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      if (value.trim() && !busy) send();
    }
  }

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const shown = liveText ? [value, liveText].filter(Boolean).join(" ") : value;

  // Size the box to its content; field-sizing is not available in Firefox yet.
  useLayoutEffect(() => {
    const box = textareaRef.current;
    if (!box) return;
    box.style.height = "auto";
    box.style.height = `${box.scrollHeight}px`;
    // Past the CSS max-height the box scrolls; below it a stray scrollbar is just rounding noise.
    box.style.overflowY = box.scrollHeight > box.clientHeight + 1 ? "auto" : "hidden";
  }, [shown]);

  return (
    <form className="assistant-composer" onSubmit={submit}>
      <span className="assistant-composer-ai" aria-hidden="true">
        <Bot size={18} />
      </span>
      <label className="sr-only" htmlFor="assistant-message">
        Ask about your finances
      </label>
      <textarea
        ref={textareaRef}
        id="assistant-message"
        value={shown}
        readOnly={Boolean(liveText)}
        data-live={liveText ? "true" : undefined}
        maxLength={2_000}
        rows={1}
        placeholder="Ask about spending, budgets, recurring charges, goals, or debt…"
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={handleKeyDown}
        disabled={busy}
      />
      {voiceControl}
      <button
        className="assistant-send"
        type="submit"
        disabled={busy || !value.trim()}
        aria-label="Send message"
      >
        <Send size={18} />
      </button>
      <div className="assistant-composer-note">
        <div className="assistant-composer-meta">
          <span className="assistant-composer-shortcut" aria-hidden="true">
            <kbd>↵</kbd> send <kbd>⇧↵</kbd> line
          </span>
          <small>{shown.length}/2,000</small>
        </div>
      </div>
      {error && (
        <p className="assistant-composer-error" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}
