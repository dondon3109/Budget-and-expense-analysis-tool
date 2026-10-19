import { PLAN_PRICES_MINOR, type BillingPlanKey } from "@zoption/shared";
import { ArrowRight, Check, Minus, ShieldCheck, Sparkles } from "lucide-react";

import { LegalFooter } from "../../components/legal/LegalFooter";
import { Breadcrumbs } from "../../components/navigation/Breadcrumbs";
import { PublicHeader } from "../../components/navigation/PublicHeader";
import "./PricingPage.css";
import { appUrl, NEW_TAB } from "../../lib/appUrl";

interface ComparisonFeature {
  name: string;
  free: string;
  budget: string;
  pro: string;
}

const COMPARISON_ROWS: { category: string; features: ComparisonFeature[] }[] = [
  {
    category: "Privacy & Data Ownership",
    features: [
      {
        name: "Zero bank credentials required",
        free: "Yes (100% private)",
        budget: "Yes (100% private)",
        pro: "Yes (100% private)",
      },
      {
        name: "Data storage",
        free: "Private cloud workspace",
        budget: "Private cloud workspace",
        pro: "Private cloud workspace",
      },
      {
        name: "No advertising or data monetization",
        free: "Guaranteed",
        budget: "Guaranteed",
        pro: "Guaranteed",
      },
      {
        name: "Filtered CSV transaction export",
        free: "Not included",
        budget: "Full access",
        pro: "Full access",
      },
    ],
  },
  {
    category: "Transactions & Fast Entry",
    features: [
      {
        name: "Voice, receipt photo, and PDF statement entry",
        free: "Included (shared AI pool)",
        budget: "Included (shared AI pool)",
        pro: "Included (shared AI pool)",
      },
      {
        name: "Bank statement imports (CSV, XLS, XLSX)",
        free: "1 committed / month",
        budget: "5 committed / month",
        pro: "10 committed / month",
      },
      {
        name: "Transaction deduplication warnings",
        free: "Included",
        budget: "Included",
        pro: "Included",
      },
      {
        name: "Exact centavo integer math (no rounding drift)",
        free: "Included",
        budget: "Included",
        pro: "Included",
      },
    ],
  },
  {
    category: "Accounts & Budgets",
    features: [
      {
        name: "Custom accounts (add, rename, remove)",
        free: "Unlimited",
        budget: "Unlimited",
        pro: "Unlimited",
      },
      {
        name: "Custom budget categories",
        free: "4 custom + starters",
        budget: "10 custom + starters",
        pro: "Unlimited active",
      },
      {
        name: "High-yield savings interest compounding",
        free: "Manual entry",
        budget: "Automatic (daily/mo/yr)",
        pro: "Automatic (daily/mo/yr)",
      },
      {
        name: "Cash flow analytics",
        free: "Week view",
        budget: "Week, month, and 6-month",
        pro: "Week, month, and 6-month",
      },
      {
        name: "Interactive Renewal Calendar (Subscriptions)",
        free: "Basic list",
        budget: "Interactive monthly grid",
        pro: "Interactive monthly grid",
      },
      {
        name: "Streak pet",
        free: "Grows to Baby",
        budget: "Grows to Legend",
        pro: "Grows to Legend",
      },
    ],
  },
  {
    category: "AI Financial Assistant",
    features: [
      {
        name: "Shared AI usage pool (chat, voice chat, receipt scanning, PDF entry, transaction voice)",
        free: "500 AI actions / month",
        budget: "1,000 AI actions / month",
        pro: "2,000 AI actions / month",
      },
      {
        name: "Live streaming voice chat",
        free: "Not included",
        budget: "Included",
        pro: "Included",
      },
      {
        name: "Assistant permissions model",
        free: "Consented; you confirm every change",
        budget: "Consented; you confirm every change",
        pro: "Consented; you confirm every change",
      },
    ],
  },
  {
    category: "Platforms & Support",
    features: [
      {
        name: "Progressive Web App (PWA) and Android Beta APK",
        free: "Included",
        budget: "Included",
        pro: "Included",
      },
      {
        name: "Customer support",
        free: "Community & documentation",
        budget: "Direct support (< 48h response)",
        pro: "Direct priority support (< 24h response)",
      },
    ],
  },
];

const PRICING_FAQS = [
  {
    question: "Is there a free trial of Zoption Pro?",
    answer:
      "Yes. Every new account gets 7 days of Zoption Pro for free, with no card or payment setup. We email you when the trial starts, the day before it ends, and when it has ended. Afterwards you move to the Free plan automatically, nothing is charged, and all your data stays.",
  },
  {
    question: "What is the difference between Budget and Pro?",
    answer:
      "Zoption Budget unlocks every paid feature: live voice chat, automatic interest, full cash flow analytics, export, the renewal calendar, and a streak pet that grows to Legend. Zoption Pro doubles the AI actions to 2,000 a month, raises imports to 10 a month, removes the custom category limit, and answers support within 24 hours.",
  },
  {
    question: "How do the family plans work?",
    answer:
      "A family plan covers one shared family space for up to 6 people, the owner included. Family Budget gives every member Zoption Budget for their own Zoption too, and Family Pro gives everyone Zoption Pro. AI actions and imports stay personal. The owner can set up the family first and try it alone with Free limits; invitations open once a family plan is chosen.",
  },
  {
    question: "Can I use Zoption for free permanently?",
    answer:
      "Yes. The Free plan has no trial expiration and does not ask for credit card information. Core tracking, budgeting, and 500 shared AI actions per month—chat, voice chat, receipt scanning, PDF statement entry, and transaction voice entry—are yours for as long as you want.",
  },
  {
    question: "Why does Zoption avoid direct bank credential connections?",
    answer:
      "Connecting bank accounts often requires sharing online banking credentials with third-party aggregators and dealing with broken sync connections. Zoption lets you import standard bank statements (PDF, CSV, Excel) or record entries by voice in seconds—keeping your financial passwords 100% private.",
  },
  {
    question: "What currencies and billing methods are supported?",
    answer:
      "You can track money in 47 common currencies, including PHP, USD, EUR, GBP, JPY, AUD, CAD, SGD, and AED, with a separate currency per account. Paid plans are billed in Philippine pesos (PHP). PayPal or Dodo Payments securely processes card payments and subscription approvals without Zoption ever touching your card data.",
  },
  {
    question: "Can I change or cancel my plan at any time?",
    answer:
      "Yes. In Plan and billing you can move up right away, or move down and keep your current plan until the paid period ends. Cancelling stops renewal, and you keep the plan until the end of your prepaid period.",
  },
  {
    question: "How does the annual plan discount work?",
    answer:
      "Every annual plan costs 10 times its monthly price, so a year is 2 months free. Zoption Budget is ₱1,490 a year instead of ₱1,788 paid monthly.",
  },
  {
    question: "What is your customer support response time?",
    answer:
      "For general inquiries and bug reports, our team reviews and responds within 24 to 48 business hours. Budget subscribers get direct support within 48 hours, and Pro subscribers receive priority support with responses typically under 24 hours. The built-in AI Support Assistant is available 24/7 for instant answers.",
  },
];

const wholePesos = new Intl.NumberFormat("en-PH", {
  style: "currency",
  currency: "PHP",
  maximumFractionDigits: 0,
});

/** Plan prices are whole pesos, so the division is exact. */
function price(plan: BillingPlanKey, interval: "month" | "year"): string {
  return wholePesos.format(PLAN_PRICES_MINOR[plan][interval] / 100);
}

interface PaidPlanCard {
  plan: BillingPlanKey;
  name: string;
  badge?: string;
  description: string;
  cta: string;
  inclusions: string[];
}

const BUDGET_CARD: PaidPlanCard = {
  plan: "budget",
  name: "Zoption Budget",
  description: "Every paid feature for one person, with room for a busy month.",
  cta: "Start with Budget",
  inclusions: [
    "1,000 AI actions a month in the same shared pool, plus live streaming voice chat",
    "5 committed statement imports per month",
    "10 custom categories",
    "Automatic savings interest, full cash flow analytics, and the renewal calendar",
    "Filtered CSV transaction export",
    "A streak pet that grows all the way to Legend",
    "Direct support within 48 hours",
  ],
};

const PRO_CARD: PaidPlanCard = {
  plan: "pro",
  name: "Zoption Pro",
  badge: "Power Tracker",
  description: "Everything in Budget with double the AI actions and no category limit.",
  cta: "Start with Pro",
  inclusions: [
    "2,000 AI actions a month in the same shared pool",
    "10 committed statement imports per month",
    "Unlimited custom categories",
    "Direct priority support within 24 hours",
  ],
};

const familyInclusions = (tier: string) => [
  "Up to 6 people, the owner included",
  `Everyone gets ${tier} for their own Zoption too`,
  "Shared budgets, remittances, receipts, and comments",
  "AI actions and imports stay personal to each member",
];

const FAMILY_BUDGET_CARD: PaidPlanCard = {
  plan: "family_budget",
  name: "Family Budget",
  description: "One shared family space for up to 6 people, each with Zoption Budget.",
  cta: "Start a family",
  inclusions: familyInclusions("Zoption Budget"),
};

const FAMILY_PRO_CARD: PaidPlanCard = {
  plan: "family_pro",
  name: "Family Pro",
  badge: "Whole household",
  description: "One shared family space for up to 6 people, each with Zoption Pro.",
  cta: "Start a family",
  inclusions: familyInclusions("Zoption Pro"),
};

function PlanCard({ card, everything }: { card: PaidPlanCard; everything: string }) {
  return (
    <article className={card.badge ? "pricing-card featured" : "pricing-card"}>
      {card.badge && <span className="pricing-card-badge">{card.badge}</span>}
      <div className="pricing-card-header">
        <h2>{card.name}</h2>
        <p className="pricing-card-description">{card.description}</p>
        <div className="pricing-card-price">
          <strong data-interval-only="month">{price(card.plan, "month")}</strong>
          <span data-interval-only="month">/ month</span>
          <strong data-interval-only="year">{price(card.plan, "year")}</strong>
          <span data-interval-only="year">/ year</span>
        </div>
        <div className="pricing-card-subtext">
          <span data-interval-only="year">Billed annually, 2 months free</span>
          <span data-interval-only="month">Billed monthly, cancel renewal anytime</span>
        </div>
      </div>

      <div className="pricing-card-cta">
        <a
          className={card.badge ? "button primary" : "button secondary"}
          href={appUrl("/signup")}
          {...NEW_TAB}
        >
          {card.cta} <ArrowRight size={16} aria-hidden="true" />
        </a>
      </div>

      <ul className="pricing-card-features" aria-label={`${card.name} inclusions`}>
        <li className="pricing-card-feature-item">
          <Sparkles size={18} className="pricing-check-icon" aria-hidden="true" />
          <span>
            <strong>Everything in {everything}</strong>, plus:
          </span>
        </li>
        {card.inclusions.map((inclusion) => (
          <li key={inclusion} className="pricing-card-feature-item">
            <Check size={18} className="pricing-check-icon" aria-hidden="true" />
            <span>{inclusion}</span>
          </li>
        ))}
      </ul>
    </article>
  );
}

function FeatureValue({ value }: { value: string }) {
  return value === "Not included" ? <Minus size={16} aria-label="Not included" /> : <>{value}</>;
}

/**
 * Both billing intervals and both plan scopes are in the HTML so crawlers read every price; the
 * toggles flip `data-active-interval` and `data-active-scope` through `src/client/site.ts`.
 */
export function PricingPage() {
  return (
    <div className="pricing-page" data-active-interval="month" data-active-scope="personal">
      <PublicHeader
        navLabel="Main navigation"
        links={[
          { label: "Overview", href: "/" },
          { label: "Pricing", href: "/pricing" },
          { label: "Changelog", href: "/changelog" },
          { label: "Android APK", href: "/install" },
          { label: "FAQ", href: "/faq" },
        ]}
      />

      <main className="pricing-main" id="main-content" tabIndex={-1}>
        <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "Pricing & Plans" }]} />
        <section className="pricing-hero">
          <div className="pricing-eyebrow">
            <ShieldCheck size={16} aria-hidden="true" />
            <span>Transparent Pricing &middot; Philippine Pesos (PHP)</span>
          </div>
          <h1>Clear, honest pricing. Start for free, upgrade when ready.</h1>
          <p className="pricing-lead">
            A private budget and expense tracker without direct bank connections, credential risks,
            or advertising monetization.
          </p>

          <div className="pricing-toggles">
            <div className="pricing-interval-toggle" role="radiogroup" aria-label="Plans for">
              <button
                type="button"
                role="radio"
                aria-checked="true"
                className="active"
                data-scope-choice="personal"
              >
                Personal
              </button>
              <button type="button" role="radio" aria-checked="false" data-scope-choice="family">
                Family
              </button>
            </div>
            <div
              className="pricing-interval-toggle"
              role="radiogroup"
              aria-label="Billing frequency"
            >
              <button
                type="button"
                role="radio"
                aria-checked="true"
                className="active"
                data-interval-choice="month"
              >
                Monthly billing
              </button>
              <button type="button" role="radio" aria-checked="false" data-interval-choice="year">
                Annual billing
                <span className="pricing-discount-badge">2 months free</span>
              </button>
            </div>
          </div>
        </section>

        <section
          className="pricing-cards-grid"
          aria-label="Personal plan options"
          data-scope-only="personal"
        >
          <article className="pricing-card">
            <div className="pricing-card-header">
              <h2>Free Plan</h2>
              <p className="pricing-card-description">
                Everything you need to track money privately, including 500 shared AI actions a
                month and statement imports.
              </p>
              <div className="pricing-card-price">
                <strong>₱0</strong>
                <span>/ forever</span>
              </div>
              <div className="pricing-card-subtext">No credit card or payment info required</div>
            </div>

            <div className="pricing-card-cta">
              <a className="button secondary" href={appUrl("/signup")} {...NEW_TAB}>
                Create free workspace <ArrowRight size={16} aria-hidden="true" />
              </a>
            </div>

            <ul className="pricing-card-features" aria-label="Free plan inclusions">
              <li className="pricing-card-feature-item">
                <Check size={18} className="pricing-check-icon" aria-hidden="true" />
                <span>
                  500 AI actions a month, shared by chat, voice, receipt scanning and PDF entry
                </span>
              </li>
              <li className="pricing-card-feature-item">
                <Check size={18} className="pricing-check-icon" aria-hidden="true" />
                <span>
                  Unlimited manual entries and universal bank statement importer (1 import/mo)
                </span>
              </li>
              <li className="pricing-card-feature-item">
                <Check size={18} className="pricing-check-icon" aria-hidden="true" />
                <span>Unlimited custom accounts, budget envelopes &amp; spending breakdown</span>
              </li>
              <li className="pricing-card-feature-item">
                <Check size={18} className="pricing-check-icon" aria-hidden="true" />
                <span>Private workspace with exact centavo math</span>
              </li>
              <li className="pricing-card-feature-item">
                <Check size={18} className="pricing-check-icon" aria-hidden="true" />
                <span>Offline PWA &amp; Official Android Beta APK</span>
              </li>
            </ul>
          </article>
          <PlanCard card={BUDGET_CARD} everything="Free" />
          <PlanCard card={PRO_CARD} everything="Budget" />
        </section>

        <section
          className="pricing-cards-grid"
          aria-label="Family plan options"
          data-scope-only="family"
        >
          <PlanCard card={FAMILY_BUDGET_CARD} everything="Zoption Budget" />
          <PlanCard card={FAMILY_PRO_CARD} everything="Zoption Pro" />
        </section>

        <section className="pricing-comparison-section" aria-labelledby="comparison-heading">
          <h2 id="comparison-heading">Detailed Plan Comparison</h2>
          <p className="pricing-comparison-lead">
            Compare Free, Budget, and Pro to pick what matches your tracking style. Family Budget
            and Family Pro give every member the Budget or Pro column for their own Zoption.
          </p>

          <div
            className="pricing-table-container"
            role="region"
            aria-label="Detailed plan comparison table"
            tabIndex={0}
          >
            <table className="pricing-comparison-table">
              <thead>
                <tr>
                  <th scope="col">Feature</th>
                  <th scope="col">Free</th>
                  <th scope="col">Budget</th>
                  <th scope="col">Pro</th>
                </tr>
              </thead>
              <tbody>
                {COMPARISON_ROWS.flatMap((group) => {
                  const headerRow = (
                    <tr key={group.category} className="category-header">
                      <td colSpan={4}>{group.category}</td>
                    </tr>
                  );
                  const featureRows = group.features.map((feat) => (
                    <tr key={feat.name}>
                      <th scope="row">{feat.name}</th>
                      <td>
                        <FeatureValue value={feat.free} />
                      </td>
                      <td>
                        <FeatureValue value={feat.budget} />
                      </td>
                      <td>
                        <strong>
                          <FeatureValue value={feat.pro} />
                        </strong>
                      </td>
                    </tr>
                  ));
                  return [headerRow, ...featureRows];
                })}
              </tbody>
            </table>
          </div>
        </section>

        <section className="pricing-faq-section" aria-labelledby="pricing-faq-heading">
          <h2 id="pricing-faq-heading">Frequently Asked Questions About Pricing</h2>
          <p className="pricing-faq-lead">
            Everything you need to know about billing, privacy, payments, and plan upgrades.
          </p>

          <div className="pricing-faq-list">
            {PRICING_FAQS.map((faq) => (
              <article key={faq.question} className="pricing-faq-item">
                <h3>{faq.question}</h3>
                <p>{faq.answer}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="pricing-bottom-cta">
          <h2>Ready to bring clarity to your money?</h2>
          <p>
            Join thousands of users organizing their personal finances privately. No bank password
            sharing, no ads, and no spreadsheets that break.
          </p>
          <div className="pricing-bottom-actions">
            <a className="button primary" href={appUrl("/signup")} {...NEW_TAB}>
              Create your free workspace <ArrowRight size={16} aria-hidden="true" />
            </a>
            <a className="button secondary" href="/install">
              Download Android APK
            </a>
          </div>
        </section>
      </main>

      <LegalFooter />
    </div>
  );
}
