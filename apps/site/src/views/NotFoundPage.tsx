import { LegalFooter } from "../components/legal/LegalFooter";
import { PublicHeader } from "../components/navigation/PublicHeader";
import "./NotFoundPage.css";

const POPULAR_DESTINATIONS = [
  { label: "Pricing", href: "/pricing" },
  { label: "Guides", href: "/guides" },
  { label: "Tutorials", href: "/tutorials" },
  { label: "FAQ", href: "/faq" },
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
            <a className="button primary" href="/">
              Go to Zoption home
            </a>
            <a className="button secondary" href="/faq">
              Read common questions
            </a>
          </div>
          <nav className="not-found-destinations" aria-label="Popular pages">
            {POPULAR_DESTINATIONS.map((destination) => (
              <a key={destination.href} href={destination.href}>
                {destination.label}
              </a>
            ))}
          </nav>
        </div>
      </main>
      <LegalFooter />
    </div>
  );
}
