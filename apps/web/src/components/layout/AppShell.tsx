import {
  CalendarDays,
  CircleUserRound,
  FileUp,
  House,
  List,
  LogOut,
  Menu,
  Milestone,
  PiggyBank,
  Repeat2,
  Settings,
  Sparkles,
  X,
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";

import "../../styles/private-primitives.css";
import "./AppShell.css";
import "../transactions/TransactionForm.css";
import { useAuth } from "../../auth/AuthProvider";
import { avatarPathFromMetadata } from "../../lib/avatar";
import { userWorkspace } from "../../lib/workspace";
import { useBodyScrollLock } from "../../hooks/useRootLock";
import { BrandMark } from "../brand/BrandMark";
import { LegalFooter } from "../legal/LegalFooter";
import { UserAvatar } from "../profile/UserAvatar";
import { CustomerReviewPrompt } from "../reviews/CustomerReviewPrompt";
import { SupportChat } from "../support/SupportChat";
import { ThemeToggle } from "../theme/ThemeToggle";

interface AppShellProps {
  children: ReactNode;
}

const navItems = [
  { label: "Profile", icon: CircleUserRound, to: "/app" },
  { label: "Assistant", icon: Sparkles, to: "/app/assistant" },
  { label: "Calendar", icon: CalendarDays, to: "/app/calendar" },
  { label: "Transactions", icon: List, to: "/app/transactions" },
  { label: "Import", icon: FileUp, to: "/app/import" },
  { label: "Budgets", icon: PiggyBank, to: "/app/budgets" },
  { label: "Goals & debt", icon: Milestone, to: "/app/plan" },
  { label: "Subscriptions", icon: Repeat2, to: "/app/subscriptions" },
];

const mobileNavItems = [
  { label: "Home", icon: House, to: "/app", end: true },
  { label: "Transactions", icon: List, to: "/app/transactions" },
  { label: "Calendar", icon: CalendarDays, to: "/app/calendar" },
  { label: "Budgets", icon: PiggyBank, to: "/app/budgets" },
];

export function AppShell({ children }: AppShellProps) {
  const { user, signOut } = useAuth();
  const location = useLocation();
  const displayName =
    typeof user?.user_metadata?.display_name === "string"
      ? user.user_metadata.display_name.trim()
      : "";
  const avatarPath = avatarPathFromMetadata(user?.user_metadata);
  const [menuOpen, setMenuOpen] = useState(false);
  const [navCollapsed, setNavCollapsed] = useState(
    () => (typeof window !== "undefined" && window.localStorage ? window.localStorage.getItem("zoption:nav-collapsed") === "1" : false),
  );
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState<string>();
  const showSupportChat =
    location.pathname !== "/app/assistant" && location.pathname !== "/app/assistant/";
  const mobilePrimaryRoute = mobileNavItems.some(({ end, to }) =>
    end ? location.pathname === to || location.pathname === `${to}/` : location.pathname === to,
  );

  useBodyScrollLock(menuOpen);

  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!menuOpen) return undefined;

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setMenuOpen(false);
    }

    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [menuOpen]);

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
    <div className={`app-shell ${navCollapsed ? "nav-collapsed" : ""}`}>
      <header className="mobile-header">
        <Link className="brand compact" to="/" aria-label="Zoption home">
          <BrandMark />
          <span className="brand-wordmark">Zoption</span>
        </Link>
        <div className="mobile-header-actions">
          <ThemeToggle />
          <button
            className="icon-button mobile-header-menu"
            type="button"
            onClick={() => setMenuOpen((open) => !open)}
            aria-label={menuOpen ? "Close navigation" : "Open navigation"}
            aria-expanded={menuOpen}
            aria-controls="primary-navigation"
          >
            {menuOpen ? <X size={21} /> : <Menu size={21} />}
          </button>
        </div>
      </header>

      <button
        className={`mobile-nav-backdrop ${menuOpen ? "open" : ""}`}
        type="button"
        aria-label="Close navigation"
        tabIndex={menuOpen ? 0 : -1}
        onClick={() => setMenuOpen(false)}
      />

      <aside className={`sidebar ${menuOpen ? "open" : ""}`}>
        <div className="sidebar-toggle-row">
          <Link className="brand" to="/" aria-label="Zoption home">
            <BrandMark />
            <span className="brand-wordmark">Zoption</span>
          </Link>
          <button
            className="icon-button nav-collapse-toggle"
            type="button"
            onClick={() =>
              setNavCollapsed((collapsed) => {
                const next = !collapsed;
                window.localStorage.setItem("zoption:nav-collapsed", next ? "1" : "0");
                return next;
              })
            }
            aria-pressed={navCollapsed}
            aria-controls="primary-navigation"
            aria-label={navCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            <Menu size={20} />
          </button>
        </div>
        <div className="mobile-menu-header">
          <div>
            <span>Workspace</span>
            <strong>Navigate Zoption</strong>
          </div>
          <button
            className="icon-button"
            type="button"
            onClick={() => setMenuOpen(false)}
            aria-label="Close navigation"
          >
            <X size={21} />
          </button>
        </div>
        <div className="sidebar-profile">
          <Link
            className="sidebar-account-identity"
            to="/app/settings#profile-settings"
            aria-label="Open profile settings"
            onClick={() => setMenuOpen(false)}
          >
            <UserAvatar
              avatarPath={avatarPath}
              displayName={displayName}
              email={user?.email}
              alt=""
            />
            <div>
              <span>Signed in as</span>
              <strong title={displayName || user?.email}>
                {displayName || user?.email || "Zoption user"}
              </strong>
            </div>
          </Link>
          <div className="sidebar-profile-theme">
            <span>Appearance</span>
            <ThemeToggle />
          </div>
        </div>
        <div className="sidebar-profile-divider" aria-hidden="true" />

        <nav id="primary-navigation" className="side-nav" aria-label="Main navigation">
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
          <NavLink
            to="/app/settings"
            className={({ isActive }) =>
              isActive ? "sidebar-account-action current" : "sidebar-account-action"
            }
            onClick={() => setMenuOpen(false)}
          >
            <Settings size={15} aria-hidden="true" /> <span>Account settings</span>
          </NavLink>
          <button
            className="sidebar-account-action"
            type="button"
            onClick={() => void handleSignOut()}
            disabled={signingOut}
          >
            <LogOut size={15} aria-hidden="true" />{" "}
            <span>{signingOut ? "Signing out…" : "Sign out"}</span>
          </button>
          {signOutError && <small role="alert">{signOutError}</small>}
        </div>
        <Link className="back-link" to="/">
          ← Back to introduction
        </Link>
      </aside>
      <main className="app-main">
        <div className="app-main-content">{children}</div>
        <LegalFooter />
      </main>

      <nav className="mobile-tab-bar" aria-label="Mobile navigation">
        {mobileNavItems.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.label}
              to={item.to}
              end={item.end}
              aria-label={`${item.label} tab`}
              className={({ isActive }) =>
                isActive ? "mobile-tab-item current" : "mobile-tab-item"
              }
              onClick={() => setMenuOpen(false)}
            >
              <Icon size={20} aria-hidden="true" />
              <span>{item.label}</span>
            </NavLink>
          );
        })}
        <button
          className={`mobile-tab-item ${menuOpen || !mobilePrimaryRoute ? "current" : ""}`}
          type="button"
          onClick={() => setMenuOpen((open) => !open)}
          aria-label={menuOpen ? "Close menu" : "Open menu"}
          aria-expanded={menuOpen}
          aria-controls="primary-navigation"
        >
          {menuOpen ? <X size={20} aria-hidden="true" /> : <Menu size={20} aria-hidden="true" />}
          <span>More</span>
        </button>
      </nav>
      {showSupportChat && (
        <SupportChat surface="app" workspace={user ? userWorkspace(user) : undefined} />
      )}
      {user && !location.pathname.startsWith("/app/admin/") && (
        <CustomerReviewPrompt user={user} workspace={userWorkspace(user)} />
      )}
    </div>
  );
}
