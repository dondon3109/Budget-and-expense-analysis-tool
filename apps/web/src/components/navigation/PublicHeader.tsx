import { Menu, X } from "lucide-react";
import { useRef, useState } from "react";
import { Link } from "react-router-dom";

import { useFocusTrap } from "../../hooks/useFocusTrap";
import { useBodyScrollLock } from "../../hooks/useRootLock";
import { BrandMark } from "../brand/BrandMark";
import { ThemeToggle } from "../theme/ThemeToggle";
import "./PublicHeader.css";

export interface PublicHeaderLink {
  label: string;
  /** Route target, rendered as a client-side link. */
  to?: string;
  /** Same-page anchor target, rendered as a plain anchor. */
  href?: string;
}

/**
 * Route-level navigation shared by every public surface. Pages with in-page
 * sections (the landing page) pass their own anchor links; everything else
 * inherits this default set so the public header never differs per route.
 */
const DEFAULT_LINKS: PublicHeaderLink[] = [
  { label: "Pricing", to: "/pricing" },
  { label: "Guides", to: "/guides" },
  { label: "Tutorials", to: "/tutorials" },
  { label: "FAQ", to: "/faq" },
  { label: "Android Beta", to: "/install" },
];

const DRAWER_ID = "public-header-mobile-nav";

function HeaderLink({ link, onNavigate }: { link: PublicHeaderLink; onNavigate?: () => void }) {
  if (link.to) {
    return (
      <Link to={link.to} onClick={onNavigate}>
        {link.label}
      </Link>
    );
  }
  return (
    <a href={link.href ?? "#top"} onClick={onNavigate}>
      {link.label}
    </a>
  );
}

/**
 * Rendered only while open so useFocusTrap can claim focus on mount and hand it
 * back to the menu button on close. The root lock is intentionally not used:
 * the drawer lives inside the app root, so locking the root would inert it too.
 */
function PublicHeaderDrawer({
  links,
  onClose,
}: {
  links: PublicHeaderLink[];
  onClose: () => void;
}) {
  const drawerRef = useRef<HTMLDivElement>(null);
  const handleKeyDown = useFocusTrap(drawerRef, { onEscape: onClose });

  return (
    <div
      id={DRAWER_ID}
      ref={drawerRef}
      className="public-header-drawer"
      role="dialog"
      aria-modal="true"
      aria-label="Navigation menu"
      onKeyDown={handleKeyDown}
    >
      <nav className="public-header-drawer-links" aria-label="Mobile sections">
        {links.map((link) => (
          <HeaderLink key={link.label} link={link} onNavigate={onClose} />
        ))}
      </nav>
      <div className="public-header-drawer-actions">
        <Link className="public-header-sign-in" to="/login" onClick={onClose}>
          Sign in
        </Link>
        <Link className="button primary" to="/signup" onClick={onClose}>
          Start free
        </Link>
      </div>
    </div>
  );
}

export function PublicHeader({
  links = DEFAULT_LINKS,
  navLabel = "Learn more",
  ctaLabel = "Start free",
  ctaTo = "/signup",
}: {
  links?: PublicHeaderLink[];
  navLabel?: string;
  ctaLabel?: string;
  ctaTo?: string;
} = {}) {
  const [menuOpen, setMenuOpen] = useState(false);
  useBodyScrollLock(menuOpen);

  return (
    <header className="public-header" id="top">
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>

      <Link className="brand public-header-brand" to="/" aria-label="Zoption home">
        <BrandMark className="brand-mark public-header-brand-mark" />
        <span className="brand-wordmark">Zoption</span>
      </Link>

      <nav className="public-header-links" aria-label={navLabel}>
        {links.map((link) => (
          <HeaderLink key={link.label} link={link} />
        ))}
      </nav>

      <div className="public-header-actions">
        <ThemeToggle />
        <Link className="public-header-sign-in" to="/login">
          Sign in
        </Link>
        <Link className="button primary public-header-cta" to={ctaTo}>
          {ctaLabel}
        </Link>
        <button
          type="button"
          className="public-header-menu-toggle"
          aria-label={menuOpen ? "Close navigation menu" : "Open navigation menu"}
          aria-expanded={menuOpen}
          aria-controls={DRAWER_ID}
          onClick={() => setMenuOpen((open) => !open)}
        >
          {menuOpen ? <X size={20} aria-hidden="true" /> : <Menu size={20} aria-hidden="true" />}
        </button>
      </div>

      {menuOpen && <PublicHeaderDrawer links={links} onClose={() => setMenuOpen(false)} />}
    </header>
  );
}
