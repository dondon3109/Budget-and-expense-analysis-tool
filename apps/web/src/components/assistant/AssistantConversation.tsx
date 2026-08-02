import type { AssistantMessage, AssistantSourceMetadata } from "@zoption/shared";
import { Bot, Database, Sparkles, UserRound } from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";

const QUICK_PROMPTS = [
  "How much did I spend this month?",
  "Why did I overspend last month?",
  "Which debt should I pay first?",
  "How much should I save monthly for my goal?",
];

interface AssistantConversationProps {
  assistantName: string;
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

function renderAssistantContent(content: string): ReactNode[] {
  const parts: ReactNode[] = [];
  let cursor = 0;

  while (cursor < content.length) {
    const opening = content.indexOf("**", cursor);
    if (opening === -1) {
      parts.push(content.slice(cursor));
      break;
    }

    const closing = content.indexOf("**", opening + 2);
    if (closing === -1) {
      parts.push(content.slice(cursor));
      break;
    }

    if (opening > cursor) parts.push(content.slice(cursor, opening));
    const emphasized = content.slice(opening + 2, closing);
    if (emphasized) {
      parts.push(<strong key={opening}>{emphasized}</strong>);
    } else {
      parts.push("****");
    }
    cursor = closing + 2;
  }

  return parts;
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}T00:00:00Z`));
}

function formatPeriod(period: { from: string; to: string }): string {
  if (period.from === period.to) return formatDate(period.from);
  return `${formatDate(period.from)} – ${formatDate(period.to)}`;
}

function sourceTypeLabel(source: AssistantSourceMetadata): string {
  if (source.recordCount !== undefined) {
    const label = {
      transactions: "transaction",
      budgets: "budget record",
      accounts: "account",
      goals: "goal",
      debts: "debt",
    }[source.sourceType];
    return `${source.recordCount} ${label}${source.recordCount === 1 ? "" : "s"}`;
  }
  return source.label.toLocaleLowerCase("en-PH");
}

function sourceName(source: AssistantSourceMetadata): string {
  return {
    transactions: "Transactions",
    budgets: "Budgets",
    accounts: "Accounts",
    goals: "Goals",
    debts: "Debts",
  }[source.sourceType];
}

function sourceSummary(source: AssistantSourceMetadata): string {
  const parts = [sourceTypeLabel(source)];
  if (source.period) parts.push(formatPeriod(source.period));
  return `Based on ${parts.join(" · ")}`;
}

function sourceFilters(source: AssistantSourceMetadata): string[] {
  if (!source.filters) return [];
  return [
    source.filters.accountName ? `Account: ${source.filters.accountName}` : undefined,
    source.filters.categoryName ? `Category: ${source.filters.categoryName}` : undefined,
    source.filters.goalName ? `Goal: ${source.filters.goalName}` : undefined,
    source.filters.debtNames?.length ? `Debts: ${source.filters.debtNames.join(", ")}` : undefined,
  ].filter((item): item is string => Boolean(item));
}

function AssistantMessageEvidence({ message }: { message: AssistantMessage }) {
  const metadata = message.metadata;
  if (!metadata) return null;
  const primarySource = metadata.sources[0];

  return (
    <div className="assistant-message-evidence">
      {primarySource && (
        <p className="assistant-source-line">
          <Database size={12} aria-hidden="true" /> {sourceSummary(primarySource)}
        </p>
      )}
      {metadata.sources.length > 0 && (
        <details className="assistant-data-used">
          <summary>Data used</summary>
          <div>
            {metadata.sources.map((source, index) => (
              <section key={`${source.label}-${index}`}>
                <strong>{source.label}</strong>
                <ul>
                  {source.period && <li>Requested period: {formatPeriod(source.period)}</li>}
                  {source.baselinePeriod && (
                    <li>Comparison baseline: {formatPeriod(source.baselinePeriod)}</li>
                  )}
                  <li>Source: {sourceName(source)}</li>
                  {source.recordCount !== undefined && <li>Records: {source.recordCount}</li>}
                  {sourceFilters(source).map((filter) => (
                    <li key={filter}>{filter}</li>
                  ))}
                  <li>Data quality: {source.dataQualityStatus}</li>
                  {source.limitations.map((limitation) => (
                    <li key={limitation}>{limitation}</li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        </details>
      )}
      {metadata.disclaimer && (
        <p className="assistant-topic-disclaimer">{metadata.disclaimer.text}</p>
      )}
    </div>
  );
}

export function AssistantConversation({
  assistantName,
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
        <p className="eyebrow">Evidence-led answers from your records</p>
        <h2>What would you like to understand?</h2>
        <p>
          Ask about balances, cash flow, budgets, recurring charges, goals, or debt payoff planning.
        </p>
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
              <strong>{message.role === "assistant" ? assistantName : "You"}</strong>
              <time dateTime={message.createdAt}>{messageTime(message.createdAt)}</time>
            </div>
            <p>
              {message.role === "assistant"
                ? renderAssistantContent(message.content)
                : message.content}
            </p>
            {message.role === "assistant" && <AssistantMessageEvidence message={message} />}
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
              <strong>{assistantName}</strong>
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
