import type { BugReport, BugReportDiagnostics, BugReportDraft } from "@zoption/shared";
import {
  ArrowUp,
  CheckCircle2,
  MessageCircleQuestion,
  RefreshCcw,
  ShieldCheck,
  Sparkles,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { useLocation } from "react-router-dom";

import {
  createBugReport,
  isApiRequestError,
  sendAuthenticatedSupportChat,
  sendSupportChat,
  type SupportChatResponse,
  type SupportChatMessageInput,
  type SupportPageContext,
} from "../../lib/api";
import type { AuthenticatedWorkspace } from "../../lib/workspace";
import { currentRelease } from "../../releases/currentRelease";
import { BugReportReviewCard } from "./BugReportReviewCard";
import { renderSupportMessage } from "./renderSupportMessage";
import { OPEN_SUPPORT_CHAT_EVENT } from "./supportEvents";
import "./SupportChat.css";

type SupportSurface = "landing" | "app";

interface SupportChatProps {
  surface: SupportSurface;
  workspace?: AuthenticatedWorkspace;
}

interface SupportMessage extends SupportChatMessageInput {
  id: string;
}

const STORAGE_KEY = "zoption:support-chat:v1";
const MAX_STORED_MESSAGES = 12;
const PUBLIC_SUGGESTIONS = [
  "How do imports work?",
  "Where do I set a budget?",
  "What can the AI Assistant access?",
];
const APP_SUGGESTIONS = [
  "Report a problem",
  "How do imports work?",
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

export function SupportChat({ surface, workspace }: SupportChatProps) {
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<SupportMessage[]>(() => readStoredMessages(surface));
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string>();
  const [canRetry, setCanRetry] = useState(false);
  const [reportDraft, setReportDraft] = useState<BugReportDraft>();
  const [reportRequestId, setReportRequestId] = useState<string>();
  const [reportSubmitting, setReportSubmitting] = useState(false);
  const [reportError, setReportError] = useState<string>();
  const [submittedReport, setSubmittedReport] = useState<BugReport>();
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
  const suggestions = surface === "app" ? APP_SUGGESTIONS : PUBLIC_SUGGESTIONS;

  function reportDiagnostics(): BugReportDiagnostics {
    const userAgent = navigator.userAgent;
    const platform: BugReportDiagnostics["platform"] = /Android/i.test(userAgent)
      ? "android"
      : /iPhone|iPad|iPod/i.test(userAgent)
        ? "ios"
        : /Macintosh|Windows|Linux/i.test(userAgent)
          ? "desktop"
          : "other";
    return {
      route: location.pathname,
      releaseVersion: currentRelease.version,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      displayMode: window.matchMedia("(display-mode: standalone)").matches
        ? "standalone"
        : "browser",
      platform,
    };
  }

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
    const handleOpenRequest = () => setOpen(true);
    window.addEventListener(OPEN_SUPPORT_CHAT_EVENT, handleOpenRequest);
    return () => window.removeEventListener(OPEN_SUPPORT_CHAT_EVENT, handleOpenRequest);
  }, []);

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
      const requestMessages = history
        .slice(-MAX_STORED_MESSAGES)
        .map(({ role, content }) => ({ role, content }));
      const result: SupportChatResponse =
        surface === "app" && workspace
          ? await sendAuthenticatedSupportChat(
              workspace,
              requestMessages,
              context === "landing" ? "app" : context,
              controller.signal,
            )
          : await sendSupportChat(requestMessages, context, controller.signal);
      const assistantMessage: SupportMessage = {
        id: messageId(),
        role: "assistant",
        content: result.message,
      };
      setMessages((current) => [...current, assistantMessage].slice(-MAX_STORED_MESSAGES));
      if (result.bugReportDraft) {
        setReportDraft(result.bugReportDraft);
        setReportRequestId(crypto.randomUUID());
        setReportError(undefined);
        setSubmittedReport(undefined);
      }
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

  async function submitBugReport() {
    if (!workspace || !reportDraft || !reportRequestId || surface !== "app") return;
    setReportSubmitting(true);
    setReportError(undefined);
    try {
      const report = await createBugReport(workspace, {
        ...reportDraft,
        clientRequestId: reportRequestId,
        pageContext: context === "landing" ? "app" : context,
        diagnostics: reportDiagnostics(),
      });
      setSubmittedReport(report);
      setReportDraft(undefined);
      setReportRequestId(undefined);
    } catch (caught) {
      setReportError(
        isApiRequestError(caught)
          ? caught.message
          : "The report could not be submitted. Review it and try again.",
      );
    } finally {
      setReportSubmitting(false);
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
    setReportDraft(undefined);
    setReportRequestId(undefined);
    setReportSubmitting(false);
    setReportError(undefined);
    setSubmittedReport(undefined);
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
                <span className="support-chat-presence" /> Product help · no financial-data access
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
                    ? renderSupportMessage(message.content)
                    : message.content}
                </p>
              </article>
            ))}
            {!hasUserMessage && (
              <div className="support-chat-suggestions" aria-label="Suggested questions">
                {suggestions.map((suggestion) => (
                  <button type="button" key={suggestion} onClick={() => submitMessage(suggestion)}>
                    {suggestion}
                  </button>
                ))}
              </div>
            )}
            {reportDraft && surface === "app" && (
              <BugReportReviewCard
                draft={reportDraft}
                diagnostics={reportDiagnostics()}
                busy={reportSubmitting}
                error={reportError}
                onChange={setReportDraft}
                onSubmit={() => void submitBugReport()}
                onCancel={() => {
                  setReportDraft(undefined);
                  setReportRequestId(undefined);
                  setReportError(undefined);
                }}
              />
            )}
            {submittedReport && (
              <div className="support-report-success" role="status">
                <CheckCircle2 size={18} aria-hidden="true" />
                <div>
                  <strong>{submittedReport.reference} received</strong>
                  <p>Your report is saved with status “New.” Track it from Help &amp; contact.</p>
                </div>
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
              <ShieldCheck size={13} aria-hidden="true" /> Messages go to DeepSeek for a reply. Bug
              reports are saved only after you review and submit them.
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
