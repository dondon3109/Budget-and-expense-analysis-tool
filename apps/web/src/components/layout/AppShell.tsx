import { BarChart3, FileUp, Landmark, List, Menu, PiggyBank, X } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Link, NavLink } from "react-router-dom";

interface AppShellProps {
  children: ReactNode;
}

const navItems = [
  { label: "Overview", icon: BarChart3, to: "/demo" },
  { label: "Transactions", icon: List, to: "/transactions" },
  { label: "Import", icon: FileUp, to: "/import" },
  { label: "Budgets", icon: PiggyBank, to: "/budgets" },
];

export function AppShell({ children }: AppShellProps) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="app-shell">
      <header className="mobile-header">
        <Link className="brand compact" to="/" aria-label="Clarity home">
          <span className="brand-mark">
            <Landmark size={19} aria-hidden="true" />
          </span>
          <span>Clarity</span>
        </Link>
        <button
          className="icon-button"
          type="button"
          onClick={() => setMenuOpen((open) => !open)}
          aria-label={menuOpen ? "Close navigation" : "Open navigation"}
          aria-expanded={menuOpen}
        >
          {menuOpen ? <X size={21} /> : <Menu size={21} />}
        </button>
      </header>

      <aside className={`sidebar ${menuOpen ? "open" : ""}`}>
        <Link className="brand" to="/" aria-label="Clarity home">
          <span className="brand-mark">
            <Landmark size={20} aria-hidden="true" />
          </span>
          <span>Clarity</span>
        </Link>
        <div className="demo-pill">
          <span /> Demo workspace
        </div>
        <nav className="side-nav" aria-label="Main navigation">
          {navItems.map((item) => {
            const Icon = item.icon;
            if (item.to) {
              return (
                <NavLink
                  key={item.label}
                  to={item.to}
                  className={({ isActive }) => (isActive ? "nav-item current" : "nav-item")}
                  onClick={() => setMenuOpen(false)}
                >
                  <Icon size={19} aria-hidden="true" />
                  <span>{item.label}</span>
                </NavLink>
              );
            }
            return (
              <button
                key={item.label}
                type="button"
                className="nav-item"
                aria-disabled="true"
                title="Coming in the next milestone"
              >
                <Icon size={19} aria-hidden="true" />
                <span>{item.label}</span>
                <small>Soon</small>
              </button>
            );
          })}
        </nav>
        <div className="privacy-card">
          <strong>Demo data only</strong>
          <p>Do not upload sensitive financial information.</p>
        </div>
        <Link className="back-link" to="/">
          ← Back to introduction
        </Link>
      </aside>
      <main className="app-main">{children}</main>
    </div>
  );
}
