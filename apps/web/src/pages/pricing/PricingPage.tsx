import { ArrowRight, Check, Minus, ShieldCheck, Sparkles } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";

import { BrandMark } from "../../components/brand/BrandMark";
import { LegalFooter } from "../../components/legal/LegalFooter";
import { Breadcrumbs } from "../../components/navigation/Breadcrumbs";
import { ThemeToggle } from "../../components/theme/ThemeToggle";
import "./PricingPage.css";

const COMPARISON_ROWS = [
  {
    category: "Privacy & Data Ownership",
    features: [
      { name: "Zero bank credentials required", free: "Yes (100% private)", pro: "Yes (100% private)" },
      { name: "Data storage", free: "Private cloud workspace", pro: "Private cloud workspace" },
      { name: "No advertising or data monetization", free: "Guaranteed", pro: "Guaranteed" },
      { name: "Filtered CSV transaction export", free: "Not included", pro: "Full access" },
    ],
  },
  {
    category: "Transactions & Fast Entry",
    features: [
      { name: "Speech-to-transaction voice entry", free: "Unlimited", pro: "Unlimited" },
      { name: "Camera receipt photo scanning", free: "Unlimited", pro: "Unlimited" },
      { name: "Bank statement imports (PDF, CSV, XLS, XLSX)", free: "1 committed / month", pro: "10 committed / month" },
      { name: "Transaction deduplication warnings", free: "Included", pro: "Included" },
      { name: "Exact centavo integer math (no rounding drift)", free: "Included", pro: "Included" },
    ],
  },
  {
    category: "Accounts & Budgets",
    features: [
      { name: "Starter accounts (Cash, GCash, Maya, Bank)", free: "Included", pro: "Included" },
      { name: "Custom accounts creation & renaming", free: "Default accounts", pro: "Unlimited custom" },
      { name: "Custom budget categories", free: "4 custom + starters", pro: "Unlimited active" },
      { name: "High-yield savings interest compounding", free: "Manual entry", pro: "Automatic (daily/mo/yr)" },
      { name: "Interactive Renewal Calendar (Subscriptions)", free: "Basic list", pro: "Interactive monthly grid" },
    ],
  },
  {
    category: "AI Financial Assistant",
    features: [
      { name: "Natural language workspace query assistant", free: "10 queries / 14 days", pro: "100 queries / 14 days" },
      { name: "Assistant permissions model", free: "Read-only & consented", pro: "Read-only & consented" },
      { name: "Transparent reasoning & grounded citations", free: "Included", pro: "Included" },
    ],
  },
  {
    category: "Platforms & Support",
    features: [
      { name: "Progressive Web App (PWA) with offline caching", free: "Included", pro: "Included" },
      { name: "Official Android Beta Native APK", free: "Free download", pro: "Free download" },
      { name: "Customer support", free: "Community & documentation", pro: "Direct priority support (< 24h response)" },
    ],
  },
];

const PRICING_FAQS = [
  {
    question: "Can I use Zoption for free permanently?",
    answer:
      "Yes. The Free plan has no trial expiration and does not ask for credit card information. You can use core tracking, voice logging, receipt scanning, and budget features for as long as you want.",
  },
  {
    question: "Why does Zoption avoid direct bank credential connections?",
    answer:
      "Connecting bank accounts often requires sharing online banking credentials with third-party aggregators and dealing with broken sync connections. Zoption lets you import standard bank statements (PDF, CSV, Excel) or record entries by voice in seconds—keeping your financial passwords 100% private.",
  },
  {
    question: "What currencies and billing methods are supported?",
    answer:
      "Subscriptions are billed in Philippine pesos (PHP). PayPal securely processes card payments and subscription approvals without Zoption ever touching your card data.",
  },
  {
    question: "Can I cancel my Pro subscription at any time?",
    answer:
      "Yes. You can cancel your subscription renewal directly in your Account Settings under Plan & Billing at any time. You retain Pro access until the end of your prepaid period.",
  },
  {
    question: "How does the annual plan discount work?",
    answer:
      "The Annual Pro plan is ₱1,299 per year, which saves you approximately 27% compared to paying ₱149 monthly across 12 months.",
  },
  {
    question: "What is your customer support response time?",
    answer:
      "For general inquiries and bug reports, our team reviews and responds within 24 to 48 business hours. Pro subscribers receive priority support with responses typically under 24 hours. The built-in AI Support Assistant is available 24/7 for instant answers.",
  },
];

export function PricingPage() {
  const [interval, setInterval] = useState<"month" | "year">("month");

  return (
    <div className="pricing-page">
      <header className="pricing-header-nav">
        <Link className="brand" to="/" aria-label="Zoption home">
          <BrandMark />
          <span>Zoption</span>
        </Link>
        <nav className="pricing-header-links" aria-label="Main navigation">
          <Link to="/">Overview</Link>
          <Link to="/pricing" className="active">
            Pricing
          </Link>
          <Link to="/changelog">Changelog</Link>
          <Link to="/install">Android APK</Link>
          <Link to="/faq">FAQ</Link>
        </nav>
        <div className="pricing-header-actions">
          <ThemeToggle />
          <Link className="pricing-sign-in" to="/login">
            Sign in
          </Link>
          <Link className="button primary" to="/signup">
            Start free
          </Link>
        </div>
      </header>

      <main className="pricing-main">
        <Breadcrumbs
          items={[
            { label: "Home", to: "/" },
            { label: "Pricing & Plans" },
          ]}
        />
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

          <div
            className="pricing-interval-toggle"
            role="radiogroup"
            aria-label="Billing frequency"
          >
            <button
              type="button"
              role="radio"
              aria-checked={interval === "month"}
              className={interval === "month" ? "active" : ""}
              onClick={() => setInterval("month")}
            >
              Monthly billing
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={interval === "year"}
              className={interval === "year" ? "active" : ""}
              onClick={() => setInterval("year")}
            >
              Annual billing
              <span className="pricing-discount-badge">Save 27%</span>
            </button>
          </div>
        </section>

        <section className="pricing-cards-grid" aria-label="Plan options">
          {/* Free Plan */}
          <article className="pricing-card">
            <div className="pricing-card-header">
              <h2>Free Plan</h2>
              <p className="pricing-card-description">
                Everything you need to track money privately with voice entry, receipt scanning, and
                statement imports.
              </p>
              <div className="pricing-card-price">
                <strong>₱0</strong>
                <span>/ forever</span>
              </div>
              <div className="pricing-card-subtext">No credit card or payment info required</div>
            </div>

            <div className="pricing-card-cta">
              <Link className="button secondary" to="/signup">
                Create free workspace <ArrowRight size={16} aria-hidden="true" />
              </Link>
            </div>

            <ul className="pricing-card-features" aria-label="Free plan inclusions">
              <li className="pricing-card-feature-item">
                <Check size={18} className="pricing-check-icon" aria-hidden="true" />
                <span>Unlimited manual, voice, and receipt scan entries</span>
              </li>
              <li className="pricing-card-feature-item">
                <Check size={18} className="pricing-check-icon" aria-hidden="true" />
                <span>Universal bank statement importer (1 import/mo)</span>
              </li>
              <li className="pricing-card-feature-item">
                <Check size={18} className="pricing-check-icon" aria-hidden="true" />
                <span>Budget envelopes &amp; spending breakdown</span>
              </li>
              <li className="pricing-card-feature-item">
                <Check size={18} className="pricing-check-icon" aria-hidden="true" />
                <span>10 AI Assistant queries per 14-day cycle</span>
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

          {/* Pro Plan */}
          <article className="pricing-card featured">
            <span className="pricing-card-badge">Power Tracker</span>
            <div className="pricing-card-header">
              <h2>Zoption Pro</h2>
              <p className="pricing-card-description">
                For users who want multi-account automation, automatic interest compounding, and
                higher import limits.
              </p>
              <div className="pricing-card-price">
                <strong>{interval === "month" ? "₱149" : "₱1,299"}</strong>
                <span>{interval === "month" ? "/ month" : "/ year"}</span>
              </div>
              <div className="pricing-card-subtext">
                {interval === "year"
                  ? "Billed annually (equals ~₱108/month, saving 27%)"
                  : "Billed monthly, cancel renewal anytime"}
              </div>
            </div>

            <div className="pricing-card-cta">
              <Link className="button primary" to="/signup">
                Start with Pro <ArrowRight size={16} aria-hidden="true" />
              </Link>
            </div>

            <ul className="pricing-card-features" aria-label="Pro plan inclusions">
              <li className="pricing-card-feature-item">
                <Sparkles size={18} className="pricing-check-icon" aria-hidden="true" />
                <span>
                  <strong>Everything in Free</strong>, plus:
                </span>
              </li>
              <li className="pricing-card-feature-item">
                <Check size={18} className="pricing-check-icon" aria-hidden="true" />
                <span>10 committed statement imports per month</span>
              </li>
              <li className="pricing-card-feature-item">
                <Check size={18} className="pricing-check-icon" aria-hidden="true" />
                <span>100 AI Assistant questions per 14-day cycle</span>
              </li>
              <li className="pricing-card-feature-item">
                <Check size={18} className="pricing-check-icon" aria-hidden="true" />
                <span>Automatic high-yield savings interest compounding</span>
              </li>
              <li className="pricing-card-feature-item">
                <Check size={18} className="pricing-check-icon" aria-hidden="true" />
                <span>Interactive Visual Renewal Calendar for subscriptions</span>
              </li>
              <li className="pricing-card-feature-item">
                <Check size={18} className="pricing-check-icon" aria-hidden="true" />
                <span>Unlimited custom categories &amp; custom accounts</span>
              </li>
              <li className="pricing-card-feature-item">
                <Check size={18} className="pricing-check-icon" aria-hidden="true" />
                <span>Filtered CSV transaction data export</span>
              </li>
            </ul>
          </article>
        </section>

        {/* Feature Comparison Table */}
        <section className="pricing-comparison-section" aria-labelledby="comparison-heading">
          <h2 id="comparison-heading">Detailed Plan Comparison</h2>
          <p className="pricing-comparison-lead">
            Compare all features across Free and Pro tiers to pick what matches your tracking style.
          </p>

          <div className="pricing-table-container">
            <table className="pricing-comparison-table">
              <thead>
                <tr>
                  <th scope="col">Feature</th>
                  <th scope="col">Free</th>
                  <th scope="col">Pro</th>
                </tr>
              </thead>
              <tbody>
                {COMPARISON_ROWS.flatMap((group) => {
                  const headerRow = (
                    <tr key={group.category} className="category-header">
                      <td colSpan={3}>{group.category}</td>
                    </tr>
                  );
                  const featureRows = group.features.map((feat) => (
                    <tr key={feat.name}>
                      <th scope="row">{feat.name}</th>
                      <td>{feat.free === "Not included" ? <Minus size={16} aria-label="Not included" /> : feat.free}</td>
                      <td><strong>{feat.pro}</strong></td>
                    </tr>
                  ));
                  return [headerRow, ...featureRows];
                })}
              </tbody>
            </table>
          </div>
        </section>

        {/* Pricing FAQs */}
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

        {/* Bottom Call to Action */}
        <section className="pricing-bottom-cta">
          <h2>Ready to bring clarity to your money?</h2>
          <p>
            Join thousands of users organizing their personal finances privately. No bank password
            sharing, no ads, and no spreadsheets that break.
          </p>
          <div className="pricing-bottom-actions">
            <Link className="button primary" to="/signup">
              Create your free workspace <ArrowRight size={16} aria-hidden="true" />
            </Link>
            <Link className="button secondary" to="/install">
              Download Android APK
            </Link>
          </div>
        </section>
      </main>

      <LegalFooter />
    </div>
  );
}
