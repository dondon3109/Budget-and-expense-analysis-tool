import type { ReactNode } from "react";
import { Link } from "react-router-dom";

import { LegalFooter } from "./LegalFooter";
import { ThemeToggle } from "../theme/ThemeToggle";
import "./LegalPageLayout.css";

export function LegalPageLayout({
  title,
  summary,
  children,
}: {
  title: string;
  summary: string;
  children: ReactNode;
}) {
  return (
    <div className="legal-page">
      <header className="legal-page-header">
        <Link className="brand compact" to="/" aria-label="Zoption home">
          <span className="brand-mark" aria-hidden="true">
            <span className="brand-monogram">Z</span>
          </span>
          <span className="brand-wordmark">Zoption</span>
        </Link>
        <ThemeToggle />
      </header>
      <main className="legal-page-main">
        <article className="legal-article">
          <header className="legal-article-header">
            <Link className="legal-back-link" to="/">
              ← Back to Zoption
            </Link>
            <h1>{title}</h1>
            <p className="legal-summary">{summary}</p>
            <p className="legal-updated">Last updated: July 28, 2026</p>
          </header>
          {children}
        </article>
      </main>
      <LegalFooter />
    </div>
  );
}
