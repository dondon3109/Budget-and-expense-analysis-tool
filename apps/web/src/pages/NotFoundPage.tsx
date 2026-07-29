import { Link } from "react-router-dom";

import "./NotFoundPage.css";

export function NotFoundPage() {
  return (
    <main className="not-found-page">
      <div className="not-found-card">
        <p className="eyebrow">404</p>
        <h1>That page is not here.</h1>
        <p>
          The link may be outdated, or the page may have moved. Return home to learn how Zoption can
          help you review expenses and budgets in a private workspace.
        </p>
        <Link className="button primary" to="/">
          Go to Zoption home
        </Link>
      </div>
    </main>
  );
}
