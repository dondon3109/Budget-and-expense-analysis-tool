import { ArrowRight, Bot, Camera, Check, FileSpreadsheet, Mic, Sparkles, X } from "lucide-react";
import type { PublicCustomerReview } from "@zoption/shared";
import { ANDROID_RELEASE } from "@zoption/web-common/android-release";
import type { ReactNode } from "react";
import "./LandingPage.css";

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
  { label: "Android APK", href: "#install", secondary: true },
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
  const androidRelease = ANDROID_RELEASE;

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
              Start for free with a private budgeting app and expense tracker. Record transactions
              by voice input or receipt scan, import a bank file, set a budget, save money toward
              your goals, and understand monthly cash flow — without connecting to your bank.
            </p>
            <div className="hero-actions">
              <a className="button primary" href={appUrl("/signup")} {...NEW_TAB}>
                Start for free <ArrowRight size={18} aria-hidden="true" />
              </a>
              <a className="button secondary" href="#fast-entry">
                Explore Voice &amp; Scan
              </a>
            </div>
            <p className="hero-cta-note">
              <Check size={15} aria-hidden="true" /> No payment required. Upgrade only if you want
              higher limits and Pro features.
            </p>
            <ul className="hero-proof" aria-label="Zoption at a glance">
              <li>
                <strong>Voice &amp; Photo Entry</strong>
                <span>just talk or snap receipts</span>
              </li>
              <li>
                <strong>PDF &amp; Excel Imports</strong>
                <span>universal bank file mapper</span>
              </li>
              <li>
                <strong>Free Plan &amp; AI</strong>
                <span>grounded &amp; private by design</span>
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
              Illustrative values only. Your workspace begins without transactions or budgets.
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
              <p>Speak naturally to log expenses — zero manual typing needed</p>
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
              <strong>Instant Receipt Scanner</strong>
              <p>Snap a photo of paper or digital receipts to extract totals automatically</p>
            </div>
          </div>
          <div className="pillar-item">
            <div className="pillar-icon files-icon">
              <FileSpreadsheet size={20} />
            </div>
            <div>
              <div className="pillar-badge-slot" />
              <strong>PDF, CSV &amp; Excel Importer</strong>
              <p>Universal statement mapper with exact centavo deduplication</p>
            </div>
          </div>
          <div className="pillar-item">
            <div className="pillar-icon ai-icon">
              <Bot size={20} />
            </div>
            <div>
              <div className="pillar-badge-slot" />
              <strong>Grounded AI Assistant</strong>
              <p>Ask questions about your numbers with evidence &amp; 0 bank passwords</p>
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
            <p className="eyebrow">The Zoption Advantage</p>
            <h2 id="compare-title">Why private budgeting beats bank-linked apps.</h2>
            <p className="section-lead">
              Fintech apps demand your bank password, harvest your financial habits for credit card
              ads, and round decimals. Zoption gives you total control, zero credential risk, and
              exact centavo accuracy.
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
                  <th scope="col">Capability &amp; Security Standard</th>
                  <th scope="col">Typical Finance Apps</th>
                  <th scope="col" className="zoption-col">
                    Zoption Private Workspace
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>
                    <strong>Voice &amp; spoken entry</strong>
                    <small>Speak to add transactions on the go</small>
                  </td>
                  <td>
                    <span className="comparison-cell-value risk">
                      <X size={15} aria-hidden="true" />
                      <span>Manual typing only &middot; no voice parser</span>
                    </span>
                  </td>
                  <td className="zoption-col">
                    <span className="comparison-cell-value advantage">
                      <Check size={15} aria-hidden="true" />
                      <span>Instant speech-to-transaction parsing &amp; 1-tap save</span>
                    </span>
                  </td>
                </tr>
                <tr>
                  <td>
                    <strong>Receipt photo scanning</strong>
                    <small>Camera &amp; screenshot expense extraction</small>
                  </td>
                  <td>
                    <span className="comparison-cell-value risk">
                      <X size={15} aria-hidden="true" />
                      <span>Locked behind expensive plans or manual entry</span>
                    </span>
                  </td>
                  <td className="zoption-col">
                    <span className="comparison-cell-value advantage">
                      <Check size={15} aria-hidden="true" />
                      <span>Smart OCR for paper &amp; digital bills with line items</span>
                    </span>
                  </td>
                </tr>
                <tr>
                  <td>
                    <strong>PDF, Excel &amp; CSV statements</strong>
                    <small>Upload e-statements &amp; multi-sheet workbooks</small>
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
                      <span>Universal PDF, CSV, XLSX &amp; XLS with deduplication</span>
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
                      <span>Grounded with evidence; saves only on your tap</span>
                    </span>
                  </td>
                </tr>
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
                <p>Beta ready to download</p>
                <h3>Zoption Beta</h3>
              </div>
              <span>APK</span>
            </div>
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
            <div className="install-promo-actions">
              <a className="button primary" href="/install">
                Download Android APK <ArrowRight size={17} aria-hidden="true" />
              </a>
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
            <a className="button primary" href={appUrl("/signup")} {...NEW_TAB}>
              Start for free <ArrowRight size={17} aria-hidden="true" />
            </a>
            <a className="button secondary" href={appUrl("/login")} {...NEW_TAB}>
              Sign in
            </a>
          </div>
          <p className="cta-note">
            No payment required. Your workspace starts empty and private, with no bank credentials
            to hand over.
          </p>
        </section>

        <CustomerReviews reviews={reviews} />

        <section className="faq" id="faq" aria-labelledby="faq-title">
          <div className="section-head">
            <p className="eyebrow">Common questions</p>
            <h2 id="faq-title">Budget and expense tracking, plainly answered.</h2>
            <p className="section-lead">
              How Zoption handles voice entry, receipt scanning, file imports, privacy, and money
              math.
            </p>
          </div>
          <div className="faq-list">
            <details className="faq-item">
              <summary>How does Voice Entry work?</summary>
              <p className="faq-answer">
                Tap the microphone and speak naturally in English or Taglish, such as &ldquo;Spent
                ₱540 for groceries at Robinsons Supermarket today&rdquo;. Zoption transcribes your
                speech, extracts the amount, auto-detects the merchant, and assigns the correct
                budget envelope. You review and save with a single tap — no typing required.
              </p>
            </details>
            <details className="faq-item">
              <summary>How does Receipt Photo Scanning work?</summary>
              <p className="faq-answer">
                Snap a picture of any paper receipt or upload a digital invoice screenshot.
                Zoption&rsquo;s vision engine extracts the store name, date, subtotal, sales tax,
                and line items automatically, then suggests the appropriate category envelope for
                your review.
              </p>
            </details>
            <details className="faq-item">
              <summary>What file formats can I import?</summary>
              <p className="faq-answer">
                PDF bank statements, multi-sheet Excel workbooks (.xlsx, .xls), and CSV files. Pick
                a document, map columns, filter duplicates, and preview every single row before
                committing it to your private ledger.
              </p>
            </details>
            <details className="faq-item">
              <summary>How does the AI Financial Assistant work?</summary>
              <p className="faq-answer">
                The assistant answers questions about your real numbers with grounded evidence and
                verified mathematical calculations. It operates only with your explicit consent, can
                draft a transaction that is saved only when you tap Save, and never edits or deletes
                your existing records.
              </p>
            </details>
            <details className="faq-item">
              <summary>Can I use Zoption for free?</summary>
              <p className="faq-answer">
                Yes. Create an account and use Zoption&rsquo;s Free plan without paying. It includes
                core tracking features with plan limits; upgrade to Pro only if you want higher
                limits and additional features.
              </p>
            </details>
            <details className="faq-item">
              <summary>Does Zoption connect to my bank?</summary>
              <p className="faq-answer">
                No. Zoption never connects to banks or asks for banking credentials. You import a
                PDF, CSV, Excel, or bank export file — or add rows yourself — and review every entry
                before anything is saved.
              </p>
            </details>
            <details className="faq-item">
              <summary>Is my workspace private?</summary>
              <p className="faq-answer">
                Your workspace starts empty and contains only the records you choose to add. For
                details about how account, financial, and imported-transaction information is
                handled, see the Privacy Policy.
              </p>
            </details>
            <details className="faq-item">
              <summary>How are money amounts stored?</summary>
              <p className="faq-answer">
                Amounts are represented safely in integer centavos and totaled in plain language, so
                the calculations stay transparent and easy to follow.
              </p>
            </details>
            <details className="faq-item">
              <summary>Do I need financial expertise to use Zoption?</summary>
              <p className="faq-answer">
                No. Zoption keeps the language jargon-free and every calculation transparent, so you
                can track expenses and set budgets without a finance background.
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
          <span>100% private · No card needed</span>
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
