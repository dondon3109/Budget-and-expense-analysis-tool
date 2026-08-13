import type { CSSProperties } from "react";
import { Img, interpolate, staticFile, useCurrentFrame, useVideoConfig } from "remotion";

import type { ProductAsset } from "../config/types";
import { clamp, easeOut, springIn, stagger } from "../motion";
import { BrandMark } from "./Brand";

const chartBars = [34, 52, 43, 66, 59, 78, 68];

type ProductPreviewProps = {
  asset: ProductAsset;
  compact?: boolean;
  variant?: "dashboard" | "budget" | "assistant";
  style?: CSSProperties;
};

export function ProductPreview({
  asset,
  compact = false,
  variant = "dashboard",
  style,
}: ProductPreviewProps) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const reveal = springIn(frame, fps, 0);
  const tilt = interpolate(frame, [0, 90, 180], [-1.2, 0.9, -0.4], {
    ...clamp,
  });

  return (
    <div
      className={`product-stage${compact ? " is-compact" : ""}`}
      style={{
        opacity: Math.max(0.001, reveal),
        transform: `translateY(${72 * (1 - reveal)}px) scale(${0.94 + reveal * 0.06}) rotate(${tilt}deg)`,
        ...style,
      }}
    >
      <div className="product-browser-bar">
        <div className="browser-dots" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
        <span>zoption.site/app</span>
        <b>Private workspace</b>
      </div>
      {asset.src ? (
        <Img
          className="product-screenshot"
          src={staticFile(asset.src)}
          alt={asset.alt}
          style={{ objectFit: asset.fit, objectPosition: asset.position }}
        />
      ) : (
        <SyntheticProduct variant={variant} />
      )}
      <span className="illustrative-label">Illustrative data</span>
    </div>
  );
}

function SyntheticProduct({ variant }: { variant: "dashboard" | "budget" | "assistant" }) {
  if (variant === "budget") return <BudgetView />;
  if (variant === "assistant") return <AssistantView />;
  return <DashboardView />;
}

function ProductSidebar({ active = "Overview" }: { active?: string }) {
  const items = ["Overview", "Transactions", "Budgets", "Calendar", "Assistant"];
  return (
    <aside className="product-sidebar">
      <div className="product-sidebar-brand">
        <BrandMark size={36} />
        <span>Zoption</span>
      </div>
      <nav>
        {items.map((item) => (
          <span className={item === active ? "is-active" : ""} key={item}>
            <i /> {item}
          </span>
        ))}
      </nav>
      <div className="privacy-chip">Private by design</div>
    </aside>
  );
}

function DashboardView() {
  const frame = useCurrentFrame();
  return (
    <div className="synthetic-product">
      <ProductSidebar />
      <main className="product-content">
        <div className="product-heading-row">
          <div>
            <span className="product-eyebrow">PROFILE OVERVIEW</span>
            <h3>Your month, at a glance</h3>
            <p>See what came in, what went out, and what is still available.</p>
          </div>
          <span className="month-chip">August 2026</span>
        </div>
        <div className="metric-strip">
          <Metric
            tone="income"
            label="Money in"
            value="₱48,000"
            detail="Income this month"
            delay={8}
          />
          <Metric
            tone="expense"
            label="Money out"
            value="₱21,400"
            detail="45% of income"
            delay={13}
          />
          <Metric
            tone="budget"
            label="Remaining budget"
            value="₱8,600"
            detail="62% of plan used"
            delay={18}
          />
        </div>
        <div className="product-panels">
          <section className="chart-panel">
            <div className="panel-title">
              <div>
                <span>MONTHLY CASH FLOW</span>
                <strong>Spending rhythm</strong>
              </div>
              <small>6 months</small>
            </div>
            <div className="chart-area" aria-hidden="true">
              {chartBars.map((height, index) => {
                const progress = easeOut(frame, stagger(index, 3) + 14, 18);
                return (
                  <span key={index} style={{ height: `${height * progress}%` }}>
                    <i style={{ height: `${Math.max(14, height * 0.52)}%` }} />
                  </span>
                );
              })}
            </div>
            <div className="chart-axis">
              <span>Mar</span>
              <span>Apr</span>
              <span>May</span>
              <span>Jun</span>
              <span>Jul</span>
              <span>Aug</span>
            </div>
          </section>
          <section className="budget-panel-preview">
            <div className="panel-title">
              <div>
                <span>CATEGORY BUDGETS</span>
                <strong>Still on track</strong>
              </div>
              <small>62% used</small>
            </div>
            <BudgetRow name="Groceries" spent="₱4,240" percent={72} color="#0f6b5b" delay={14} />
            <BudgetRow name="Transport" spent="₱1,840" percent={46} color="#2f65c8" delay={19} />
            <BudgetRow name="Utilities" spent="₱2,180" percent={61} color="#6e4fc5" delay={24} />
          </section>
        </div>
        <section className="recent-transactions-preview">
          <div className="panel-title">
            <div>
              <span>RECENT TRANSACTIONS</span>
              <strong>Records behind the picture</strong>
            </div>
            <small>View all</small>
          </div>
          <div className="transaction-preview-row">
            <i className="transaction-icon income">↓</i>
            <div>
              <strong>Monthly salary</strong>
              <span>Income · Aug 01</span>
            </div>
            <b className="income">+₱48,000</b>
          </div>
          <div className="transaction-preview-row">
            <i className="transaction-icon expense">↑</i>
            <div>
              <strong>Neighborhood market</strong>
              <span>Groceries · Aug 04</span>
            </div>
            <b>−₱1,240</b>
          </div>
          <div className="transaction-preview-row">
            <i className="transaction-icon expense">↑</i>
            <div>
              <strong>Electric bill</strong>
              <span>Utilities · Aug 08</span>
            </div>
            <b>−₱2,180</b>
          </div>
        </section>
      </main>
    </div>
  );
}

function Metric({
  tone,
  label,
  value,
  detail,
  delay,
}: {
  tone: "income" | "expense" | "budget";
  label: string;
  value: string;
  detail: string;
  delay: number;
}) {
  const frame = useCurrentFrame();
  const progress = easeOut(frame, delay, 14);
  return (
    <article
      className={`preview-metric tone-${tone}`}
      style={{ opacity: progress, transform: `translateY(${16 * (1 - progress)}px)` }}
    >
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </article>
  );
}

function BudgetRow({
  name,
  spent,
  percent,
  color,
  delay,
}: {
  name: string;
  spent: string;
  percent: number;
  color: string;
  delay: number;
}) {
  const frame = useCurrentFrame();
  const progress = easeOut(frame, delay, 20);
  return (
    <div className="budget-preview-row">
      <div>
        <strong>{name}</strong>
        <span>{spent}</span>
      </div>
      <i>
        <b style={{ width: `${percent * progress}%`, background: color }} />
      </i>
    </div>
  );
}

function BudgetView() {
  return (
    <div className="synthetic-product">
      <ProductSidebar active="Budgets" />
      <main className="product-content budget-product-view">
        <div className="product-heading-row">
          <div>
            <span className="product-eyebrow">MONTHLY PLAN</span>
            <h3>Shape your August budget</h3>
            <p>Set practical category limits and see what remains.</p>
          </div>
          <span className="month-chip">Saved ✓</span>
        </div>
        <div className="budget-summary">
          <Metric
            tone="income"
            label="Planned"
            value="₱22,500"
            detail="Across 5 categories"
            delay={8}
          />
          <Metric
            tone="expense"
            label="Recorded"
            value="₱13,900"
            detail="Expenses this month"
            delay={13}
          />
          <Metric
            tone="budget"
            label="Remaining"
            value="₱8,600"
            detail="38% still available"
            delay={18}
          />
        </div>
        <section className="budget-editor-preview">
          <div className="panel-title">
            <div>
              <span>CATEGORY LIMITS</span>
              <strong>Follow the plan, one category at a time</strong>
            </div>
          </div>
          <BudgetRow
            name="Groceries"
            spent="₱4,240 of ₱6,000"
            percent={72}
            color="#0f6b5b"
            delay={14}
          />
          <BudgetRow
            name="Transport"
            spent="₱1,840 of ₱4,000"
            percent={46}
            color="#2f65c8"
            delay={19}
          />
          <BudgetRow
            name="Utilities"
            spent="₱2,180 of ₱3,600"
            percent={61}
            color="#6e4fc5"
            delay={24}
          />
          <BudgetRow
            name="Dining"
            spent="₱1,520 of ₱3,000"
            percent={51}
            color="#d96b35"
            delay={29}
          />
        </section>
      </main>
    </div>
  );
}

function AssistantView() {
  const frame = useCurrentFrame();
  const reply = easeOut(frame, 14, 24);
  return (
    <div className="synthetic-product assistant-product-view">
      <ProductSidebar active="Assistant" />
      <main className="assistant-preview-content">
        <div className="assistant-preview-top">
          <div>
            <span className="status-dot" /> <strong>Your assistant</strong> <small>Read only</small>
          </div>
          <span>90-day private history</span>
        </div>
        <div className="assistant-preview-messages">
          <div className="user-bubble">Where did most of my spending go this month?</div>
          <div
            className="assistant-bubble"
            style={{ opacity: reply, transform: `translateY(${20 * (1 - reply)}px)` }}
          >
            <span>Based on your recorded August expenses</span>
            <strong>Groceries are your largest category at ₱4,240.</strong>
            <p>That is 72% of the category budget you set. Dining is next at ₱1,520.</p>
            <small>Illustrative answer · Verified from workspace data</small>
          </div>
        </div>
        <div className="assistant-composer">
          Ask about your recorded finances <b>↑</b>
        </div>
      </main>
    </div>
  );
}

export function FloatingCallout({
  children,
  delay = 0,
  side = "left",
  style,
}: {
  children: string;
  delay?: number;
  side?: "left" | "right";
  style?: CSSProperties;
}) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const progress = springIn(frame, fps, delay);
  return (
    <div
      className={`floating-callout is-${side}`}
      style={{
        opacity: progress,
        transform: `translateY(${34 * (1 - progress)}px) scale(${0.9 + progress * 0.1})`,
        ...style,
      }}
    >
      <span>✓</span>
      {children}
    </div>
  );
}

export function ProblemCluster({ lines }: { lines: readonly [string, string, string] }) {
  const frame = useCurrentFrame();
  const cards = [
    { className: "receipt-card receipt-one", amount: "₱1,240", label: lines[0], rotation: -8 },
    { className: "receipt-card receipt-two", amount: "₱2,180", label: lines[1], rotation: 7 },
    { className: "receipt-card receipt-three", amount: "₱860", label: lines[2], rotation: -3 },
  ];
  return (
    <div className="problem-cluster">
      {cards.map((card, index) => {
        const progress = springIn(frame, 30, 8 + index * 6);
        const float = Math.sin((frame + index * 18) / 13) * 5;
        return (
          <div
            key={card.label}
            className={card.className}
            style={{
              opacity: progress,
              transform: `translateY(${(1 - progress) * 80 + float}px) rotate(${card.rotation}deg) scale(${0.9 + progress * 0.1})`,
            }}
          >
            <span>{card.label}</span>
            <strong>{card.amount}</strong>
            <i />
            <i />
            <i />
          </div>
        );
      })}
      <div className="problem-question" style={{ opacity: easeOut(frame, 30, 14) }}>
        Where did it all go?
      </div>
    </div>
  );
}
