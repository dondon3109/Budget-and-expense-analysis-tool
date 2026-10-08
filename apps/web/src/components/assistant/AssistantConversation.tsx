import {
  assistantActionSchema,
  assistantReplyDrafts,
  assistantTransactionDraftSchema,
  goalConfigFor,
  otherCurrenciesWithAmounts,
} from "@zoption/shared";
import type {
  Currency,
  PrimaryGoal,
  AssistantMessage,
  AssistantSourceMetadata,
  TransferFeeInsight,
} from "@zoption/shared";
import {
  ArrowRight,
  Bot,
  Check,
  Database,
  NotebookPen,
  PiggyBank,
  ReceiptText,
  Scale,
  Sparkles,
  TrendingUp,
  UserRound,
  Volume2,
} from "lucide-react";
import { Fragment, useEffect, useRef } from "react";

import { formatMoney, formatMoneyParts } from "../../lib/formatters";
import { workspaceCurrency } from "../../lib/workspaceCurrency";
import { renderInlineEmphasis } from "../chat/renderInlineEmphasis";
import { AssistantActionCard } from "./AssistantActionCard";
import "./AssistantTransactionDraft.css";

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
  {
    prompt: "Help me log an expense",
    title: "Log what I just spent",
    desc: "Suggestions from your past entries",
    icon: NotebookPen,
  },
  {
    prompt: "I only know how much is left in my wallet. Help me log my spending.",
    title: "I only know what's left",
    desc: "Work out the amount from your balance",
    icon: ReceiptText,
  },
];

/** The goal's starter prompt leads; the list keeps its length. No goal returns today's list. */
export function quickPromptsForGoal(goal: PrimaryGoal | null | undefined) {
  const starter = goalConfigFor(goal).starterPrompt;
  if (!starter) return QUICK_PROMPTS;
  const lead = {
    prompt: starter,
    title: starter,
    desc: "Suggested for your goal",
    icon: Sparkles,
  };
  return [lead, ...QUICK_PROMPTS.filter(({ prompt }) => prompt !== starter)].slice(
    0,
    QUICK_PROMPTS.length,
  );
}

interface AssistantConversationProps {
  goal?: PrimaryGoal | null;
  assistantName: string;
  messages: AssistantMessage[];
  pendingMessage?: string;
  loading: boolean;
  voiceReplies?: Readonly<Record<string, AssistantMessageVoiceReply>>;
  onPrompt: (prompt: string) => void;
  feeInsight?: TransferFeeInsight;
  draftSave?: AssistantDraftSave;
  actionSave?: AssistantDraftSave;
}

export interface AssistantDraftSave {
  savingMessageId?: string;
  failedMessageId?: string;
  /** Which of the reply's drafts is saving or failed; the first when absent. Drafts only. */
  savingSlot?: number;
  failedSlot?: number;
  error?: string;
  onSave: (messageId: string, slot?: number) => void;
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
      categories: "category",
      budgets: "budget record",
      accounts: "account",
      goals: "goal",
      debts: "debt",
      subscriptions: "subscription",
    }[source.sourceType];
    return `${source.recordCount} ${label}${source.recordCount === 1 ? "" : "s"}`;
  }
  return source.label.toLocaleLowerCase("en-PH");
}

function sourceName(source: AssistantSourceMetadata): string {
  return {
    transactions: "Transactions",
    categories: "Categories",
    budgets: "Budgets",
    accounts: "Accounts",
    goals: "Goals",
    debts: "Debts",
    subscriptions: "Subscriptions",
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
  // A reply with no sources or disclaimer has no evidence to show, so no empty rule under it.
  if (!metadata || (metadata.sources.length === 0 && !metadata.disclaimer)) return null;
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

function AssistantTransactionDraftCard({
  message,
  slot,
  draftSave,
  superseded,
}: {
  message: AssistantMessage;
  /** Which of the reply's drafts this card shows. */
  slot: number;
  draftSave?: AssistantDraftSave;
  /** A later reply drafted again, so saving this one would record the purchase twice. */
  superseded: boolean;
}) {
  const parsed = assistantTransactionDraftSchema.safeParse(
    assistantReplyDrafts(message.metadata)[slot],
  );
  if (!parsed.success) return null;
  const draft = parsed.data;
  // A stored "saving" state is not trusted here: the server refuses a live claim and takes
  // over one a failed request left behind, so the button stays usable.
  const saving = draftSave?.savingMessageId === message.id && (draftSave.savingSlot ?? 0) === slot;
  const saved = draft.status === "saved";
  const error =
    draftSave?.failedMessageId === message.id && (draftSave.failedSlot ?? 0) === slot
      ? draftSave.error
      : undefined;

  return (
    <section className={`assistant-draft ${draft.kind}`} aria-label="Transaction draft">
      <div className="assistant-draft-head">
        <span>{draft.kind === "income" ? "Income" : "Expense"} draft</span>
        <strong>{formatMoney(draft.amountMinor, draft.currency)}</strong>
      </div>
      <dl>
        <div>
          <dt>Description</dt>
          <dd>{draft.description}</dd>
        </div>
        <div>
          <dt>Category</dt>
          <dd>{draft.categoryName}</dd>
        </div>
        <div>
          <dt>Account</dt>
          <dd>{draft.accountName}</dd>
        </div>
        <div>
          <dt>Date</dt>
          <dd>{formatDate(draft.date)}</dd>
        </div>
      </dl>
      {saved ? (
        <p className="assistant-draft-saved" role="status">
          <Check size={14} aria-hidden="true" /> Saved to your transactions
        </p>
      ) : superseded ? (
        <small>Replaced by a newer draft below.</small>
      ) : (
        <button
          type="button"
          className="assistant-draft-save"
          disabled={saving || !draftSave}
          onClick={() => draftSave?.onSave(message.id, slot)}
        >
          {saving ? "Saving…" : "Save transaction"}
        </button>
      )}
      {!saved && !superseded && !error && (
        <small>Not saved yet. Ask me to change anything before you save.</small>
      )}
      {error && (
        <small className="assistant-draft-error" role="alert">
          {error}
        </small>
      )}
    </section>
  );
}

function amountParts(amountMinor: number, currency: Currency) {
  return formatMoneyParts(amountMinor, currency).map((part, index) =>
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
  // Fees lead with the workspace currency; fees paid in other currencies follow.
  const baseCurrency = workspaceCurrency();
  const otherFeeCurrencies = otherCurrenciesWithAmounts(insight.feesByCurrency, baseCurrency);
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
          you&apos;ve paid{" "}
          <strong>{amountParts(insight.feesByCurrency[baseCurrency] ?? 0, baseCurrency)}</strong>
          {otherFeeCurrencies.map((currency) => (
            <Fragment key={currency}>
              {" "}
              (<strong>{formatMoney(insight.feesByCurrency[currency] ?? 0, currency)}</strong>{" "}
              {currency})
            </Fragment>
          ))}{" "}
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
  voiceReplies,
  onPrompt,
  feeInsight,
  draftSave,
  actionSave,
  goal,
}: AssistantConversationProps) {
  const endRef = useRef<HTMLDivElement>(null);
  // Replies whose draft a later correction replaced; saving one would record a purchase twice.
  const replacedDraftKeys = new Set<string>();
  for (const message of messages) {
    for (const value of assistantReplyDrafts(message.metadata)) {
      const parsed = assistantTransactionDraftSchema.safeParse(value);
      if (parsed.success && parsed.data.replacesMessageId) {
        replacedDraftKeys.add(`${parsed.data.replacesMessageId}:${parsed.data.replacesSlot ?? 0}`);
      }
    }
  }

  // Only the newest proposal in the chat can be confirmed; earlier ones would apply twice.
  const lastActionId = [...messages]
    .reverse()
    .find(
      (message) => assistantActionSchema.safeParse(message.metadata?.assistantAction).success,
    )?.id;

  useEffect(() => {
    if (typeof endRef.current?.scrollIntoView === "function") {
      endRef.current.scrollIntoView({ block: "end", behavior: "smooth" });
    }
  }, [messages, pendingMessage, loading]);

  if (messages.length === 0 && !pendingMessage) {
    return (
      <div className="assistant-empty assistant-empty-with-insight">
        <span className="assistant-empty-core-beacon" aria-hidden="true">
          <Sparkles size={28} />
        </span>
        <p className="eyebrow">Evidence-led answers from your records</p>
        <h2>What would you like to understand?</h2>
        <p>
          Ask about balances, cash flow, budgets, recurring charges, goals, or debt payoff planning,
          or tell me what you spent and I&apos;ll help you log it.
        </p>
        <div className="assistant-quick-prompts">
          {quickPromptsForGoal(goal).map(({ prompt, title, desc, icon: Icon }) => (
            <button type="button" key={prompt} onClick={() => onPrompt(prompt)}>
              <span className="assistant-quick-prompt-icon" aria-hidden="true">
                <Icon size={17} />
              </span>
              <span className="assistant-quick-prompt-copy">
                <span className="assistant-quick-prompt-title">{title}</span>
                <span className="assistant-quick-prompt-desc">{desc}</span>
              </span>
              <span className="assistant-quick-prompt-arrow" aria-hidden="true">
                <ArrowRight size={14} />
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
              {message.role === "assistant" &&
                assistantReplyDrafts(message.metadata).map((_, slot) => (
                  <AssistantTransactionDraftCard
                    key={slot}
                    message={message}
                    slot={slot}
                    draftSave={draftSave}
                    superseded={replacedDraftKeys.has(`${message.id}:${slot}`)}
                  />
                ))}
              {message.role === "assistant" && (
                <AssistantActionCard
                  message={message}
                  save={actionSave}
                  superseded={lastActionId !== message.id}
                />
              )}
              {message.role === "assistant" && <AssistantMessageEvidence message={message} />}
              {message.status === "failed" && <small>Not sent. Try asking again.</small>}
            </div>
          </article>
        );
      })}
      {pendingMessage && (
        <article className="assistant-message user">
          <span className="assistant-message-avatar" aria-hidden="true">
            <UserRound size={16} />
          </span>
          <div>
            <div className="assistant-message-meta">
              <strong>You</strong>
              <span>Sent</span>
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
            <p className="assistant-checking-status">
              <span className="assistant-thinking-bars" aria-hidden="true">
                <span className="assistant-thinking-bar" />
                <span className="assistant-thinking-bar" />
                <span className="assistant-thinking-bar" />
                <span className="assistant-thinking-bar" />
              </span>
              <span className="assistant-thinking-text">Checking your records…</span>
            </p>
          </div>
        </article>
      )}
      <div ref={endRef} />
    </div>
  );
}
