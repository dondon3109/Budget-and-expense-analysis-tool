import type { ReactNode } from "react";

import { Breadcrumbs } from "../navigation/Breadcrumbs";
import { PublicHeader } from "../navigation/PublicHeader";
import { LegalFooter } from "./LegalFooter";
import "./LegalPageLayout.css";

export function LegalPageLayout({
  title,
  summary,
  lastUpdated,
  children,
}: {
  title: string;
  summary: string;
  /** Required: a shared default silently dates every new page, then goes stale. */
  lastUpdated: string;
  children: ReactNode;
}) {
  return (
    <div className="legal-page">
      <PublicHeader />
      <main className="legal-page-main" id="main-content" tabIndex={-1}>
        <article className="legal-article">
          <header className="legal-article-header">
            <Breadcrumbs
              items={[
                { label: "Home", to: "/" },
                { label: title },
              ]}
            />
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
