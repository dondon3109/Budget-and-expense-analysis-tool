import type { ReactNode } from "react";
import { Link } from "react-router-dom";

import { BrandMark } from "../brand/BrandMark";
import { Breadcrumbs } from "../navigation/Breadcrumbs";
import { LegalFooter } from "./LegalFooter";
import { ThemeToggle } from "../theme/ThemeToggle";
import "./LegalPageLayout.css";

export function LegalPageLayout({
  title,
  summary,
  lastUpdated = "August 10, 2026",
  children,
}: {
  title: string;
  summary: string;
  lastUpdated?: string;
  children: ReactNode;
}) {
  return (
    <div className="legal-page">
      <header className="legal-page-header">
        <Link className="brand compact" to="/" aria-label="Zoption home">
          <BrandMark />
          <span className="brand-wordmark">Zoption</span>
        </Link>
        <ThemeToggle />
      </header>
      <main className="legal-page-main">
        <article className="legal-article">
          <header className="legal-article-header">
            <Breadcrumbs
              items={[
                { label: "Home", to: "/" },
                { label: title },
              ]}
            />
            <Link className="legal-back-link" to="/">
              ← Back to Zoption
            </Link>
            <h1>{title}</h1>
            <p className="legal-summary">{summary}</p>
            <p className="legal-updated">Last updated: {lastUpdated}</p>
          </header>
          {children}
        </article>
      </main>
      <LegalFooter />
    </div>
  );
}
