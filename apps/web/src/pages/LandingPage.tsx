import { ArrowRight, BarChart3, Check, Landmark, ShieldCheck, Upload } from "lucide-react";
import { Link } from "react-router-dom";

const previewBars = [42, 55, 38, 66, 50, 61];

export function LandingPage() {
  return (
    <div className="landing-page">
      <header className="landing-nav">
        <a className="brand" href="#top">
          <span className="brand-mark">
            <Landmark size={20} aria-hidden="true" />
          </span>
          <span>Clarity</span>
        </a>
        <div className="landing-links">
          <a href="#features">Features</a>
          <a href="#approach">How it works</a>
        </div>
        <div className="landing-account-actions">
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
            <div className="hero-kicker">
              <span /> A calmer way to understand your money
            </div>
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
            <div className="hero-proof">
              <div>
                <strong>Review</strong>
                <span>every row before import</span>
              </div>
              <div>
                <strong>No bank link</strong>
                <span>you choose what to add</span>
              </div>
              <div>
                <strong>Transparent</strong>
                <span>plain-language calculations</span>
              </div>
            </div>
          </div>
          <div
            className="hero-visual"
            role="img"
            aria-label="Illustrative preview of the Clarity monthly dashboard"
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
              <div>
                <span>Money in</span>
                <strong>₱48,000</strong>
                <small>Income this month</small>
              </div>
              <div>
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
        <section className="approach" id="approach">
          <p className="eyebrow">Designed for real decisions</p>
          <h2>Financial clarity without the financial jargon.</h2>
          <p>
            Clarity keeps calculations transparent, represents money safely in integer centavos, and
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
