import { Link } from "react-router-dom";

import { LegalFooter } from "../components/legal/LegalFooter";
import { PublicHeader } from "../components/navigation/PublicHeader";
import "./NotFoundPage.css";

const POPULAR_DESTINATIONS = [
  { label: "Pricing", to: "/pricing" },
  { label: "Guides", to: "/guides" },
  { label: "Tutorials", to: "/tutorials" },
  { label: "FAQ", to: "/faq" },
];

export function NotFoundPage() {
  return (
    <div className="not-found-page">
      <PublicHeader />
      <main className="not-found-main" id="main-content" tabIndex={-1}>
        <div className="not-found-card">
          <p className="eyebrow">404</p>
          <h1>That page is not here.</h1>
          <p className="not-found-lead">
            The link may be outdated, or the page may have moved. Return home to learn how Zoption
            can help you review expenses and budgets in a private workspace.
          </p>
          <div className="not-found-actions">
            <Link className="button primary" to="/">
              Go to Zoption home
            </Link>
            <Link className="button secondary" to="/faq">
              Read common questions
            </Link>
          </div>
          <nav className="not-found-destinations" aria-label="Popular pages">
            {POPULAR_DESTINATIONS.map((destination) => (
              <Link key={destination.to} to={destination.to}>
                {destination.label}
              </Link>
            ))}
          </nav>
        </div>
      </main>
      <LegalFooter />
    </div>
  );
}
