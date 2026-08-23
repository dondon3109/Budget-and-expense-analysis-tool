import type { PublicCustomerReview } from "@zoption/shared";
import {
  ArrowRight,
  Calculator,
  Check,
  FileSpreadsheet,
  Lock,
  PiggyBank,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Star,
  TrendingUp,
  X,
  Zap,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import "./LandingPage.css";

import { BrandMark } from "../components/brand/BrandMark";
import { LegalFooter } from "../components/legal/LegalFooter";
import { SupportChat } from "../components/support/SupportChat";
import { ThemeToggle } from "../components/theme/ThemeToggle";
import { getPublicCustomerReviews } from "../lib/api";
import { useAndroidRelease } from "../releases/useAndroidRelease";

const previewBars = [42, 55, 38, 66, 50, 61];
const previewMonths = ["Feb", "Mar", "Apr", "May", "Jun", "Jul"];
const previewAmounts = ["₱18,200", "₱22,500", "₱19,100", "₱26,400", "₱21,800", "₱21,400"];

export function LandingPage() {
  const [searchParams] = useSearchParams();
  const accountDeleted = searchParams.get("accountDeleted");
  const [reviews, setReviews] = useState<PublicCustomerReview[]>([]);
  const [reviewsLoaded, setReviewsLoaded] = useState(false);
  const androidSource = useAndroidRelease();
  const androidRelease = androidSource.release;

  const [activeBarIndex, setActiveBarIndex] = useState<number | null>(5);
  const [activeSavingsCadence, setActiveSavingsCadence] = useState<"monthly" | "daily" | "yearly">("monthly");
  const [activeBudgetId, setActiveBudgetId] = useState<string>("groceries");

  // Interactive Marketing & Budget Planner State
  const [monthlyBudget, setMonthlyBudget] = useState<number>(50000);
  const [activeBudgetCategories, setActiveBudgetCategories] = useState<number>(5);

  const annualProtectedSurplus = Math.round(monthlyBudget * 0.1) * 12;
  const annualOverrunAvoidance = activeBudgetCategories * 350 * 12;
  const annualTotalBudgetImpact = annualProtectedSurplus + annualOverrunAvoidance;

  useEffect(() => {
    const controller = new AbortController();
    getPublicCustomerReviews(controller.signal)
      .then(setReviews)
      .catch(() => undefined)
      .finally(() => setReviewsLoaded(true));
    return () => controller.abort();
  }, []);

  return (
    <div className="landing-page">
      {/*
        THESIS: Zoption rejects invasive fintech spyware, bank credential harvesting, and loud gamified spending trackers; it delivers an artisanal, calm, integer-precise financial workspace that empowers users through private file imports, transparent math, and grounded read-only intelligence.
        OWN-WORLD: Deep forest and emerald accents, warm tactile paper and sand canvases, high-contrast editorial serifs (Newsreader), crisp tabular geometric interfaces (Manrope + IBM Plex Mono), fine hairline borders, luminous glass highlights, and responsive micro-interactions.
        STORY: First-time visitors immediately realize Zoption is private, requires no bank password, handles Excel/CSV/Bank files with zero friction, and gives total clarity over monthly cash flow, budgets, recurring bills, and savings interest without invasive tracking.
        FIRST VIEWPORT: Crisp navigation with glass blur and theme switch; bold editorial value proposition with live privacy trust badge and dual primary/secondary action triggers; floating interactive monthly dashboard mockup with live metric gauges, interactive 6-month chart bars with hover value inspector, and trust cards.
        FORM: Persuade landing page crafted with museum-grade typography, dynamic interactive modules, rich tactile visual depth, accessible semantic hierarchy, and seamless responsive design across light, dark, and coffee themes.
      */}

      <header className="landing-nav" id="top">
        <a className="brand" href="#top" aria-label="Zoption home">
          <BrandMark />
          <span className="brand-wordmark">Zoption</span>
        </a>
        <nav className="landing-links" aria-label="Learn more">
          <a href="#modules">Features</a>
          <a href="#calculator">Budget planner</a>
          <a href="#compare">Why Zoption</a>
          <a href="#approach">How it works</a>
          <a href="#reviews">Reviews</a>
          <a href="#banks">Supported imports</a>
          <a href="#install">Android APK</a>
          <a href="#faq">FAQ</a>
        </nav>
        <div className="landing-account-actions">
          <ThemeToggle />
          <Link className="landing-sign-in" to="/login">
            Sign in
          </Link>
          <Link className="button primary" to="/signup">
            Start free
          </Link>
        </div>
      </header>

      <main>
        {accountDeleted && (
          <div className="account-deletion-notice" role="status">
            <strong>Account deletion requested.</strong>
            <span>
              Your Zoption workspace is no longer available.{" "}
              {accountDeleted === "cleanup_pending"
                ? "Remaining account cleanup will continue securely."
                : "Your account has been deleted."}
            </span>
          </div>
        )}

        <section className="hero">
          <div className="hero-copy">
            <p className="hero-eyebrow">
              <ShieldCheck size={15} aria-hidden="true" /> Free plan available &middot; private by
              design
            </p>
            <h1>
              Zoption makes your money clear. Decide <em>what comes next.</em>
            </h1>
            <p className="hero-lead">
              Start for free with a private budget and expense tracker for importing or recording
              transactions, setting practical budgets, tracking recurring expenses, and
              understanding monthly cash flow — without connecting to your bank.
            </p>
            <div className="hero-actions">
              <Link className="button primary" to="/signup">
                Start for free <ArrowRight size={18} aria-hidden="true" />
              </Link>
              <a className="button secondary" href="#modules">
                Explore the modules
              </a>
            </div>
            <p className="hero-cta-note">
              <Check size={15} aria-hidden="true" /> No payment required. Upgrade only if you want
              higher limits and Pro features.
            </p>
            <ul className="hero-proof" aria-label="Zoption at a glance">
              <li>
                <strong>Free plan</strong>
                <span>track without paying</span>
              </li>
              <li>
                <strong>No bank connection</strong>
                <span>you choose what to add</span>
              </li>
              <li>
                <strong>Upgrade when ready</strong>
                <span>for higher limits &amp; Pro features</span>
              </li>
            </ul>
          </div>

          <div
            className="hero-visual"
            role="img"
            aria-label="Illustrative preview of the Zoption monthly dashboard"
          >
            <div className="preview-top">
              <div>
                <BrandMark className="preview-logo" />
                <b>Monthly overview</b>
              </div>
              <span className="status-dot">Illustration</span>
            </div>
            <div className="preview-metrics">
              <div className="preview-metric preview-metric-income">
                <span>Money in</span>
                <strong>₱48,000</strong>
                <small>Income this month</small>
              </div>
              <div className="preview-metric preview-metric-expense">
                <span>Money out</span>
                <strong>₱21,400</strong>
                <small>45% of income</small>
              </div>
            </div>
            <div className="preview-chart">
              <div className="preview-chart-head">
                <span>Spending rhythm</span>
                <small>
                  {activeBarIndex !== null
                    ? `${previewMonths[activeBarIndex]}: ${previewAmounts[activeBarIndex]}`
                    : "Six-month view"}
                </small>
              </div>
              <div className="chart-bars" aria-hidden="true">
                {previewBars.map((height, index) => (
                  <span
                    key={index}
                    style={{ height: `${height}%` }}
                    className={activeBarIndex === index ? "active" : ""}
                    onMouseEnter={() => setActiveBarIndex(index)}
                    onClick={() => setActiveBarIndex(index)}
                    title={`${previewMonths[index]}: ${previewAmounts[index]}`}
                  />
                ))}
              </div>
            </div>
            <p className="preview-disclaimer">
              Illustrative values only. Your workspace begins without transactions or budgets.
            </p>
          </div>
        </section>

        {/* ============================================================
           Marketing Trust Pillars Strip
           ============================================================ */}
        <section className="trust-pillars-strip" aria-label="Trust and privacy pillars">
          <div className="pillar-item">
            <div className="pillar-icon">
              <ShieldCheck size={20} />
            </div>
            <div>
              <strong>Zero Bank Logins</strong>
              <p>Never share banking passwords or credentials</p>
            </div>
          </div>
          <div className="pillar-item">
            <div className="pillar-icon">
              <Zap size={20} />
            </div>
            <div>
              <strong>Exact Centavo Math</strong>
              <p>Integer precision with 0 floating-point drift</p>
            </div>
          </div>
          <div className="pillar-item">
            <div className="pillar-icon">
              <FileSpreadsheet size={20} />
            </div>
            <div>
              <strong>Universal File Importer</strong>
              <p>Instant CSV, XLSX &amp; XLS mapper with deduplication</p>
            </div>
          </div>
          <div className="pillar-item">
            <div className="pillar-icon">
              <Lock size={20} />
            </div>
            <div>
              <strong>100% User-Owned Data</strong>
              <p>No ad profiling, telemetry, or data monetization</p>
            </div>
          </div>
        </section>

        <section className="facet-modules" id="modules" aria-labelledby="modules-title">
          <div className="section-head">
            <p className="eyebrow">Six modules, one calm view</p>
            <h2 id="modules-title">Everything that shapes your month, in one quiet place.</h2>
            <p className="section-lead">
              Zoption works the way you actually track money — reviewing files, following budgets,
              and noticing the recurring costs that quietly add up.
            </p>
          </div>

          <div className="facets">
            <article className="facet import-support">
              <div className="facet-text">
                <p className="facet-kicker">Filing</p>
                <h3>Import from the files you already use.</h3>
                <h4>Start with Excel</h4>
                <h4>Bring your bank export</h4>
                <p>
                  Whether it&rsquo;s a bank export or a spreadsheet, choosing a CSV, XLSX, or XLS
                  workbook opens a preview where you map columns, catch errors, and flag duplicates
                  — before any row is saved.
                </p>
                <div className="facet-tags">
                  <span>CSV &middot; XLSX &middot; XLS</span>
                  <span>Preview-first review</span>
                  <span>Duplicate prevention</span>
                </div>
              </div>
              <div className="facet-visual" aria-hidden="true">
                <div className="mini-chip-row">
                  <span>Monthly-spend.xlsx</span>
                  <span className="chip in-soft">
                    <Check size={13} /> Ready to review
                  </span>
                </div>
                <div className="sheet">
                  <div className="sheet-row heading">
                    <span>Date</span>
                    <span>Description</span>
                    <span>Category</span>
                    <span>Amount</span>
                  </div>
                  <div className="sheet-row">
                    <span>Jul 02</span>
                    <span>Neighborhood market</span>
                    <span>Groceries</span>
                    <span>₱1,240</span>
                  </div>
                  <div className="sheet-row">
                    <span>Jul 05</span>
                    <span>Monthly salary</span>
                    <span>Income</span>
                    <span>₱48,000</span>
                  </div>
                  <div className="sheet-row">
                    <span>Jul 08</span>
                    <span>Electric bill</span>
                    <span>Utilities</span>
                    <span>₱2,180</span>
                  </div>
                  <div className="sheet-row muted-row">
                    <span>Jul 11</span>
                    <span>Bank transfer</span>
                    <span>Review</span>
                    <span>₱3,500</span>
                  </div>
                </div>
                <p className="facet-note">Every row stays reviewable</p>
              </div>
            </article>

            <article className="facet">
              <div className="facet-text">
                <p className="facet-kicker">Budgeting</p>
                <h3>Set budgets that follow you.</h3>
                <p>
                  Give each category a practical monthly target and watch progress in plain
                  language. Recurring expenses roll into the same clear picture, so nothing sneaks
                  up at the end of the month.
                </p>
                <div className="facet-tags">
                  <span>Per-category targets</span>
                  <span>Progress in plain words</span>
                  <span>Six-month trends</span>
                </div>
              </div>
              <div className="facet-visual" aria-hidden="true">
                <div className="balance-row">
                  <span>July budget</span>
                  <span>₱4,800 of ₱6,500</span>
                </div>
                <div
                  className={`progress row ${activeBudgetId === "groceries" ? "active-budget" : ""}`}
                  onClick={() => setActiveBudgetId("groceries")}
                  role="button"
                  tabIndex={0}
                >
                  <span>Groceries</span>
                  <b>
                    ₱4,800 <small>/ ₱6,500</small>
                  </b>
                  <i>
                    <em style={{ width: "74%" }} />
                  </i>
                </div>
                <div
                  className={`progress row ${activeBudgetId === "utilities" ? "active-budget" : ""}`}
                  onClick={() => setActiveBudgetId("utilities")}
                  role="button"
                  tabIndex={0}
                >
                  <span>Utilities</span>
                  <b>
                    ₱2,100 <small>/ ₱3,000</small>
                  </b>
                  <i>
                    <em style={{ width: "70%" }} />
                  </i>
                </div>
                <div
                  className={`progress row ${activeBudgetId === "transport" ? "active-budget" : ""}`}
                  onClick={() => setActiveBudgetId("transport")}
                  role="button"
                  tabIndex={0}
                >
                  <span>Transport</span>
                  <b>
                    ₱900 <small>/ ₱1,200</small>
                  </b>
                  <i>
                    <em style={{ width: "75%" }} />
                  </i>
                </div>
              </div>
            </article>

            <article className="facet">
              <div className="facet-text">
                <p className="facet-kicker">Subscription tracking</p>
                <h3>Name the bills that quietly repeat.</h3>
                <p>
                  Log a subscription and Zoption records its next charge as an expense, so your
                  balance already reflects what&rsquo;s coming. Edit, cancel, or delete it and the
                  charge stays in sync.
                </p>
                <div className="facet-tags">
                  <span>Next-charge forecasting</span>
                  <span>Edit &amp; cancel in sync</span>
                  <span>Annual plans</span>
                </div>
              </div>
              <div className="facet-visual" aria-hidden="true">
                <div className="bill-row">
                  <span>Spotify</span>
                  <small>Renews ₱139 &middot; Jul 17</small>
                </div>
                <div className="bill-row">
                  <span>Canva Pro</span>
                  <small>Renews ₱249 &middot; Aug 01</small>
                </div>
                <div className="bill-row">
                  <span>iCloud+</span>
                  <small>Renews ₱49 &middot; Jul 24</small>
                </div>
                <div className="bill-row">
                  <span>Netflix</span>
                  <small>Renews ₱549 &middot; Aug 09</small>
                </div>
                <div className="balance-row">
                  <span>Upcoming charges</span>
                  <span className="chip warn">₱986 this month</span>
                </div>
              </div>
            </article>

            <article className="facet">
              <div className="facet-text">
                <p className="facet-kicker">Transferring</p>
                <h3>Move money without surprises.</h3>
                <p>
                  Transfer between your own accounts and see the exact amount that arrives after any
                  fee is deducted — then add the transfer to the ledger. No guessing what a move
                  really costs.
                </p>
                <div className="facet-tags">
                  <span>Fee-aware transfers</span>
                  <span>Across your accounts</span>
                  <span>Dollar &amp; peso</span>
                </div>
              </div>
              <div className="facet-visual" aria-hidden="true">
                <div className="balance-row">
                  <span>Transfer</span>
                  <span className="chip in-soft">₱3,500</span>
                </div>
                <div className="bill-row">
                  <span>From &middot; Checking</span>
                  <small>₱48,000 available</small>
                </div>
                <div className="bill-row">
                  <span>To &middot; Savings</span>
                  <small>0.6% interest on</small>
                </div>
                <div className="balance-row transfer-result">
                  <span>After ₱15 transfer fee</span>
                  <b>+₱3,485</b>
                </div>
              </div>
            </article>

            <article className="facet">
              <div className="facet-text">
                <p className="facet-kicker">Savings</p>
                <h3>Put your savings to work while you sleep.</h3>
                <p>
                  Turn a savings account on and set the annual rate and pay day you want. Zoption
                  accrues interest daily, monthly, or yearly and adds the earned amount to your
                  balance — automatically.
                </p>
                <div className="facet-tags">
                  <span>Daily &middot; monthly &middot; yearly</span>
                  <span>Your rate, your pay day</span>
                  <span>Interest on</span>
                </div>
              </div>
              <div className="facet-visual" aria-hidden="true">
                <div className="balance-row">
                  <span>Savings</span>
                  <b>₱28,500</b>
                </div>
                <div className="balance-row interest-row">
                  <span>
                    <PiggyBank size={14} aria-hidden="true" /> 0.6% p.a. &middot;{" "}
                    {activeSavingsCadence === "monthly"
                      ? "monthly pay day"
                      : activeSavingsCadence === "daily"
                        ? "daily accrual"
                        : "yearly pay day"}
                  </span>
                  <span
                    className="switch"
                    role="presentation"
                    onClick={() =>
                      setActiveSavingsCadence((prev) =>
                        prev === "monthly" ? "daily" : prev === "daily" ? "yearly" : "monthly",
                      )
                    }
                  />
                </div>
                <div className="interest-gauge">
                  <i>
                    <em
                      style={{
                        width:
                          activeSavingsCadence === "daily"
                            ? "95%"
                            : activeSavingsCadence === "monthly"
                              ? "72%"
                              : "45%",
                      }}
                    />
                  </i>
                </div>
                <div className="balance-row">
                  <span>Interest earned last month</span>
                  <span className="chip in-soft">
                    <TrendingUp size={13} /> +₱214
                  </span>
                </div>
              </div>
            </article>

            <article className="facet">
              <div className="facet-text">
                <p className="facet-kicker">Assist &mdash; always grounded</p>
                <h3>Ask your numbers, not a chatbot.</h3>
                <p>
                  The AI Financial Assistant answers questions about <em>your</em> data with
                  evidence and clear limits. It reads only what you ask about, never edits a number,
                  and explains the reasoning behind each answer.
                </p>
                <div className="facet-tags">
                  <span>Your data only</span>
                  <span>Grounded answers</span>
                  <span>Never edits</span>
                  <span>You consent first</span>
                </div>
              </div>
              <div className="facet-visual" aria-hidden="true">
                <div className="chat">
                  <div className="bubble user">What happens to my spending after the 15th?</div>
                  <div className="bubble bot">
                    After July 15 you spent <b>₱9,240</b> across <b>34</b> transactions. Groceries
                    led at <b>₱3,180</b>, up <b>11%</b> vs. the same window in June.
                  </div>
                  <div className="bubble user">Which are recurring?</div>
                  <div className="bubble bot">
                    <b>4</b> of your charges repeat monthly, totalling <b>₱986</b>. The largest is
                    Netflix at <b>₱549</b>.
                  </div>
                </div>
                <div className="chat-input">
                  <Sparkles size={15} aria-hidden="true" /> Ask about your money&hellip;
                </div>
              </div>
            </article>
          </div>
        </section>

        {/* ============================================================
           Interactive Budget Planner & Safeguard Calculator
           ============================================================ */}
        <section className="calculator-section" id="calculator" aria-labelledby="calculator-title">
          <div className="calculator-card">
            <div className="calculator-content">
              <p className="eyebrow">
                <Calculator size={14} aria-hidden="true" /> Interactive Budget Planner
              </p>
              <h2 id="calculator-title">See how budget targets protect your money.</h2>
              <p className="calculator-lead">
                Setting practical category limits stops unmonitored spending drift and gives every
                peso a clear job before the month starts. See what structured budget envelopes save
                you each year.
              </p>

              <div className="calculator-controls">
                <div className="calculator-field">
                  <div className="calculator-label-row">
                    <span>Planned monthly budget</span>
                    <strong>₱{monthlyBudget.toLocaleString()}</strong>
                  </div>
                  <input
                    type="range"
                    min={15000}
                    max={150000}
                    step={5000}
                    value={monthlyBudget}
                    onChange={(e) => setMonthlyBudget(Number(e.target.value))}
                    aria-label="Planned monthly budget slider"
                    className="calculator-slider"
                  />
                  <div className="slider-ticks">
                    <span>₱15k</span>
                    <span>₱75k</span>
                    <span>₱150k</span>
                  </div>
                </div>

                <div className="calculator-field">
                  <div className="calculator-label-row">
                    <span>Active budget categories</span>
                    <strong>{activeBudgetCategories} category envelopes</strong>
                  </div>
                  <div className="calculator-subs-selector">
                    {[3, 5, 7, 9, 12].map((count) => (
                      <button
                        type="button"
                        key={count}
                        className={activeBudgetCategories === count ? "selected" : ""}
                        onClick={() => setActiveBudgetCategories(count)}
                      >
                        {count} {count === 12 ? "+" : ""}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div className="calculator-result-box">
              <span className="result-badge">Projected 1-Year Budget Safeguard</span>
              <div className="result-metric">
                <small>Estimated annual budget savings</small>
                <strong>₱{annualTotalBudgetImpact.toLocaleString()}</strong>
              </div>
              <div className="result-breakdown">
                <div className="breakdown-row">
                  <span>Protected monthly margin (~10%)</span>
                  <b>₱{annualProtectedSurplus.toLocaleString()}/yr</b>
                </div>
                <div className="breakdown-row">
                  <span>Category overrun prevention</span>
                  <b>₱{annualOverrunAvoidance.toLocaleString()}/yr</b>
                </div>
              </div>
              <Link className="button primary full-width" to="/signup">
                Build your first budget — Start free <ArrowRight size={16} aria-hidden="true" />
              </Link>
              <small className="calculator-disclaimer">
                Based on an average 10% budget margin achieved through active category envelope targets
                and duplicate expense prevention.
              </small>
            </div>
          </div>
        </section>

        {/* ============================================================
           Comparison Matrix (SEO & Marketing Wedge)
           ============================================================ */}
        <section className="comparison-section" id="compare" aria-labelledby="compare-title">
          <div className="section-head">
            <p className="eyebrow">The Zoption Advantage</p>
            <h2 id="compare-title">Why private budgeting beats bank-linked apps.</h2>
            <p className="section-lead">
              Fintech apps demand your bank password, harvest your financial habits for credit card
              ads, and round decimals. Zoption gives you total control, zero credential risk, and
              exact centavo accuracy.
            </p>
          </div>

          <div className="comparison-table-wrap">
            <table className="comparison-table">
              <colgroup>
                <col style={{ width: "36%" }} />
                <col style={{ width: "32%" }} />
                <col style={{ width: "32%" }} />
              </colgroup>
              <thead>
                <tr>
                  <th>Capability &amp; Security Standard</th>
                  <th>Typical Finance Apps</th>
                  <th className="zoption-col">Zoption Private Workspace</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>
                    <strong>Bank login credentials</strong>
                    <small>Access required to track your balance</small>
                  </td>
                  <td>
                    <span className="comparison-cell-value risk">
                      <X size={15} aria-hidden="true" />
                      <span>Mandatory bank passwords &amp; screen scraping</span>
                    </span>
                  </td>
                  <td className="zoption-col">
                    <span className="comparison-cell-value advantage">
                      <Check size={15} aria-hidden="true" />
                      <span>Never requested &middot; 100% private file import</span>
                    </span>
                  </td>
                </tr>
                <tr>
                  <td>
                    <strong>Data privacy &amp; profiling</strong>
                    <small>How your transactions are handled</small>
                  </td>
                  <td>
                    <span className="comparison-cell-value risk">
                      <X size={15} aria-hidden="true" />
                      <span>Aggregated for ad targeting &amp; lending offers</span>
                    </span>
                  </td>
                  <td className="zoption-col">
                    <span className="comparison-cell-value advantage">
                      <Check size={15} aria-hidden="true" />
                      <span>Zero ad tracking &middot; only records you choose</span>
                    </span>
                  </td>
                </tr>
                <tr>
                  <td>
                    <strong>Calculation precision</strong>
                    <small>How balances and totals are computed</small>
                  </td>
                  <td>
                    <span className="comparison-cell-value risk">
                      <X size={15} aria-hidden="true" />
                      <span>Floating-point drift &amp; rounded decimals</span>
                    </span>
                  </td>
                  <td className="zoption-col">
                    <span className="comparison-cell-value advantage">
                      <Check size={15} aria-hidden="true" />
                      <span>Exact integer centavo accuracy</span>
                    </span>
                  </td>
                </tr>
                <tr>
                  <td>
                    <strong>Spreadsheet file support</strong>
                    <small>CSV, Excel, and bank statement uploads</small>
                  </td>
                  <td>
                    <span className="comparison-cell-value risk">
                      <X size={15} aria-hidden="true" />
                      <span>Rigid, error-prone or locked behind paywalls</span>
                    </span>
                  </td>
                  <td className="zoption-col">
                    <span className="comparison-cell-value advantage">
                      <Check size={15} aria-hidden="true" />
                      <span>Universal CSV, XLSX &amp; XLS with deduplication</span>
                    </span>
                  </td>
                </tr>
                <tr>
                  <td>
                    <strong>AI financial insights</strong>
                    <small>Intelligence and conversational tools</small>
                  </td>
                  <td>
                    <span className="comparison-cell-value risk">
                      <X size={15} aria-hidden="true" />
                      <span>Unverified chatbots with write access</span>
                    </span>
                  </td>
                  <td className="zoption-col">
                    <span className="comparison-cell-value advantage">
                      <Check size={15} aria-hidden="true" />
                      <span>Read-only, grounded with evidence &amp; consent</span>
                    </span>
                  </td>
                </tr>
                <tr>
                  <td>
                    <strong>Native mobile experience</strong>
                    <small>Android and on-the-go tracking</small>
                  </td>
                  <td>
                    <span className="comparison-cell-value risk">
                      <X size={15} aria-hidden="true" />
                      <span>Cloud-locked web wrappers</span>
                    </span>
                  </td>
                  <td className="zoption-col">
                    <span className="comparison-cell-value advantage">
                      <Check size={15} aria-hidden="true" />
                      <span>Native Android Beta APK with receipt scanning</span>
                    </span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <section className="install-promo" id="install" aria-labelledby="install-promo-title">
          <div className="install-promo-copy">
            <p className="eyebrow">Official Android beta</p>
            <h2 id="install-promo-title">Take Zoption Beta to Android.</h2>
            <p>
              Download the Zoption Beta APK from zoption.site: the new native app with your
              workspace on the device, offline-first entry, and camera receipt scanning.
            </p>
            <ul className="install-promo-points">
              <li>
                <Check size={16} aria-hidden="true" /> Same account and workspace
              </li>
              <li>
                <Check size={16} aria-hidden="true" /> Receipt scanning with your approval
              </li>
              <li>
                <Check size={16} aria-hidden="true" /> No Google Play listing required
              </li>
            </ul>
          </div>

          <div className="install-promo-release">
            <div className="install-promo-release-heading">
              <BrandMark className="install-promo-mark" />
              <div>
                <p>{androidRelease ? "Beta ready to download" : "Android Beta download"}</p>
                <h3>Zoption Beta</h3>
              </div>
              <span>APK</span>
            </div>
            {androidRelease ? (
              <dl>
                <div>
                  <dt>File size</dt>
                  <dd>{androidRelease.sizeLabel}</dd>
                </div>
                <div>
                  <dt>Requires</dt>
                  <dd>{androidRelease.minimumAndroid}</dd>
                </div>
                <div>
                  <dt>Source</dt>
                  <dd>Official Zoption release</dd>
                </div>
              </dl>
            ) : androidSource.status === "loading" ? (
              <p className="install-promo-unavailable" role="status">
                Loading the latest Beta download…
              </p>
            ) : (
              <p className="install-promo-unavailable" role="alert">
                Android Beta download temporarily unavailable. Check back soon — Zoption remains
                available in your browser.
              </p>
            )}
            <div className="install-promo-actions">
              <Link className="button primary" to="/install">
                Download Android APK <ArrowRight size={17} aria-hidden="true" />
              </Link>
            </div>
            <p className="install-promo-update-note">
              New in Zoption Beta: snap a receipt and Zoption drafts the expense for you. The beta
              replaces the older Zoption app — uninstall it first, then install the beta.
            </p>
            <p className="install-promo-note">
              The APK is not distributed through Google Play. Zoption remains online-first, so
              authenticated financial operations require an internet connection.
            </p>
          </div>
        </section>

        <section className="formats-band" id="banks" aria-labelledby="banks-title">
          <div className="section-head">
            <p className="eyebrow">Start from a file you already have</p>
            <h2 id="banks-title">Bring a bank or spreadsheet export.</h2>
            <p className="section-lead">
              Choose a CSV, XLSX, or XLS file with built-in mapping for these common formats, then
              review every row before anything is saved.
            </p>
          </div>
          <div className="formats-marquee" aria-hidden="true">
            <div className="formats-track" aria-hidden="true">
              {[0, 1].map((g) => (
                <div
                  className="formats-group"
                  data-marquee-copy={g === 1 ? "duplicate" : "primary"}
                  key={g}
                >
                  {["BPI", "BDO", "MariBank", "Bank of America", "JPMorgan / Chase"].map((name) => (
                    <span key={name}>{name}</span>
                  ))}
                </div>
              ))}
            </div>
          </div>
          <ul className="sr-only" aria-label="Supported institutions">
            {["BPI", "BDO", "MariBank", "Bank of America", "JPMorgan / Chase"].map((name) => (
              <li key={name}>{name}</li>
            ))}
          </ul>
          <p className="formats-disclaimer">
            Bank names are shown to indicate supported export formats only. Zoption is not
            affiliated with or endorsed by these institutions.
          </p>
        </section>

        <section className="approach" id="approach" aria-labelledby="approach-title">
          <div className="section-head">
            <p className="eyebrow">Designed for real decisions</p>
            <h2 id="approach-title">Your money, one rhythm at a time.</h2>
            <p className="section-lead">
              Keep a simple manual rhythm: log what moves, let Zoption do the arithmetic, and decide
              from the same picture your budgets are built from.
            </p>
          </div>
          <div className="rhythm">
            <article className="step">
              <span className="step-n">01</span>
              <h3>Log what moves</h3>
              <p>
                Import a file, or add a row yourself. You&rsquo;re in control of what enters your
                workspace — only what you choose is ever saved.
              </p>
            </article>
            <article className="step">
              <span className="step-n">02</span>
              <h3>Review the math</h3>
              <p>
                Zoption keeps amounts in exact centavos and shows every calculation in plain
                language, so the picture matches your own figures.
              </p>
            </article>
            <article className="step">
              <span className="step-n">03</span>
              <h3>Decide what&rsquo;s next</h3>
              <p>
                Budgets, subscriptions, savings interest, and an assistant — all pointing at the
                same monthly view, ready for one next move.
              </p>
            </article>
          </div>
          <div className="final-cta-actions">
            <Link className="button primary" to="/signup">
              Start for free <ArrowRight size={17} aria-hidden="true" />
            </Link>
            <Link className="button secondary" to="/login">
              Sign in
            </Link>
          </div>
          <p className="cta-note">
            No payment required. Your workspace starts empty and private, with no bank credentials
            to hand over.
          </p>
        </section>

        <section className="customer-reviews" id="reviews" aria-labelledby="reviews-title">
          <div className="reviews-intro">
            <p className="eyebrow">From real Zoption customers</p>
            <h2 id="reviews-title">Clearer money, in their own words.</h2>
            <p>
              Reviews come from signed-in customers who explicitly consent to sharing; Zoption
              selects which submissions appear here and does not rewrite their words with AI.
            </p>
          </div>

          {reviews.length > 0 ? (
            <div className="review-wall" aria-live="polite">
              {reviews.map((customerReview) => (
                <article
                  className={
                    customerReview.featuredOrder === 1
                      ? "customer-review featured"
                      : "customer-review"
                  }
                  key={customerReview.id}
                >
                  <div
                    className="review-stars"
                    aria-label={`${customerReview.rating} out of 5 stars`}
                  >
                    {[1, 2, 3, 4, 5].map((star) => (
                      <Star
                        key={star}
                        size={16}
                        fill="currentColor"
                        aria-hidden="true"
                        className={star <= customerReview.rating ? "filled" : ""}
                      />
                    ))}
                  </div>
                  <blockquote>&ldquo;{customerReview.review}&rdquo;</blockquote>
                  <footer>
                    <strong>{customerReview.displayName}</strong>
                    <span>Zoption customer</span>
                  </footer>
                </article>
              ))}
            </div>
          ) : (
            <div className="reviews-empty" aria-live="polite">
              <MessageCircleReviewMark />
              <div>
                <strong>
                  {reviewsLoaded
                    ? "The first customer story starts here."
                    : "Loading customer stories…"}
                </strong>
                <span>
                  {reviewsLoaded
                    ? "Signed-in customers can share a review after they have spent time with Zoption."
                    : "Only reviews customers explicitly publish are shown."}
                </span>
              </div>
            </div>
          )}
        </section>

        <section className="faq" id="faq" aria-labelledby="faq-title">
          <div className="section-head">
            <p className="eyebrow">Common questions</p>
            <h2 id="faq-title">Budget and expense tracking, plainly answered.</h2>
            <p className="section-lead">
              How Zoption handles imports, privacy, and money math — a tracker that doesn&rsquo;t
              connect to your bank.
            </p>
          </div>
          <dl className="faq-list">
            <details className="faq-item">
              <summary>Can I use Zoption for free?</summary>
              <dd>
                Yes. Create an account and use Zoption&rsquo;s Free plan without paying. It includes
                core tracking features with plan limits; upgrade to Pro only if you want higher
                limits and additional features.
              </dd>
            </details>
            <details className="faq-item">
              <summary>Does Zoption connect to my bank?</summary>
              <dd>
                No. Zoption never connects to banks or asks for banking credentials. You import a
                CSV, Excel, or bank export file — or add rows yourself — and review every entry
                before anything is saved.
              </dd>
            </details>
            <details className="faq-item">
              <summary>What file formats can I import?</summary>
              <dd>
                CSV, XLSX, and XLS. Pick a workbook, choose a worksheet, map the columns, and see it
                visualized after you review each row.
              </dd>
            </details>
            <details className="faq-item">
              <summary>Is my workspace private?</summary>
              <dd>
                Your workspace starts empty and contains only the records you choose to add. For
                details about how account, financial, and imported-transaction information is
                handled, see the Privacy Policy.
              </dd>
            </details>
            <details className="faq-item">
              <summary>How are money amounts stored?</summary>
              <dd>
                Amounts are represented safely in integer centavos and totaled in plain language, so
                the calculations stay transparent and easy to follow.
              </dd>
            </details>
            <details className="faq-item">
              <summary>Do I need financial expertise to use Zoption?</summary>
              <dd>
                No. Zoption keeps the language jargon-free and every calculation transparent, so you
                can track expenses and set budgets without a finance background.
              </dd>
            </details>
          </dl>
          <Link className="faq-see-all" to="/faq">
            See all common questions <ArrowRight size={16} aria-hidden="true" />
          </Link>
        </section>
      </main>
      <LegalFooter />
      <SupportChat surface="landing" />
    </div>
  );
}

function MessageCircleReviewMark() {
  return (
    <span className="reviews-empty-mark" aria-hidden="true">
      <Star size={22} fill="currentColor" />
    </span>
  );
}
