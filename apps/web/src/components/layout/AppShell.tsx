import {
  BookOpen,
  CalendarDays,
  FileUp,
  House,
  List,
  LogOut,
  Menu,
  Milestone,
  PiggyBank,
  Repeat2,
  Settings,
  ShieldCheck,
  Sparkles,
  X,
} from "lucide-react";
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
  type RefObject,
} from "react";
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";

import "../../styles/private-primitives.css";
import "./AppShell.css";
import "../transactions/TransactionForm.css";
import { useAuth } from "../../auth/AuthProvider";
import { useBillingSummary } from "../../hooks/useBillingSummary";
import { avatarPathFromMetadata } from "../../lib/avatar";
import { userWorkspace } from "../../lib/workspace";
import { useFocusTrap } from "../../hooks/useFocusTrap";
import { useBodyScrollLock } from "../../hooks/useRootLock";
import {
  useDiscardUnsavedChanges,
  useHasUnsavedChanges,
} from "../../hooks/useUnsavedChangesWarning";
import { BrandMark } from "../brand/BrandMark";
import { ConfirmDialog } from "../common/ConfirmDialog";
import { LegalFooter } from "../legal/LegalFooter";
import { UserAvatar } from "../profile/UserAvatar";
import { CustomerReviewPrompt } from "../reviews/CustomerReviewPrompt";
import { SupportChat } from "../support/SupportChat";
import { ThemeToggle } from "../theme/ThemeToggle";

interface AppShellProps {
  children: ReactNode;
}

const navItems = [
  { label: "Home", icon: House, to: "/app" },
  { label: "Assistant", icon: Sparkles, to: "/app/assistant" },
  { label: "Calendar", icon: CalendarDays, to: "/app/calendar" },
  { label: "Transactions", icon: List, to: "/app/transactions" },
  { label: "Import", icon: FileUp, to: "/app/import" },
  { label: "Budgets", icon: PiggyBank, to: "/app/budgets" },
  { label: "Goals & debt", icon: Milestone, to: "/app/plan" },
  { label: "Subscriptions", icon: Repeat2, to: "/app/subscriptions" },
];

const adminNavItem = { label: "Admin", icon: ShieldCheck, to: "/app/admin" };

/** What the shell was asked to do while a page still holds unsaved edits. */
type PendingNavigation = {
  action: { kind: "route"; to: string } | { kind: "sign-out" };
  /** Control to focus again when the user chooses to keep editing. */
  opener: HTMLElement | null;
};

/** Compares a link target with the current pathname, ignoring query, hash and a trailing slash. */
function isSamePath(target: string, pathname: string) {
  const strip = (value: string) => (value.length > 1 ? value.replace(/\/+$/, "") : value);
  return strip(target.split(/[?#]/)[0] ?? "") === strip(pathname);
}

const mobileNavItems = [
  { label: "Home", icon: House, to: "/app", end: true },
  { label: "Transactions", icon: List, to: "/app/transactions" },
  { label: "Budgets", icon: PiggyBank, to: "/app/budgets" },
  { label: "Assistant", icon: Sparkles, to: "/app/assistant" },
];

/**
 * The sidebar is mounted at every width so desktop layout and the mobile slide
 * transition keep working, which rules out calling useFocusTrap in AppShell itself:
 * it claims focus on mount and would steal it on first paint. This scope exists only
 * while the drawer is open and publishes the trap's keydown handler to the drawer.
 * Returning focus to the More tab is AppShell's job, one phase after the trap unmounts.
 */
function DrawerFocusScope({
  containerRef,
  closeButtonRef,
  onEscape,
  handlerRef,
}: {
  containerRef: RefObject<HTMLDivElement | null>;
  closeButtonRef: RefObject<HTMLButtonElement | null>;
  onEscape: () => void;
  handlerRef: RefObject<((event: ReactKeyboardEvent<HTMLElement>) => void) | null>;
}) {
  const handleKeyDown = useFocusTrap(containerRef, {
    onEscape,
    initialFocusRef: closeButtonRef,
  });

  useLayoutEffect(() => {
    handlerRef.current = handleKeyDown;
    return () => {
      handlerRef.current = null;
    };
  }, [handleKeyDown, handlerRef]);

  return null;
}

export function AppShell({ children }: AppShellProps) {
  const { user, signOut } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const hasUnsavedChanges = useHasUnsavedChanges();
  const discardUnsavedChanges = useDiscardUnsavedChanges();
  const displayName =
    typeof user?.user_metadata?.display_name === "string"
      ? user.user_metadata.display_name.trim()
      : "";
  const avatarPath = avatarPathFromMetadata(user?.user_metadata);
  const [menuOpen, setMenuOpen] = useState(false);
  const [navCollapsed, setNavCollapsed] = useState(() =>
    typeof window !== "undefined" && window.localStorage
      ? window.localStorage.getItem("zoption:nav-collapsed") === "1"
      : false,
  );
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState<string>();
  const [pendingNavigation, setPendingNavigation] = useState<PendingNavigation>();
  const drawerRef = useRef<HTMLDivElement>(null);
  const drawerCloseButtonRef = useRef<HTMLButtonElement>(null);
  const moreButtonRef = useRef<HTMLButtonElement>(null);
  const drawerKeyDownRef = useRef<((event: ReactKeyboardEvent<HTMLElement>) => void) | null>(null);
  const drawerWasOpenRef = useRef(false);
  const billing = useBillingSummary(userWorkspace(user!));
  const visibleNavItems =
    billing.data?.canManageSponsoredSeats === true ? [...navItems, adminNavItem] : navItems;
  const showSupportChat =
    location.pathname !== "/app/assistant" && location.pathname !== "/app/assistant/";
  const mobilePrimaryRoute = mobileNavItems.some(({ end, to }) =>
    end ? location.pathname === to || location.pathname === `${to}/` : location.pathname === to,
  );

  useBodyScrollLock(menuOpen);

  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  // useFocusTrap hands focus back when it unmounts, but React re-applies the pre-commit
  // focus after mutations and the drawer itself stays mounted, so that restore loses.
  // Return focus to the More tab one phase later, whenever the drawer closes.
  useEffect(() => {
    if (drawerWasOpenRef.current && !menuOpen) moreButtonRef.current?.focus();
    drawerWasOpenRef.current = menuOpen;
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

  /**
   * Holds back an action the shell owns while a page still holds unsaved edits, and asks
   * for confirmation instead. Returns true when the event was intercepted; with no
   * registered dirty page this is a no-op and the router default runs unchanged.
   */
  function interceptNavigation(
    event: ReactMouseEvent<HTMLElement>,
    action: PendingNavigation["action"],
  ): boolean {
    if (!hasUnsavedChanges) return false;
    event.preventDefault();
    setPendingNavigation({ action, opener: event.currentTarget });
    return true;
  }

  /** Click handler for every navigation link the shell renders. */
  function handleShellLinkClick(event: ReactMouseEvent<HTMLAnchorElement>, to: string) {
    // Following the route you are already on cannot discard the draft, so it is not gated.
    if (!isSamePath(to, location.pathname) && interceptNavigation(event, { kind: "route", to })) {
      return;
    }
    setMenuOpen(false);
  }

  function handlePendingNavigationConfirm() {
    const pending = pendingNavigation;
    setPendingNavigation(undefined);
    if (!pending) return;
    // The user chose to throw the edits away, so let the page drop anything it persisted
    // for them. Without this a restored draft would reappear on the next visit.
    discardUnsavedChanges();
    if (pending.action.kind === "route") void navigate(pending.action.to);
    else void handleSignOut();
  }

  return (
    <div className={`app-shell ${navCollapsed ? "nav-collapsed" : ""}`}>
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>

      <header className="mobile-header">
        <Link
          className="brand compact"
          to="/"
          aria-label="Zoption home"
          onClick={(event) => handleShellLinkClick(event, "/")}
        >
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
          <Link
            className="brand"
            to="/"
            aria-label="Zoption home"
            onClick={(event) => handleShellLinkClick(event, "/")}
          >
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
        {/* display: contents keeps this wrapper out of the sidebar's flex layout while
            giving the focus trap a boundary that excludes the desktop-only chrome above. */}
        <div
          className="sidebar-drawer"
          ref={drawerRef}
          onKeyDown={(event) => drawerKeyDownRef.current?.(event)}
        >
          <div className="mobile-menu-header">
            <div>
              <span>Workspace</span>
              <strong>Navigate Zoption</strong>
            </div>
            <button
              ref={drawerCloseButtonRef}
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
              onClick={(event) => handleShellLinkClick(event, "/app/settings#profile-settings")}
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
            {visibleNavItems.map((item) => {
              const Icon = item.icon;
              return (
                <NavLink
                  key={item.label}
                  to={item.to}
                  end={item.to === "/app"}
                  className={({ isActive }) => (isActive ? "nav-item current" : "nav-item")}
                  onClick={(event) => handleShellLinkClick(event, item.to)}
                >
                  <Icon size={19} aria-hidden="true" />
                  <span>{item.label}</span>
                </NavLink>
              );
            })}
          </nav>

          <div className="sidebar-account">
            <NavLink
              to="/app/tutorials"
              className={({ isActive }) =>
                isActive ? "sidebar-account-action current" : "sidebar-account-action"
              }
              onClick={(event) => handleShellLinkClick(event, "/app/tutorials")}
            >
              <BookOpen size={15} aria-hidden="true" /> <span>Tutorials & guide</span>
            </NavLink>
            <NavLink
              to="/app/settings"
              className={({ isActive }) =>
                isActive ? "sidebar-account-action current" : "sidebar-account-action"
              }
              onClick={(event) => handleShellLinkClick(event, "/app/settings")}
            >
              <Settings size={15} aria-hidden="true" /> <span>Account settings</span>
            </NavLink>
            <button
              className="sidebar-account-action"
              type="button"
              onClick={(event) => {
                if (interceptNavigation(event, { kind: "sign-out" })) return;
                void handleSignOut();
              }}
              disabled={signingOut}
            >
              <LogOut size={15} aria-hidden="true" />{" "}
              <span>{signingOut ? "Signing out…" : "Sign out"}</span>
            </button>
            {signOutError && <small role="alert">{signOutError}</small>}
          </div>
          <Link
            className="back-link"
            to="/"
            onClick={(event) => handleShellLinkClick(event, "/")}
          >
            ← Back to introduction
          </Link>
        </div>
      </aside>
      {menuOpen && (
        <DrawerFocusScope
          containerRef={drawerRef}
          closeButtonRef={drawerCloseButtonRef}
          onEscape={() => setMenuOpen(false)}
          handlerRef={drawerKeyDownRef}
        />
      )}
      <main className="app-main" id="main-content" tabIndex={-1}>
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
              onClick={(event) => handleShellLinkClick(event, item.to)}
            >
              <Icon size={20} aria-hidden="true" />
              <span>{item.label}</span>
            </NavLink>
          );
        })}
        <button
          ref={moreButtonRef}
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
      {pendingNavigation && (
        <ConfirmDialog
          title="Discard unsaved changes?"
          consequence="Your unsaved changes will be lost. This cannot be undone."
          confirmLabel={
            pendingNavigation.action.kind === "sign-out" ? "Discard and sign out" : "Discard changes"
          }
          cancelLabel="Keep editing"
          returnFocus={pendingNavigation.opener}
          onConfirm={handlePendingNavigationConfirm}
          onClose={() => setPendingNavigation(undefined)}
        />
      )}
      {showSupportChat && (
        <SupportChat surface="app" workspace={user ? userWorkspace(user) : undefined} />
      )}
      {user &&
        location.pathname !== "/app/admin" &&
        !location.pathname.startsWith("/app/admin/") && (
          <CustomerReviewPrompt user={user} workspace={userWorkspace(user)} />
        )}
    </div>
  );
}
