import type { AssistantMessage } from "@zoption/shared";
import { Bot, Sparkles, UserRound } from "lucide-react";
import { useEffect, useRef } from "react";

const QUICK_PROMPTS = [
  "How much did I spend this month?",
  "How are my budgets doing?",
  "What are my current account balances?",
  "Show my recent expenses.",
];

interface AssistantConversationProps {
  messages: AssistantMessage[];
  pendingMessage?: string;
  loading: boolean;
  onPrompt: (prompt: string) => void;
}

function messageTime(value: string): string {
  return new Intl.DateTimeFormat("en-PH", {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

export function AssistantConversation({
  messages,
  pendingMessage,
  loading,
  onPrompt,
}: AssistantConversationProps) {
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (typeof endRef.current?.scrollIntoView === "function") {
      endRef.current.scrollIntoView({ block: "end", behavior: "smooth" });
    }
  }, [messages, pendingMessage, loading]);

  if (messages.length === 0 && !pendingMessage) {
    return (
      <div className="assistant-empty">
        <span aria-hidden="true">
          <Sparkles size={25} />
        </span>
        <p className="eyebrow">Verified answers from your records</p>
        <h2>What would you like to understand?</h2>
        <p>Ask about balances, spending, income, budgets, categories, transactions, or trends.</p>
        <div className="assistant-quick-prompts">
          {QUICK_PROMPTS.map((prompt) => (
            <button type="button" key={prompt} onClick={() => onPrompt(prompt)}>
              {prompt}
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="assistant-messages" aria-live="polite">
      {messages.map((message) => (
        <article className={`assistant-message ${message.role}`} key={message.id}>
          <span className="assistant-message-avatar" aria-hidden="true">
            {message.role === "assistant" ? <Bot size={16} /> : <UserRound size={16} />}
          </span>
          <div>
            <div className="assistant-message-meta">
              <strong>{message.role === "assistant" ? "Zoption Assistant" : "You"}</strong>
              <time dateTime={message.createdAt}>{messageTime(message.createdAt)}</time>
            </div>
            <p>{message.content}</p>
            {message.status === "failed" && <small>Not sent. Try asking again.</small>}
          </div>
        </article>
      ))}
      {pendingMessage && (
        <article className="assistant-message user pending">
          <span className="assistant-message-avatar" aria-hidden="true">
            <UserRound size={16} />
          </span>
          <div>
            <div className="assistant-message-meta">
              <strong>You</strong>
              <span>Sending</span>
            </div>
            <p>{pendingMessage}</p>
          </div>
        </article>
      )}
      {loading && (
        <article className="assistant-message assistant checking" role="status">
          <span className="assistant-message-avatar" aria-hidden="true">
            <Bot size={16} />
          </span>
          <div>
            <div className="assistant-message-meta">
              <strong>Zoption Assistant</strong>
            </div>
            <p>
              <span className="assistant-thinking-dots" aria-hidden="true">
                <i />
                <i />
                <i />
              </span>{" "}
              Checking your records…
            </p>
          </div>
        </article>
      )}
      <div ref={endRef} />
    </div>
  );
}
