import { ArrowRight, BarChart3, Check, Landmark, ShieldCheck, Upload } from "lucide-react";
import { Link } from "react-router-dom";

export function LandingPage() {
  return (
    <div className="landing-page">
      <header className="landing-nav">
        <a className="brand" href="#top">
          <span className="brand-mark">
            <Landmark size={20} />
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
              a clear monthly picture.
            </p>
            <div className="hero-actions">
              <div className="hero-action-buttons">
                <Link className="button primary" to="/signup">
                  Create account <ArrowRight size={18} />
                </Link>
                <Link className="button secondary" to="/demo">
                  Open demo
                </Link>
              </div>
              <span>
                <ShieldCheck size={17} /> The read-only demo needs no account
              </span>
            </div>
            <div className="hero-proof">
              <div>
                <strong>100%</strong>
                <span>preview before import</span>
              </div>
              <div>
                <strong>₱0</strong>
                <span>to explore the demo</span>
              </div>
              <div>
                <strong>Clear</strong>
                <span>plain-language insights</span>
              </div>
            </div>
          </div>
          <div className="hero-visual" aria-label="Preview of the Clarity budget dashboard">
            <div className="preview-top">
              <div>
                <span className="preview-logo">
                  <Landmark size={15} />
                </span>
                <b>July overview</b>
              </div>
              <span className="status-dot">Demo</span>
            </div>
            <div className="preview-metrics">
              <div>
                <span>Money in</span>
                <strong>₱73,500</strong>
                <small>Monthly income</small>
              </div>
              <div>
                <span>Money out</span>
                <strong>₱32,658</strong>
                <small>44% of income</small>
              </div>
            </div>
            <div className="preview-chart">
              <div className="preview-chart-head">
                <span>Spending rhythm</span>
                <small>Feb – Jul</small>
              </div>
              <div className="chart-bars">
                {[48, 42, 56, 49, 63, 58].map((height, index) => (
                  <span key={index} style={{ height: `${height}%` }} />
                ))}
              </div>
            </div>
            <div className="preview-bottom">
              <div>
                <span className="preview-icon upload">
                  <Upload size={16} />
                </span>
                <p>
                  <b>Import with confidence</b>
                  <small>Review every row before saving</small>
                </p>
              </div>
              <span className="check">
                <Check size={15} />
              </span>
            </div>
          </div>
        </section>
        <section className="feature-strip" id="features">
          <article>
            <span>
              <Upload size={20} />
            </span>
            <div>
              <h2>Import safely</h2>
              <p>Map columns, catch errors, and prevent duplicate entries.</p>
            </div>
          </article>
          <article>
            <span>
              <BarChart3 size={20} />
            </span>
            <div>
              <h2>Understand quickly</h2>
              <p>See totals, trends, categories, and budget progress together.</p>
            </div>
          </article>
          <article>
            <span>
              <ShieldCheck size={20} />
            </span>
            <div>
              <h2>Stay in control</h2>
              <p>Start with a private-minded demo before choosing persistence.</p>
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
          <Link className="text-link" to="/demo">
            See the July sample <ArrowRight size={17} />
          </Link>
        </section>
      </main>
    </div>
  );
}
