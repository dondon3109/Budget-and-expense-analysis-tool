import {
  BarChart3,
  FileUp,
  Landmark,
  List,
  LogOut,
  Menu,
  PiggyBank,
  Repeat2,
  X,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { Link, NavLink } from "react-router-dom";

import { useAuth } from "../../auth/AuthProvider";

interface AppShellProps {
  children: ReactNode;
}

const navItems = [
  { label: "Overview", icon: BarChart3, to: "/app" },
  { label: "Transactions", icon: List, to: "/app/transactions" },
  { label: "Import", icon: FileUp, to: "/app/import" },
  { label: "Budgets", icon: PiggyBank, to: "/app/budgets" },
  { label: "Subscriptions", icon: Repeat2, to: "/app/subscriptions" },
];

export function AppShell({ children }: AppShellProps) {
  const { user, signOut } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState<string>();

  async function handleSignOut() {
    setSigningOut(true);
    setSignOutError(undefined);
    try {
      await signOut();
    } catch (error) {
      setSignOutError(error instanceof Error ? error.message : "Sign out could not be completed.");
      setSigningOut(false);
    }
  }

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
        <div className="workspace-pill">
          <span /> Personal workspace
        </div>
        <nav className="side-nav" aria-label="Main navigation">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.label}
                to={item.to}
                end={item.to === "/app"}
                className={({ isActive }) => (isActive ? "nav-item current" : "nav-item")}
                onClick={() => setMenuOpen(false)}
              >
                <Icon size={19} aria-hidden="true" />
                <span>{item.label}</span>
              </NavLink>
            );
          })}
        </nav>

        <div className="sidebar-account">
          <span>Signed in as</span>
          <strong title={user?.email}>{user?.email ?? "Clarity user"}</strong>
          <button
            className="logout-button"
            type="button"
            onClick={() => void handleSignOut()}
            disabled={signingOut}
          >
            <LogOut size={15} aria-hidden="true" /> {signingOut ? "Signing out…" : "Sign out"}
          </button>
          {signOutError && <small role="alert">{signOutError}</small>}
        </div>
        <Link className="back-link" to="/">
          ← Back to introduction
        </Link>
      </aside>
      <main className="app-main">{children}</main>
    </div>
  );
}
