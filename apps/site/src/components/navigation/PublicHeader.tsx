import { Check, Coffee, Menu, Moon, Sun, X } from "lucide-react";

import { BrandMark } from "../brand/BrandMark";
import { appUrl } from "../../lib/appUrl";
import "../theme/ThemeToggle.css";
import "./PublicHeader.css";

export interface PublicHeaderLink {
  label: string;
  href: string;
  /**
   * Drops the link from the desktop row on viewports too narrow to hold the whole
   * set. The drawer still lists it, so the destination stays reachable.
   */
  secondary?: boolean;
}

/**
 * Route-level navigation shared by every public surface. Pages with in-page
 * sections (the landing page) pass their own anchor links; everything else
 * inherits this default set so the public header never differs per route.
 */
const DEFAULT_LINKS: PublicHeaderLink[] = [
  { label: "Pricing", href: "/pricing" },
  { label: "Guides", href: "/guides" },
  { label: "Tutorials", href: "/tutorials" },
  { label: "FAQ", href: "/faq" },
  { label: "Android Beta", href: "/install" },
];

const THEME_OPTIONS = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "coffee", label: "Coffee", icon: Coffee },
] as const;

const DRAWER_ID = "public-header-mobile-nav";
const THEME_MENU_ID = "public-header-theme-menu";

/**
 * Static markup only. `src/client/site.ts` wires the drawer and the theme menu
 * through the `data-*` hooks, so the header costs no framework on any page.
 */
export function PublicHeader({
  links = DEFAULT_LINKS,
  navLabel = "Learn more",
  ctaLabel = "Start free",
  ctaHref = appUrl("/signup"),
}: {
  links?: PublicHeaderLink[];
  navLabel?: string;
  ctaLabel?: string;
  ctaHref?: string;
} = {}) {
  // The toggle only earns its place next to a trimmed row; without secondary links
  // the row keeps every link at every width and stays hamburger-free until 960px.
  const hasSecondaryLinks = links.some((link) => link.secondary);

  return (
    <header
      className={hasSecondaryLinks ? "public-header has-secondary-links" : "public-header"}
      id="top"
    >
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>

      <a className="brand public-header-brand" href="/" aria-label="Zoption home">
        <BrandMark className="brand-mark public-header-brand-mark" />
        <span className="brand-wordmark">Zoption</span>
      </a>

      <nav className="public-header-links" aria-label={navLabel}>
        {links.map((link) => (
          <a
            key={link.label}
            className={link.secondary ? "is-secondary" : undefined}
            href={link.href}
          >
            {link.label}
          </a>
        ))}
      </nav>

      <div className="public-header-actions">
        <div className="theme-menu" data-theme-menu>
          <button
            className="theme-toggle"
            type="button"
            aria-haspopup="menu"
            aria-expanded="false"
            aria-controls={THEME_MENU_ID}
            title="Choose theme"
            data-theme-trigger
          >
            {/* The accessible name must contain the visible theme label (WCAG 2.5.3),
                so it is built from this text plus that label, not an aria-label. */}
            <span className="sr-only">Choose theme: </span>
            {THEME_OPTIONS.map((option) => {
              const Icon = option.icon;
              return (
                <span
                  key={option.value}
                  className="theme-toggle-current"
                  data-theme-current={option.value}
                >
                  <Icon size={17} aria-hidden="true" />
                  <span>{option.label}</span>
                </span>
              );
            })}
          </button>
          <div
            id={THEME_MENU_ID}
            className="theme-menu-popover"
            role="menu"
            aria-label="Choose theme"
            hidden
          >
            {THEME_OPTIONS.map((option) => {
              const Icon = option.icon;
              return (
                <button
                  key={option.value}
                  type="button"
                  className="theme-menu-option"
                  role="menuitemradio"
                  aria-checked="false"
                  data-theme-option={option.value}
                >
                  <Icon size={16} aria-hidden="true" />
                  <span>{option.label}</span>
                  <Check className="theme-menu-check" size={15} aria-hidden="true" />
                </button>
              );
            })}
          </div>
        </div>
        <a className="public-header-sign-in" href={appUrl("/login")}>
          Sign in
        </a>
        <a className="button primary public-header-cta" href={ctaHref}>
          {ctaLabel}
        </a>
        <button
          type="button"
          className="public-header-menu-toggle"
          aria-label="Open navigation menu"
          aria-expanded="false"
          aria-controls={DRAWER_ID}
          data-drawer-toggle
        >
          <Menu className="public-header-menu-open" size={20} aria-hidden="true" />
          <X className="public-header-menu-close" size={20} aria-hidden="true" />
        </button>
      </div>

      <div
        id={DRAWER_ID}
        className="public-header-drawer"
        role="dialog"
        aria-modal="true"
        aria-label="Navigation menu"
        hidden
      >
        <nav className="public-header-drawer-links" aria-label="Mobile sections">
          {links.map((link) => (
            <a key={link.label} href={link.href}>
              {link.label}
            </a>
          ))}
        </nav>
        <div className="public-header-drawer-actions">
          <a className="public-header-sign-in" href={appUrl("/login")}>
            Sign in
          </a>
          <a className="button primary" href={appUrl("/signup")}>
            Start free
          </a>
        </div>
      </div>
    </header>
  );
}
