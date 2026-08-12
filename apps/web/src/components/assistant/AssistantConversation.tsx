import type {
  AssistantMessage,
  AssistantSourceMetadata,
  TransferFeeInsight,
} from "@zoption/shared";
import {
  Bot,
  Database,
  PiggyBank,
  Scale,
  Sparkles,
  TrendingUp,
  UserRound,
  Volume2,
} from "lucide-react";
import { Fragment, useEffect, useRef } from "react";

import { formatMoney, formatMoneyParts } from "../../lib/formatters";
import { renderInlineEmphasis } from "../chat/renderInlineEmphasis";

const QUICK_PROMPTS: { prompt: string; title: string; desc: string; icon: typeof Scale }[] = [
  {
    prompt: "How much did I spend this month?",
    title: "Where did my money go?",
    desc: "This month's spending by category",
    icon: TrendingUp,
  },
  {
    prompt: "Why did I overspend last month?",
    title: "What pushed me over budget?",
    desc: "Budget vs. actual, month over month",
    icon: Scale,
  },
  {
    prompt: "Which debt should I pay first?",
    title: "Which debt should I pay first?",
    desc: "Avalanche vs. snowball guidance",
    icon: PiggyBank,
  },
  {
    prompt: "How much should I save monthly for my goal?",
    title: "How much should I save each month?",
    desc: "Pace toward your savings goal",
    icon: Sparkles,
  },
];

interface AssistantConversationProps {
  assistantName: string;
  messages: AssistantMessage[];
  pendingMessage?: string;
  loading: boolean;
  loadingLabel?: string;
  voiceReplies?: Readonly<Record<string, AssistantMessageVoiceReply>>;
  onPrompt: (prompt: string) => void;
  feeInsight?: TransferFeeInsight;
}

export interface AssistantMessageVoiceReply {
  audioUrl?: string;
  error?: string;
}

function messageTime(value: string): string {
  return new Intl.DateTimeFormat("en-PH", {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
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

function phpAmountParts(amountMinor: number) {
  return formatMoneyParts(amountMinor, "PHP").map((part, index) =>
    part.type === "currency" ? (
      <span className="assistant-fee-currency" key={`${part.type}-${index}`}>
        {part.value}
      </span>
    ) : (
      <Fragment key={`${part.type}-${index}`}>{part.value}</Fragment>
    ),
  );
}

function FeeInsightWelcome({
  assistantName,
  insight,
}: {
  assistantName: string;
  insight: TransferFeeInsight;
}) {
  const hasUsdFees = insight.feesByCurrency.USD > 0;
  const transferNoun = insight.totalFeeChargedTransfers === 1 ? "transfer" : "transfers";
  const weeklyLine =
    insight.totalTransfers > 0 && insight.recentAverageTransfersPerWeek > 0
      ? ` In the last 8 weeks you averaged ${insight.recentAverageTransfersPerWeek} transfers per week${insight.recentAverageFeeChargedTransfersPerWeek > 0 ? `, ${insight.recentAverageFeeChargedTransfersPerWeek} with a fee` : ""}.`
      : "";
  const adviceLine = insight.hasFees
    ? " Because every fee-charged transfer costs money, batching your moves into fewer, larger transfers — like once or twice a week — can reduce the fees you pay."
    : "";

  return (
    <article
      className="assistant-message assistant assistant-fee-welcome"
      aria-label="Transfer fee insight"
    >
      <span className="assistant-message-avatar" aria-hidden="true">
        <Bot size={16} />
      </span>
      <div>
        <div className="assistant-message-meta">
          <strong>{assistantName}</strong>
        </div>
        <p>
          Transfer fees are easy to miss amid your income and expenses. Based on your records
          you&apos;ve paid <strong>{phpAmountParts(insight.feesByCurrency.PHP)}</strong>
          {hasUsdFees && (
            <>
              {" "}
              (<strong>{formatMoney(insight.feesByCurrency.USD, "USD")}</strong> USD)
            </>
          )}{" "}
          in transfer fees across <strong>{insight.totalFeeChargedTransfers}</strong> fee-charged{" "}
          {transferNoun}.{weeklyLine}
          {adviceLine}
        </p>
        <p className="assistant-fee-disclaimer">
          This is general, educational budgeting guidance calculated from the transfer fees
          you&apos;ve recorded. Zoption doesn&apos;t provide personalized financial, investment,
          tax, or legal advice.
        </p>
      </div>
    </article>
  );
}

export function AssistantConversation({
  assistantName,
  messages,
  pendingMessage,
  loading,
  loadingLabel = "Checking your records…",
  voiceReplies,
  onPrompt,
  feeInsight,
}: AssistantConversationProps) {
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (typeof endRef.current?.scrollIntoView === "function") {
      endRef.current.scrollIntoView({ block: "end", behavior: "smooth" });
    }
  }, [messages, pendingMessage, loading]);

  if (messages.length === 0 && !pendingMessage) {
    return (
      <div className="assistant-empty assistant-empty-with-insight">
        <p className="eyebrow">Evidence-led answers from your records</p>
        <h2>What would you like to understand?</h2>
        <p>
          Ask about balances, cash flow, budgets, recurring charges, goals, or debt payoff planning.
        </p>
        <div className="assistant-quick-prompts">
          {QUICK_PROMPTS.map(({ prompt, title, desc, icon: Icon }) => (
            <button type="button" key={prompt} onClick={() => onPrompt(prompt)}>
              <span className="assistant-quick-prompt-icon" aria-hidden="true">
                <Icon size={17} />
              </span>
              <span className="assistant-quick-prompt-copy">
                <span className="assistant-quick-prompt-title">{title}</span>
                <span className="assistant-quick-prompt-desc">{desc}</span>
              </span>
            </button>
          ))}
        </div>
        {feeInsight?.hasFees && (
          <FeeInsightWelcome assistantName={assistantName} insight={feeInsight} />
        )}
      </div>
    );
  }

  return (
    <div className="assistant-messages" aria-live="polite">
      {messages.map((message) => {
        const voiceReply = message.role === "assistant" ? voiceReplies?.[message.id] : undefined;

        return (
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
                  ? renderInlineEmphasis(message.content)
                  : message.content}
              </p>
              {voiceReply && (
                <div
                  className={`assistant-message-voice ${voiceReply.error ? "error" : ""}`}
                  role={voiceReply.error ? "status" : undefined}
                >
                  <span className="assistant-message-voice-label">
                    <Volume2 size={13} aria-hidden="true" />
                    {voiceReply.error ? "Spoken reply unavailable" : "Spoken reply"}
                  </span>
                  {voiceReply.audioUrl ? (
                    <audio
                      controls
                      autoPlay
                      preload="auto"
                      src={voiceReply.audioUrl}
                      aria-label="Spoken assistant reply"
                    />
                  ) : (
                    <small>{voiceReply.error}</small>
                  )}
                </div>
              )}
              {message.role === "assistant" && <AssistantMessageEvidence message={message} />}
              {message.status === "failed" && <small>Not sent. Try asking again.</small>}
            </div>
          </article>
        );
      })}
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
              {loadingLabel}
            </p>
          </div>
        </article>
      )}
      <div ref={endRef} />
    </div>
  );
}
