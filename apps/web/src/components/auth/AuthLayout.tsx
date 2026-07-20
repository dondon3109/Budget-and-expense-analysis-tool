import { Landmark } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";

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
  return (
    <main className="auth-page">
      <section className="auth-card">
        <Link className="brand" to="/" aria-label="Clarity home">
          <span className="brand-mark">
            <Landmark size={20} aria-hidden="true" />
          </span>
          <span>Clarity</span>
        </Link>
        <div className="auth-heading">
          <p className="eyebrow">{eyebrow}</p>
          <h1>{title}</h1>
          <p>{description}</p>
        </div>
        {children}
        {footer && <div className="auth-footer">{footer}</div>}
      </section>
      <aside className="auth-aside">
        <p className="eyebrow">Your private workspace</p>
        <h2>Keep your monthly picture in one calm place.</h2>
        <p>Import transactions, shape budgets, and return to the same secure workspace anytime.</p>
        <Link className="text-link" to="/demo">
          Prefer to look around first? Open the read-only demo.
        </Link>
      </aside>
    </main>
  );
}
