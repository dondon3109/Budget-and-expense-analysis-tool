import { ArrowRight, BarChart3, Check, Landmark, ShieldCheck, Upload } from "lucide-react";
import { Link } from "react-router-dom";

import supportedExportFormatsLarge from "../assets/supported-export-formats-1536.webp";
import supportedExportFormatsSmall from "../assets/supported-export-formats-768.webp";
import { ThemeToggle } from "../components/theme/ThemeToggle";

const previewBars = [42, 55, 38, 66, 50, 61];
const supportedExportFormats = ["BPI", "BDO", "MariBank", "Bank of America", "JPMorgan / Chase"];

export function LandingPage() {
  return (
    <div className="landing-page">
      <header className="landing-nav">
        <a className="brand" href="#top">
          <span className="brand-mark">
            <Landmark size={20} aria-hidden="true" />
          </span>
          <span>Zoption</span>
        </a>
        <nav className="landing-links" aria-label="Learn more">
          <a href="#features">Features</a>
          <a href="#approach">How it works</a>
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
      <main id="top">
        <section className="hero">
          <div className="hero-copy">
            <h1>See where your money goes. Decide what comes next.</h1>
            <p>
              Import everyday transactions, set practical budgets, and turn scattered spending into
              a clear monthly picture in your own private workspace.
            </p>
            <div className="hero-actions">
              <div className="hero-action-buttons">
                <Link className="button primary" to="/signup">
                  Create account <ArrowRight size={18} aria-hidden="true" />
                </Link>
                <Link className="button secondary" to="/login">
                  Sign in
                </Link>
              </div>
              <span>
                <ShieldCheck size={17} aria-hidden="true" /> Your workspace starts empty and private
              </span>
            </div>
            <ul className="hero-proof" aria-label="Why Zoption">
              <li>
                <strong>Review</strong>
                <span>every row before import</span>
              </li>
              <li>
                <strong>No bank link</strong>
                <span>you choose what to add</span>
              </li>
              <li>
                <strong>Transparent</strong>
                <span>plain-language calculations</span>
              </li>
            </ul>
          </div>
          <div
            className="hero-visual"
            role="img"
            aria-label="Illustrative preview of the Zoption monthly dashboard"
            aria-describedby="preview-disclaimer"
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
            <div className="preview-bottom">
              <div>
                <span className="preview-icon upload">
                  <Upload size={16} aria-hidden="true" />
                </span>
                <p>
                  <b>Import with confidence</b>
                  <small>Review every row before saving</small>
                </p>
              </div>
              <span className="check">
                <Check size={15} aria-hidden="true" />
              </span>
            </div>
            <p className="preview-disclaimer" id="preview-disclaimer">
              Illustrative values only. Your workspace begins without transactions or budgets.
            </p>
          </div>
        </section>
        <section className="feature-strip" id="features">
          <article>
            <span>
              <Upload size={20} aria-hidden="true" />
            </span>
            <div>
              <h2>Import safely</h2>
              <p>Map columns, catch errors, and prevent duplicate entries.</p>
            </div>
          </article>
          <article>
            <span>
              <BarChart3 size={20} aria-hidden="true" />
            </span>
            <div>
              <h2>Understand quickly</h2>
              <p>See totals, trends, categories, and budget progress together.</p>
            </div>
          </article>
          <article>
            <span>
              <ShieldCheck size={20} aria-hidden="true" />
            </span>
            <div>
              <h2>Use your own numbers</h2>
              <p>Start from a clean workspace and add only the records you choose.</p>
            </div>
          </article>
        </section>
        <section className="import-support" aria-labelledby="import-support-title">
          <div className="import-support-copy">
            <p className="eyebrow">Flexible file imports</p>
            <h2 id="import-support-title">Import from the files you already use.</h2>
            <p className="import-support-lead">
              Choose a CSV, XLSX, or XLS file, then review every row before anything is saved.
            </p>
            <div className="import-support-options">
              <article>
                <span className="import-support-icon">
                  <Upload size={19} aria-hidden="true" />
                </span>
                <div>
                  <h3>Start with Excel</h3>
                  <p>
                    Already tracking finances in Excel? Import your workbook, choose a worksheet,
                    and see it visualized after review.
                  </p>
                </div>
              </article>
              <article>
                <span className="import-support-icon">
                  <Landmark size={19} aria-hidden="true" />
                </span>
                <div>
                  <h3>Bring your bank export</h3>
                  <p>
                    Export your bank transactions, import the file, and see your spending habits at
                    a glance.
                  </p>
                </div>
              </article>
            </div>
          </div>
          <div className="import-sheet-visual" aria-hidden="true">
            <div className="import-sheet-topbar">
              <span className="import-file-chip">
                <Upload size={15} /> Monthly-spend.xlsx
              </span>
              <span className="import-ready-chip">
                <Check size={14} /> Ready to review
              </span>
            </div>
            <div className="import-sheet-grid">
              <div className="import-sheet-row heading">
                <span>Date</span>
                <span>Description</span>
                <span>Category</span>
                <span>Amount</span>
              </div>
              <div className="import-sheet-row">
                <span>Jul 02</span>
                <span>Neighborhood market</span>
                <span>Groceries</span>
                <span>₱1,240</span>
              </div>
              <div className="import-sheet-row">
                <span>Jul 05</span>
                <span>Monthly salary</span>
                <span>Income</span>
                <span>₱48,000</span>
              </div>
              <div className="import-sheet-row">
                <span>Jul 08</span>
                <span>Electric bill</span>
                <span>Utilities</span>
                <span>₱2,180</span>
              </div>
              <div className="import-sheet-row muted-row">
                <span>Jul 11</span>
                <span>Bank transfer</span>
                <span>Review</span>
                <span>₱3,500</span>
              </div>
            </div>
            <div className="import-sheet-footer">
              <span>Sheet: Transactions</span>
              <strong>Every row stays reviewable</strong>
            </div>
          </div>
        </section>
        <section className="supported-formats" aria-labelledby="supported-formats-title">
          <picture className="supported-formats-photo" aria-hidden="true">
            <source media="(max-width: 760px)" srcSet={supportedExportFormatsSmall} />
            <img
              src={supportedExportFormatsLarge}
              srcSet={`${supportedExportFormatsSmall} 768w, ${supportedExportFormatsLarge} 1536w`}
              sizes="100vw"
              width={1536}
              height={1024}
              loading="lazy"
              decoding="async"
              alt=""
            />
          </picture>
          <div className="supported-formats-overlay" aria-hidden="true" />
          <div className="supported-formats-content">
            <h2 className="supported-formats-heading" id="supported-formats-title">
              Supported Export Formats
            </h2>
            <div className="supported-formats-marquee">
              <div className="supported-formats-track" aria-hidden="true">
                {[0, 1].map((groupIndex) => (
                  <div
                    className="supported-formats-group"
                    data-marquee-copy={groupIndex === 1 ? "duplicate" : "primary"}
                    key={groupIndex}
                  >
                    {supportedExportFormats.map((format) => (
                      <span className="supported-format-name" key={format}>
                        {format}
                      </span>
                    ))}
                  </div>
                ))}
              </div>
              <ul className="sr-only" aria-label="Supported institutions">
                {supportedExportFormats.map((format) => (
                  <li key={format}>{format}</li>
                ))}
              </ul>
            </div>
            <p className="supported-formats-disclaimer">
              Bank names are shown to indicate supported export formats only. Zoption is not
              affiliated with or endorsed by these institutions.
            </p>
          </div>
        </section>
        <section className="approach" id="approach">
          <p className="eyebrow">Designed for real decisions</p>
          <h2>Financial confidence without the financial jargon.</h2>
          <p>
            Zoption keeps calculations transparent, represents money safely in integer centavos, and
            makes every imported row reviewable.
          </p>
          <div className="final-cta-actions">
            <Link className="button primary" to="/signup">
              Create your workspace <ArrowRight size={17} aria-hidden="true" />
            </Link>
            <Link className="button secondary" to="/login">
              Sign in
            </Link>
          </div>
        </section>
      </main>
    </div>
  );
}
