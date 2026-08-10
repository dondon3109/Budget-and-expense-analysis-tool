import { useId, type ReactNode } from "react";
import { Link } from "react-router-dom";

import { BrandMark } from "../brand/BrandMark";
import { LegalFooter } from "../legal/LegalFooter";
import { ThemeToggle } from "../theme/ThemeToggle";
import "./AuthLayout.css";

export function AuthLayout({
  eyebrow,
  title,
  description,
  children,
  footer,
}: {
  eyebrow: string;
  title: string;
  description: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const headingId = useId();

  return (
    <div className="auth-page-frame">
      <main className="auth-page">
        <section className="auth-card" aria-labelledby={headingId}>
          <div className="auth-card-header">
            <Link className="brand" to="/" aria-label="Zoption home">
              <BrandMark />
              <span>Zoption</span>
            </Link>
            <ThemeToggle />
          </div>
          <div className="auth-heading">
            <p className="eyebrow">{eyebrow}</p>
            <h1 id={headingId}>{title}</h1>
            <p>{description}</p>
          </div>
          {children}
          {footer && <div className="auth-footer">{footer}</div>}
        </section>
        <aside className="auth-aside">
          <p className="eyebrow">Your private workspace</p>
          <h2>Keep your monthly picture in one calm place.</h2>
          <p>
            Import transactions, shape budgets, and return to the same secure workspace anytime.
            Your account begins with no financial records until you add them.
          </p>
          <Link className="text-link" to="/">
            See how Zoption works
          </Link>
        </aside>
      </main>
      <LegalFooter />
    </div>
  );
}
