import {
  ArrowRight,
  Check,
  Landmark,
  PiggyBank,
  ShieldCheck,
  Sparkles,
  TrendingUp,
} from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
import "./LandingPage.css";

import { LegalFooter } from "../components/legal/LegalFooter";
import { ThemeToggle } from "../components/theme/ThemeToggle";

const previewBars = [42, 55, 38, 66, 50, 61];

export function LandingPage() {
  const [searchParams] = useSearchParams();
  const accountDeleted = searchParams.get("accountDeleted");

  return (
    <div className="landing-page">
      <header className="landing-nav" id="top">
        <a className="brand" href="#top">
          <span className="brand-mark" aria-hidden="true">
            <span className="brand-monogram">Z</span>
          </span>
          <span className="brand-wordmark">Zoption</span>
        </a>
        <nav className="landing-links" aria-label="Learn more">
          <a href="#modules">Features</a>
          <a href="#approach">How it works</a>
          <a href="#banks">Supported imports</a>
          <a href="#faq">FAQ</a>
        </nav>
        <div className="landing-account-actions">
          <ThemeToggle />
          <Link className="landing-sign-in" to="/login">
            Sign in
          </Link>
          <Link className="button primary" to="/signup">
            Create account
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
              <ShieldCheck size={15} aria-hidden="true" /> Private by design &middot; starts empty
            </p>
            <h1>
              See where your money goes, then decide <em>what comes next.</em>
            </h1>
            <p className="hero-lead">
              Import everyday transactions, set practical budgets, and turn scattered spending into a
              clear monthly picture — inside a workspace that only ever contains what you choose to
              add.
            </p>
            <div className="hero-actions">
              <Link className="button primary" to="/signup">
                Create your workspace <ArrowRight size={18} aria-hidden="true" />
              </Link>
              <a className="button secondary" href="#modules">
                Explore the modules
              </a>
            </div>
            <ul className="hero-proof" aria-label="Zoption at a glance">
              <li>
                <strong>Review every row</strong>
                <span>before anything is saved</span>
              </li>
              <li>
                <strong>No bank connection</strong>
                <span>you choose what to add</span>
              </li>
              <li>
                <strong>Track more</strong>
                <span>subscriptions, interest &amp; plans</span>
              </li>
            </ul>
          </div>
          <div
            className="hero-visual"
            role="img"
            aria-label="Illustrative preview of the Zoption monthly overview"
          >
            <div className="preview-top">
              <div>
                <span className="preview-logo">
                  <Landmark size={15} aria-hidden="true" />
                </span>
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
                <small>Six-month view</small>
              </div>
              <div className="chart-bars" aria-hidden="true">
                {previewBars.map((height, index) => (
                  <span key={index} style={{ height: `${height}%` }} />
                ))}
              </div>
            </div>
            <p className="preview-disclaimer">
              Illustrative values only. Your workspace begins without transactions or budgets.
            </p>
          </div>
        </section>

        <section className="facet-modules" id="modules" aria-labelledby="modules-title">
          <div className="section-head">
            <p className="eyebrow">Six modules, one calm view</p>
            <h2 id="modules-title">Everything that shapes your month, in one quiet place.</h2>
            <p className="section-lead">
              Zoption works the way you actually track money — reviewing files, following budgets, and
              noticing the recurring costs that quietly add up.
            </p>
          </div>

          <div className="facets">
            <article className="facet">
              <div className="facet-text">
                <p className="facet-kicker">Filing</p>
                <h3>Import from the files you already keep.</h3>
                <p>
                  Whether it&rsquo;s a bank export or a spreadsheet, choosing a CSV, XLSX, or XLS
                  workbook opens a preview where you map columns, catch errors, and flag duplicates —
                  before any row is saved.
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
                  Give each category a practical monthly target and watch progress in plain language.
                  Recurring expenses roll into the same clear picture, so nothing sneaks up at the end
                  of the month.
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
                <div className="progress row">
                  <span>Groceries</span>
                  <b>
                    ₱4,800 <small>/ ₱6,500</small>
                  </b>
                  <i>
                    <em style={{ width: "74%" }} />
                  </i>
                </div>
                <div className="progress row">
                  <span>Utilities</span>
                  <b>
                    ₱2,100 <small>/ ₱3,000</small>
                  </b>
                  <i>
                    <em style={{ width: "70%" }} />
                  </i>
                </div>
                <div className="progress row">
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
                  Log a subscription and Zoption records its next charge as an expense, so your balance
                  already reflects what&rsquo;s coming. Edit, cancel, or delete it and the charge stays
                  in sync.
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
                  Transfer between your own accounts and see the exact amount that arrives after any fee
                  is deducted — then add the transfer to the ledger. No guessing what a move really
                  costs.
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
                    <PiggyBank size={14} aria-hidden="true" /> 0.6% p.a. &middot; monthly pay day
                  </span>
                  <span className="switch" role="presentation" />
                </div>
                <div className="interest-gauge">
                  <i>
                    <em style={{ width: "72%" }} />
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
                  The AI Financial Assistant answers questions about <em>your</em> data with evidence
                  and clear limits. It reads only what you ask about, never edits a number, and
                  explains the reasoning behind each answer.
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
                <div className="formats-group" data-marquee-copy={g === 1 ? "duplicate" : "primary"} key={g}>
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
            Bank names are shown to indicate supported export formats only. Zoption is not affiliated
            with or endorsed by these institutions.
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
                Zoption keeps amounts in exact centavos and shows every calculation in plain language,
                so the picture matches your own figures.
              </p>
            </article>
            <article className="step">
              <span className="step-n">03</span>
              <h3>Decide what&rsquo;s next</h3>
              <p>
                Budgets, subscriptions, savings interest, and an assistant — all pointing at the same
                monthly view, ready for one next move.
              </p>
            </article>
          </div>
          <div className="final-cta-actions">
            <Link className="button primary" to="/signup">
              Create your workspace <ArrowRight size={17} aria-hidden="true" />
            </Link>
            <Link className="button secondary" to="/login">
              Sign in
            </Link>
          </div>
          <p className="cta-note">
            Starts empty and private. No bank connection, no credentials to hand over.
          </p>
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
              <summary>Does Zoption connect to my bank?</summary>
              <dd>
                No. Zoption never connects to banks or asks for banking credentials. You import a CSV,
                Excel, or bank export file — or add rows yourself — and review every entry before
                anything is saved.
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
                details about how account, financial, and imported-transaction information is handled,
                see the Privacy Policy.
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
    </div>
  );
}
