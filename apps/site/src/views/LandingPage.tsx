import { ArrowRight, Bot, Camera, Check, FileSpreadsheet, Mic, Sparkles, X } from "lucide-react";
import type { PublicCustomerReview } from "@zoption/shared";
import type { ReactNode } from "react";
import "./LandingPage.css";
import "./LandingComparison.css";

import { BrandMark } from "../components/brand/BrandMark";
import { CustomerReviews } from "../components/landing/CustomerReviews";
import { LegalFooter } from "../components/legal/LegalFooter";
import { PublicHeader, type PublicHeaderLink } from "../components/navigation/PublicHeader";
import { appUrl, NEW_TAB } from "../lib/appUrl";

/**
 * In-page anchors for the long marketing page; the shared header renders them.
 *
 * Ten labels plus the brand and the account actions need roughly 1420px of viewport,
 * so the four deeper section links step out of the desktop row below that width and
 * stay reachable in the header drawer. The order below is page order, which is also
 * the drawer order, so nothing moves except on a squeezed row.
 */
const LANDING_HEADER_LINKS: PublicHeaderLink[] = [
  { label: "Voice & Scan", href: "#fast-entry" },
  { label: "Features", href: "#modules" },
  { label: "Budget planner", href: "#calculator" },
  { label: "Why Zoption", href: "#compare" },
  { label: "Pricing", href: "/pricing" },
  { label: "Android app", href: "#install", secondary: true },
  { label: "Supported imports", href: "#banks", secondary: true },
  { label: "How it works", href: "#approach", secondary: true },
  { label: "Reviews", href: "#reviews", secondary: true },
  { label: "FAQ", href: "#faq" },
];

const previewBars = [42, 55, 38, 66, 50, 61];

/**
 * The interactive sections arrive as Astro island slots so this page renders to
 * static HTML and only those sections hydrate. Astro passes named slots as props
 * its type check cannot see, which is why they are optional here.
 */
export interface LandingPageProps {
  receiptPile?: ReactNode;
  fastEntry?: ReactNode;
  featureModules?: ReactNode;
  budgetPlanner?: ReactNode;
  reviews: readonly PublicCustomerReview[];
}

export function LandingPage({
  receiptPile,
  fastEntry,
  featureModules,
  budgetPlanner,
  reviews,
}: LandingPageProps) {
  return (
    <div className="landing-page">
      <PublicHeader links={LANDING_HEADER_LINKS} />

      <main id="main-content" tabIndex={-1}>
        <section className="hero">
          <div className="hero-copy">
            <ul
              className="hero-eyebrow hero-eyebrow-pills"
              role="list"
              aria-label="Zoption capabilities"
            >
              <li>
                <Mic size={15} aria-hidden="true" /> Voice Entry
              </li>
              <li>
                <Camera size={15} aria-hidden="true" /> Scan Receipt
              </li>
              <li>
                <Sparkles size={15} aria-hidden="true" /> AI Assistant &middot; 100% Private
              </li>
            </ul>
            <h1>
              Zoption makes your money clear. Decide <em>what comes next.</em>
            </h1>
            <p className="hero-lead">
              A private budget and expense tracker that never asks for your bank password. Speak an
              expense in English or Tagalog, snap a receipt, paste a bank or e-wallet SMS, or upload
              a statement file. Track budgets, bills, and savings across 47 currencies.
            </p>
            <div className="hero-actions">
              <a className="button primary" href={appUrl("/signup")} {...NEW_TAB}>
                Start for free <ArrowRight size={18} aria-hidden="true" />
              </a>
              <a className="button secondary" href="#fast-entry">
                See how fast entry works
              </a>
            </div>
            <p className="hero-cta-note">
              <Check size={15} aria-hidden="true" /> No payment required. Free forever with 500
              monthly AI actions, plus a 7-day Zoption Pro trial.
            </p>
            <ul className="hero-proof" aria-label="Zoption at a glance">
              <li>
                <strong>Voice &amp; Receipt Entry</strong>
                <span>English &amp; Tagalog voice, scans never stored</span>
              </li>
              <li>
                <strong>PDF, CSV &amp; Excel</strong>
                <span>preview every row, skip duplicates</span>
              </li>
              <li>
                <strong>Free Forever &amp; 7-Day Pro</strong>
                <span>no card, no bank login required</span>
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
                <small>Six-month view</small>
              </div>
              <div className="chart-bars" aria-hidden="true">
                {previewBars.map((height, index) => (
                  <span key={index} aria-hidden="true" style={{ height: `${height}%` }} />
                ))}
              </div>
            </div>
            <p className="preview-disclaimer">
              Sample figures only. Your workspace begins without transactions or budgets.
            </p>
          </div>
        </section>

        {/* ============================================================
           Marketing Trust & Capability Pillars Strip
           ============================================================ */}
        <section className="trust-pillars-strip" aria-label="Trust and privacy pillars">
          <div className="pillar-item highlight-pillar">
            <div className="pillar-icon voice-icon">
              <Mic size={20} />
            </div>
            <div>
              <div className="pillar-badge-slot">
                <span className="pillar-badge">Top Feature</span>
              </div>
              <strong>Voice Transaction Entry</strong>
              <p>
                Speak in English or Tagalog to draft an expense with amount, store, and category
              </p>
            </div>
          </div>
          <div className="pillar-item highlight-pillar">
            <div className="pillar-icon receipt-icon">
              <Camera size={20} />
            </div>
            <div>
              <div className="pillar-badge-slot">
                <span className="pillar-badge">Top Feature</span>
              </div>
              <strong>Receipt Photo Scanner</strong>
              <p>
                Extract store, date, and totals from paper or digital receipts without storing the
                photo
              </p>
            </div>
          </div>
          <div className="pillar-item">
            <div className="pillar-icon files-icon">
              <FileSpreadsheet size={20} />
            </div>
            <div>
              <div className="pillar-badge-slot" />
              <strong>PDF, CSV &amp; Excel Importer</strong>
              <p>
                Upload bank statements or spreadsheets, map columns, and catch duplicates before
                saving
              </p>
            </div>
          </div>
          <div className="pillar-item">
            <div className="pillar-icon ai-icon">
              <Bot size={20} />
            </div>
            <div>
              <div className="pillar-badge-slot" />
              <strong>Consent-Gated AI Assistant</strong>
              <p>
                Ask questions about your ledger or draft budget updates. Nothing saves until you tap
                Confirm
              </p>
            </div>
          </div>
        </section>

        {receiptPile}

        {fastEntry}

        {featureModules}

        {budgetPlanner}

        {/* ============================================================
           Comparison Matrix (SEO & Marketing Wedge)
           ============================================================ */}
        <section className="comparison-section" id="compare" aria-labelledby="compare-title">
          <div className="section-head">
            <p className="eyebrow">Why Zoption</p>
            <h2 id="compare-title">Why private budgeting beats bank-linked apps.</h2>
            <p className="section-lead">
              Bank-linked trackers ask for your online banking login, break when your bank changes
              security, and profile your spending for credit offers. Zoption works from your voice,
              receipts, SMS alerts, and downloaded statements, with exact centavo math.
            </p>
          </div>

          {/* Scrolls horizontally on narrow screens, so it must be reachable and scrollable
              by keyboard rather than only by touch. */}
          <div
            className="comparison-table-wrap"
            role="region"
            aria-label="Feature comparison table"
            tabIndex={0}
          >
            <table className="comparison-table">
              <colgroup>
                <col style={{ width: "36%" }} />
                <col style={{ width: "32%" }} />
                <col style={{ width: "32%" }} />
              </colgroup>
              <thead>
                <tr>
                  <th scope="col">What matters</th>
                  <th scope="col">Typical Finance Apps</th>
                  <th scope="col" className="zoption-col">
                    Zoption Private Workspace
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>
                    <strong>Voice &amp; SMS entry</strong>
                    <small>Log cash, card, and e-wallet spending in seconds</small>
                  </td>
                  <td>
                    <span className="comparison-cell-value risk">
                      <X size={15} aria-hidden="true" />
                      <span>Manual forms only</span>
                    </span>
                  </td>
                  <td className="zoption-col">
                    <span className="comparison-cell-value advantage">
                      <Check size={15} aria-hidden="true" />
                      <span>English &amp; Tagalog voice entry plus bank/e-wallet SMS paste</span>
                    </span>
                  </td>
                </tr>
                <tr>
                  <td>
                    <strong>Receipt photo scanning</strong>
                    <small>Paper bills and checkout screenshots</small>
                  </td>
                  <td>
                    <span className="comparison-cell-value risk">
                      <X size={15} aria-hidden="true" />
                      <span>Locked on top tiers or keeps receipt photos on servers</span>
                    </span>
                  </td>
                  <td className="zoption-col">
                    <span className="comparison-cell-value advantage">
                      <Check size={15} aria-hidden="true" />
                      <span>
                        Included on Free plan; extracts totals &amp; never stores the photo
                      </span>
                    </span>
                  </td>
                </tr>
                <tr>
                  <td>
                    <strong>PDF, Excel &amp; CSV statements</strong>
                    <small>Import bank history without live scraping</small>
                  </td>
                  <td>
                    <span className="comparison-cell-value risk">
                      <X size={15} aria-hidden="true" />
                      <span>Rigid templates or paid-only file imports</span>
                    </span>
                  </td>
                  <td className="zoption-col">
                    <span className="comparison-cell-value advantage">
                      <Check size={15} aria-hidden="true" />
                      <span>PDF, CSV, XLSX &amp; XLS with preview and duplicate checks</span>
                    </span>
                  </td>
                </tr>
                <tr>
                  <td>
                    <strong>AI financial assistant</strong>
                    <small>Answers and budget updates</small>
                  </td>
                  <td>
                    <span className="comparison-cell-value risk">
                      <X size={15} aria-hidden="true" />
                      <span>Generic advice or unchecked writes to your records</span>
                    </span>
                  </td>
                  <td className="zoption-col">
                    <span className="comparison-cell-value advantage">
                      <Check size={15} aria-hidden="true" />
                      <span>Consent-gated, ledger-backed math; saves only on your tap</span>
                    </span>
                  </td>
                </tr>
                <tr>
                  <td>
                    <strong>Bank login credentials</strong>
                    <small>What you hand over to get started</small>
                  </td>
                  <td>
                    <span className="comparison-cell-value risk">
                      <X size={15} aria-hidden="true" />
                      <span>Online banking passwords or third-party screen scraping</span>
                    </span>
                  </td>
                  <td className="zoption-col">
                    <span className="comparison-cell-value advantage">
                      <Check size={15} aria-hidden="true" />
                      <span>Never requested; you bring files or entries you choose</span>
                    </span>
                  </td>
                </tr>
                <tr>
                  <td>
                    <strong>Ads &amp; data profiling</strong>
                    <small>How the app makes money</small>
                  </td>
                  <td>
                    <span className="comparison-cell-value risk">
                      <X size={15} aria-hidden="true" />
                      <span>Loan ads and spending profiles sold to partners</span>
                    </span>
                  </td>
                  <td className="zoption-col">
                    <span className="comparison-cell-value advantage">
                      <Check size={15} aria-hidden="true" />
                      <span>Zero ads; funded strictly by optional paid plans</span>
                    </span>
                  </td>
                </tr>
                <tr>
                  <td>
                    <strong>Calculation precision</strong>
                    <small>How totals stay accurate across 47 currencies</small>
                  </td>
                  <td>
                    <span className="comparison-cell-value risk">
                      <X size={15} aria-hidden="true" />
                      <span>Floating-point rounding drift</span>
                    </span>
                  </td>
                  <td className="zoption-col">
                    <span className="comparison-cell-value advantage">
                      <Check size={15} aria-hidden="true" />
                      <span>Whole integer centavos end to end</span>
                    </span>
                  </td>
                </tr>
                <tr>
                  <td>
                    <strong>Web &amp; Android access</strong>
                    <small>Use on desktop and phone with one account</small>
                  </td>
                  <td>
                    <span className="comparison-cell-value risk">
                      <X size={15} aria-hidden="true" />
                      <span>No offline entry when signal drops</span>
                    </span>
                  </td>
                  <td className="zoption-col">
                    <span className="comparison-cell-value advantage">
                      <Check size={15} aria-hidden="true" />
                      <span>Web app today, plus native Android with encrypted offline SQLite</span>
                    </span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <section className="install-promo" id="install" aria-labelledby="install-promo-title">
          <div className="install-promo-copy">
            <p className="eyebrow">Zoption for Android</p>
            <h2 id="install-promo-title">Coming soon to Google Play.</h2>
            <p>
              The native Android app is in testing on Google Play. Your workspace sits encrypted on
              your phone for offline-first entry that syncs later, plus camera receipt scanning and
              voice logging.
            </p>
            <ul className="install-promo-points">
              <li>
                <Check size={16} aria-hidden="true" /> Same account and workspace as the web app
              </li>
              <li>
                <Check size={16} aria-hidden="true" /> Encrypted offline entries that sync when you
                reconnect
              </li>
              <li>
                <Check size={16} aria-hidden="true" /> Installs and updates only through Google Play
              </li>
            </ul>
          </div>

          <div className="install-promo-release">
            <div className="install-promo-release-heading">
              <BrandMark className="install-promo-mark" />
              <div>
                <p>In testing on Google Play</p>
                <h3>Zoption</h3>
              </div>
              <span>Android</span>
            </div>
            <div className="install-promo-actions">
              <a className="button primary" href="/install">
                About the Android app <ArrowRight size={17} aria-hidden="true" />
              </a>
            </div>
            <p className="install-promo-note">
              Until the Google Play listing opens, use the same account on the web app in any
              browser. Web actions need an internet connection; on Android, entries work offline and
              sync once you are back online.
            </p>
          </div>
        </section>

        <section className="formats-band" id="banks" aria-labelledby="banks-title">
          <div className="section-head">
            <p className="eyebrow">Start from a file you already have</p>
            <h2 id="banks-title">Bring a bank or spreadsheet export.</h2>
            <p className="section-lead">
              Upload a PDF bank statement, CSV, XLSX, or XLS file. Built-in presets detect columns
              for these banks, a generic preset handles any other bank or e-wallet export, and you
              review every row before saving.
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
          <nav className="formats-links" aria-label="Bank statement import guides">
            <a href="/import/bdo-statement">BDO guide</a>
            <a href="/import/bpi-statement">BPI guide</a>
            <a href="/import/maribank-statement">MariBank guide</a>
            <a href="/import/bank-of-america-statement">Bank of America guide</a>
            <a href="/import/jpmorgan-statement">JPMorgan Chase guide</a>
            <a href="/import">All import formats</a>
          </nav>
          <p className="formats-disclaimer">
            Bank names are shown to indicate supported export formats only. Zoption is not
            affiliated with or endorsed by these institutions.
          </p>
        </section>

        <section className="approach" id="approach" aria-labelledby="approach-title">
          <div className="section-head">
            <p className="eyebrow">How it works</p>
            <h2 id="approach-title">Three steps to a clear month.</h2>
            <p className="section-lead">
              No bank linking, no broken spreadsheet formulas. Record spending your way, check the
              exact math, and see what is safe to spend next.
            </p>
          </div>
          <div className="rhythm">
            <article className="step">
              <span className="step-n">01</span>
              <h3>Log what moves</h3>
              <p>
                Speak an expense, scan a receipt, paste a bank or GCash SMS, or import a statement
                file. Only rows you confirm ever reach your workspace.
              </p>
            </article>
            <article className="step">
              <span className="step-n">02</span>
              <h3>Check exact totals</h3>
              <p>
                Zoption stores amounts in whole centavos across 47 currencies, groups entries into
                your categories, and flags duplicates before they distort your balance.
              </p>
            </article>
            <article className="step">
              <span className="step-n">03</span>
              <h3>Decide what&apos;s next</h3>
              <p>
                Track monthly budgets, upcoming bills on the calendar, savings interest, or shared
                family budgets, and ask the AI assistant when you want a breakdown.
              </p>
            </article>
          </div>
          <div className="final-cta-actions">
            <a className="button primary" href={appUrl("/signup")} {...NEW_TAB}>
              Start for free <ArrowRight size={17} aria-hidden="true" />
            </a>
            <a className="button secondary" href={appUrl("/login")} {...NEW_TAB}>
              Sign in
            </a>
          </div>
          <p className="cta-note">
            Free forever with 500 monthly AI actions and a 7-day Zoption Pro trial. No card or bank
            password needed.
          </p>
        </section>

        <CustomerReviews reviews={reviews} />

        <section className="faq" id="faq" aria-labelledby="faq-title">
          <div className="section-head">
            <p className="eyebrow">Common questions</p>
            <h2 id="faq-title">Budget and expense tracking, plainly answered.</h2>
            <p className="section-lead">
              Direct answers on voice entry, receipt scanning, bank imports, pricing, privacy, and
              how Zoption calculates your totals.
            </p>
          </div>
          <div className="faq-list">
            <details className="faq-item">
              <summary>How does Voice Entry work?</summary>
              <p className="faq-answer">
                Tap the microphone and speak in English or Tagalog, such as &ldquo;Spent ₱540 for
                groceries at Robinsons Supermarket today&rdquo;. Zoption transcribes your speech and
                drafts the amount, store, date, and category. You check the draft and save with one
                tap.
              </p>
            </details>
            <details className="faq-item">
              <summary>How does Receipt Photo Scanning work?</summary>
              <p className="faq-answer">
                Take a photo of a paper receipt or upload a checkout screenshot. Zoption reads the
                store name, date, tax, total, and line items into an editable draft for your review.
                The image is read to build the draft and is never stored.
              </p>
            </details>
            <details className="faq-item">
              <summary>What file formats and banks can I import?</summary>
              <p className="faq-answer">
                You can import PDF bank statements, Excel workbooks (.xlsx and .xls), and CSV files.
                Built-in presets detect columns for BDO, BPI, MariBank, Bank of America, and
                JPMorgan Chase, while the generic preset covers any other bank or e-wallet export.
                Every row is previewed and checked for duplicates before saving.
              </p>
            </details>
            <details className="faq-item">
              <summary>How does the AI Financial Assistant work?</summary>
              <p className="faq-answer">
                The assistant is optional and asks for separate consent. It answers questions using
                math computed from your real ledger, never guesses totals, and can draft
                transactions or propose edits to bills, goals, debts, accounts, categories, or
                budgets. Nothing changes until you tap Save or Confirm.
              </p>
            </details>
            <details className="faq-item">
              <summary>Can I use Zoption for free?</summary>
              <p className="faq-answer">
                Yes. The Free plan is ₱0 forever with unlimited manual entries, 500 shared AI
                actions per month, and 1 committed statement import per month. Every new account
                also starts with a 7-day Zoption Pro trial with no card required. Paid plans start
                at ₱149/month for Budget, ₱249/month for Pro, and ₱499/month for Family plans up to
                6 people.
              </p>
            </details>
            <details className="faq-item">
              <summary>Does Zoption connect to my bank?</summary>
              <p className="faq-answer">
                No. Zoption never connects to banks or asks for banking passwords. You log spending
                by voice, receipt scan, SMS paste, manual entry, or downloaded statement files, and
                you review every entry before anything is saved.
              </p>
            </details>
            <details className="faq-item">
              <summary>Is my workspace private?</summary>
              <p className="faq-answer">
                Your workspace starts empty, is isolated to your account, and has no ads or spending
                profiles sold to third parties. For full details on how data is stored and deleted,
                see the Privacy Policy.
              </p>
            </details>
            <details className="faq-item">
              <summary>How are money amounts and currencies handled?</summary>
              <p className="faq-answer">
                Amounts are stored in exact integer minor units (centavos) so totals never suffer
                from floating-point rounding drift. Zoption supports 47 currencies including PHP,
                USD, EUR, GBP, JPY, SGD, and AED, with each account keeping its own currency.
              </p>
            </details>
            <details className="faq-item">
              <summary>Do I need financial expertise to use Zoption?</summary>
              <p className="faq-answer">
                No. Setup adapts to how often you get paid and which categories you want to watch,
                and every total and budget bar is written in plain language.
              </p>
            </details>
          </div>
          <a className="faq-see-all" href="/faq">
            See all common questions <ArrowRight size={16} aria-hidden="true" />
          </a>
        </section>
      </main>
      <StickyMobileCta />
      <LegalFooter />
    </div>
  );
}

/** Revealed by `src/client/site.ts` once the visitor scrolls past the hero. */
function StickyMobileCta() {
  return (
    <aside className="landing-sticky-mobile-cta" aria-label="Quick sign up" data-sticky-cta hidden>
      <div className="sticky-mobile-cta-content">
        <div className="sticky-mobile-cta-text">
          <strong>Start for free</strong>
          <span>500 free AI actions/mo · No card needed</span>
        </div>
        <div className="sticky-mobile-cta-actions">
          <a className="button primary compact" href={appUrl("/signup")} {...NEW_TAB}>
            Create account <ArrowRight size={14} aria-hidden="true" />
          </a>
        </div>
      </div>
    </aside>
  );
}
