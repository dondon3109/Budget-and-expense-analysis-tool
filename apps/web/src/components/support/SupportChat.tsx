import { ArrowUp, MessageCircleQuestion, RefreshCcw, ShieldCheck, Sparkles, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { useLocation } from "react-router-dom";

import {
  isApiRequestError,
  sendSupportChat,
  type SupportChatMessageInput,
  type SupportPageContext,
} from "../../lib/api";
import { renderInlineEmphasis } from "../chat/renderInlineEmphasis";
import "./SupportChat.css";

type SupportSurface = "landing" | "app";

interface SupportChatProps {
  surface: SupportSurface;
}

interface SupportMessage extends SupportChatMessageInput {
  id: string;
}

const STORAGE_KEY = "zoption:support-chat:v1";
const MAX_STORED_MESSAGES = 12;
const SUGGESTIONS = [
  "How do imports work?",
  "Where do I set a budget?",
  "What can the AI Assistant access?",
];

function welcomeMessage(surface: SupportSurface): SupportMessage {
  return {
    id: "support-welcome",
    role: "assistant",
    content:
      surface === "landing"
        ? "Hi — I’m Zoption Support. Ask me how the tracker, imports, plans, privacy, or Android app works."
        : "Hi — I’m Zoption Support. Ask me where to find something or how a Zoption workflow works. I can guide you, but I can’t see your account data.",
  };
}

function isUnknownArray(value: unknown): value is unknown[] {
  return Array.isArray(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readStoredMessages(surface: SupportSurface): SupportMessage[] {
  if (typeof window === "undefined") return [welcomeMessage(surface)];
  try {
    const parsed = JSON.parse(window.sessionStorage.getItem(STORAGE_KEY) ?? "null") as unknown;
    if (!isUnknownArray(parsed)) return [welcomeMessage(surface)];
    const messages = parsed.flatMap((value, index): SupportMessage[] => {
      if (!isRecord(value)) return [];
      const role = value.role;
      const content = value.content;
      if ((role !== "user" && role !== "assistant") || typeof content !== "string") return [];
      const trimmed = content.trim();
      if (!trimmed || trimmed.length > 1_200) return [];
      return [{ id: `support-restored-${index}`, role, content: trimmed }];
    });
    return messages.length > 0 ? messages.slice(-MAX_STORED_MESSAGES) : [welcomeMessage(surface)];
  } catch {
    return [welcomeMessage(surface)];
  }
}

function pageContext(pathname: string, surface: SupportSurface): SupportPageContext {
  if (surface === "landing") return "landing";
  if (pathname === "/app" || pathname === "/app/") return "dashboard";
  const segment = pathname.split("/")[2];
  if (
    segment === "assistant" ||
    segment === "calendar" ||
    segment === "transactions" ||
    segment === "import" ||
    segment === "budgets" ||
    segment === "subscriptions" ||
    segment === "plan" ||
    segment === "settings"
  ) {
    return segment;
  }
  return "app";
}

export function SupportChat({ surface }: SupportChatProps) {
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<SupportMessage[]>(() => readStoredMessages(surface));
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string>();
  const [canRetry, setCanRetry] = useState(false);
  const nextMessageId = useRef(0);
  const launcherRef = useRef<HTMLButtonElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const conversationEndRef = useRef<HTMLDivElement>(null);
  const requestRef = useRef<AbortController | undefined>(undefined);
  const context = useMemo(
    () => pageContext(location.pathname, surface),
    [location.pathname, surface],
  );

  const hasUserMessage = messages.some((message) => message.role === "user");

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(
        messages.slice(-MAX_STORED_MESSAGES).map(({ role, content }) => ({ role, content })),
      ),
    );
  }, [messages]);

  useEffect(() => {
    if (!open) return;
    const frame = window.requestAnimationFrame(() => composerRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    conversationEndRef.current?.scrollIntoView({ block: "end" });
  }, [messages, open, sending, error]);

  useEffect(() => {
    function closeOnEscape(event: globalThis.KeyboardEvent) {
      if (event.key !== "Escape" || !open) return;
      setOpen(false);
      launcherRef.current?.focus();
    }
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [open]);

  useEffect(() => () => requestRef.current?.abort("component_unmounted"), []);

  function messageId() {
    nextMessageId.current += 1;
    return `support-message-${Date.now()}-${nextMessageId.current}`;
  }

  async function requestAnswer(history: SupportMessage[]) {
    requestRef.current?.abort("superseded");
    const controller = new AbortController();
    requestRef.current = controller;
    setSending(true);
    setError(undefined);
    setCanRetry(false);
    try {
      const result = await sendSupportChat(
        history.slice(-MAX_STORED_MESSAGES).map(({ role, content }) => ({ role, content })),
        context,
        controller.signal,
      );
      const assistantMessage: SupportMessage = {
        id: messageId(),
        role: "assistant",
        content: result.message,
      };
      setMessages((current) => [...current, assistantMessage].slice(-MAX_STORED_MESSAGES));
    } catch (caught) {
      if (caught instanceof DOMException && caught.name === "AbortError") return;
      setError(
        isApiRequestError(caught)
          ? caught.message
          : "Zoption Support could not answer right now. Please try again.",
      );
      setCanRetry(true);
    } finally {
      if (requestRef.current === controller) {
        requestRef.current = undefined;
        setSending(false);
      }
    }
  }

  function submitMessage(value = draft) {
    const content = value.trim();
    if (!content || sending) return;
    const nextMessage: SupportMessage = { id: messageId(), role: "user", content };
    const history = [...messages, nextMessage].slice(-MAX_STORED_MESSAGES);
    setMessages(history);
    setDraft("");
    void requestAnswer(history);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    submitMessage();
  }

  function handleComposerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
    event.preventDefault();
    submitMessage();
  }

  function clearConversation() {
    requestRef.current?.abort("conversation_cleared");
    setMessages([welcomeMessage(surface)]);
    setDraft("");
    setError(undefined);
    setCanRetry(false);
    setSending(false);
    composerRef.current?.focus();
  }

  return (
    <aside className={`support-chat-root ${surface} ${open ? "open" : ""}`}>
      {open && (
        <section
          className="support-chat-panel"
          role="dialog"
          aria-modal="false"
          aria-labelledby="support-chat-title"
        >
          <header className="support-chat-header">
            <div className="support-chat-identity" aria-hidden="true">
              <Sparkles size={18} />
            </div>
            <div>
              <h2 id="support-chat-title">Zoption Support</h2>
              <p>
                <span className="support-chat-presence" /> Product help · no account access
              </p>
            </div>
            <div className="support-chat-header-actions">
              <button
                type="button"
                className="support-chat-icon-button"
                onClick={clearConversation}
                aria-label="Start a new support conversation"
                title="New conversation"
              >
                <RefreshCcw size={16} />
              </button>
              <button
                type="button"
                className="support-chat-icon-button"
                onClick={() => {
                  setOpen(false);
                  launcherRef.current?.focus();
                }}
                aria-label="Close Zoption Support"
              >
                <X size={18} />
              </button>
            </div>
          </header>

          <div className="support-chat-conversation" role="log" aria-live="polite">
            {messages.map((message) => (
              <article className={`support-chat-message ${message.role}`} key={message.id}>
                <span>{message.role === "assistant" ? "Support" : "You"}</span>
                <p>
                  {message.role === "assistant"
                    ? renderInlineEmphasis(message.content)
                    : message.content}
                </p>
              </article>
            ))}
            {!hasUserMessage && (
              <div className="support-chat-suggestions" aria-label="Suggested questions">
                {SUGGESTIONS.map((suggestion) => (
                  <button type="button" key={suggestion} onClick={() => submitMessage(suggestion)}>
                    {suggestion}
                  </button>
                ))}
              </div>
            )}
            {sending && (
              <div className="support-chat-thinking" role="status">
                <span />
                <span />
                <span />
                <span className="sr-only">Zoption Support is writing a reply.</span>
              </div>
            )}
            {error && (
              <div className="support-chat-error" role="alert">
                <p>{error}</p>
                {canRetry && (
                  <button type="button" onClick={() => void requestAnswer(messages)}>
                    Try again
                  </button>
                )}
              </div>
            )}
            <div ref={conversationEndRef} />
          </div>

          <form className="support-chat-composer" onSubmit={handleSubmit}>
            <label className="sr-only" htmlFor={`support-chat-input-${surface}`}>
              Ask Zoption Support
            </label>
            <div className="support-chat-composer-row">
              <textarea
                id={`support-chat-input-${surface}`}
                ref={composerRef}
                rows={1}
                maxLength={1_200}
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={handleComposerKeyDown}
                placeholder="Ask how Zoption works…"
                disabled={sending}
              />
              <button
                className="support-chat-send"
                type="submit"
                disabled={sending || !draft.trim()}
                aria-label="Send support message"
              >
                <ArrowUp size={18} />
              </button>
            </div>
            <p className="support-chat-disclosure">
              <ShieldCheck size={13} aria-hidden="true" /> Messages go to DeepSeek for a reply and
              are not added to your financial Assistant history.
            </p>
          </form>
        </section>
      )}

      <button
        ref={launcherRef}
        className="support-chat-launcher"
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-label={open ? "Close Zoption Support" : "Open Zoption Support"}
        aria-expanded={open}
      >
        {open ? (
          <X size={22} aria-hidden="true" />
        ) : (
          <MessageCircleQuestion size={23} aria-hidden="true" />
        )}
        <span>Ask Zoption</span>
      </button>
    </aside>
  );
}
