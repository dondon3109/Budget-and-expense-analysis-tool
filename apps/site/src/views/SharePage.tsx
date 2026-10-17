import type { ReactNode } from "react";

import { LegalFooter } from "../components/legal/LegalFooter";
import { PublicHeader } from "../components/navigation/PublicHeader";
import { appUrl } from "../lib/appUrl";
import "./SharePage.css";

/** `/s`: static shell around `shareCard`, the island that reads the link and renders it. */
export function SharePage({ shareCard }: { shareCard?: ReactNode }) {
  return (
    <div className="share-page">
      <PublicHeader />
      <main className="share-main" id="main-content" tabIndex={-1}>
        {shareCard}
        <p className="share-privacy">
          A read-only snapshot. It does not open the account it came from, and the person who shared
          it can turn the link off at any time.
        </p>
        <aside className="share-cta" aria-labelledby="share-cta-title">
          <h2 id="share-cta-title">Know where your money goes</h2>
          <p>
            Zoption tracks spending, budgets, and balances in a private workspace. Share only what
            you choose.
          </p>
          <a className="button primary" href={appUrl("/signup")}>
            Track yours with Zoption
          </a>
        </aside>
      </main>
      <LegalFooter />
    </div>
  );
}
