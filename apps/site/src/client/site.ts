/**
 * The public site's only always-loaded script. Pages are static HTML; this
 * wires the behavior their markup declares through `data-*` hooks. Each block
 * is a no-op on pages without its markup. React loads only on pages with an
 * island, and PostHog only after analytics consent.
 */
import {
  createConsentRecord,
  DENIED_OPTIONAL_CONSENT,
  CONSENT_STORAGE_KEY,
  type ConsentDecisionSource,
  type ConsentPreferences,
} from "@zoption/web-common/consent";
import { registerOptionalIntegration, updateConsentGate } from "@zoption/web-common/consent-gate";
import {
  parseConsentRecord,
  persistConsentRecord,
  readConsentRecord,
} from "@zoption/web-common/consent-storage";

const THEMES = ["light", "dark", "coffee"] as const;
type Theme = (typeof THEMES)[number];
const THEME_STORAGE_KEY = "zoption-theme";
// Mirrors public/theme-bootstrap.js, which applies the theme before first paint.
const THEME_COLORS: Record<Theme, string> = {
  light: "#f1f3f2",
  dark: "#080b0a",
  coffee: "#ece3d5",
};

function isTheme(value: unknown): value is Theme {
  return THEMES.some((theme) => theme === value);
}

function currentTheme(): Theme {
  const theme = document.documentElement.dataset.theme;
  return isTheme(theme) ? theme : "light";
}

function applyTheme(theme: Theme) {
  const root = document.documentElement;
  root.dataset.theme = theme;
  root.style.colorScheme = theme === "dark" ? "dark" : "light";
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", THEME_COLORS[theme]);
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // The choice still applies to this page when storage is unavailable.
  }
}

export function setupThemeMenu() {
  const wrapper = document.querySelector<HTMLElement>("[data-theme-menu]");
  const trigger = wrapper?.querySelector<HTMLButtonElement>("[data-theme-trigger]");
  const menu = trigger && document.getElementById(trigger.getAttribute("aria-controls") ?? "");
  if (!wrapper || !trigger || !menu) return;
  const options = [...menu.querySelectorAll<HTMLButtonElement>("[data-theme-option]")];

  function syncChecked() {
    const theme = currentTheme();
    for (const option of options) {
      option.setAttribute("aria-checked", String(option.dataset.themeOption === theme));
    }
  }

  function setOpen(open: boolean, focusTrigger = false) {
    menu!.hidden = !open;
    trigger!.setAttribute("aria-expanded", String(open));
    if (open) {
      syncChecked();
      options.find((option) => option.dataset.themeOption === currentTheme())?.focus();
    } else if (focusTrigger) {
      trigger!.focus();
    }
  }

  trigger.addEventListener("click", () => setOpen(menu.hidden !== false));
  trigger.addEventListener("keydown", (event) => {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    event.preventDefault();
    setOpen(true);
  });
  menu.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false, true);
      return;
    }
    if (event.key === "Tab") {
      setOpen(false);
      return;
    }
    const index = options.indexOf(document.activeElement as HTMLButtonElement);
    const step =
      event.key === "ArrowDown" || event.key === "ArrowRight"
        ? 1
        : event.key === "ArrowUp" || event.key === "ArrowLeft"
          ? -1
          : 0;
    if (!step) return;
    event.preventDefault();
    options[(Math.max(index, 0) + step + options.length) % options.length]?.focus();
  });
  for (const option of options) {
    option.addEventListener("click", () => {
      if (isTheme(option.dataset.themeOption)) applyTheme(option.dataset.themeOption);
      setOpen(false, true);
    });
  }
  document.addEventListener("pointerdown", (event) => {
    if (!menu.hidden && !wrapper.contains(event.target as Node)) setOpen(false);
  });
}

export function setupDrawer() {
  const toggle = document.querySelector<HTMLButtonElement>("[data-drawer-toggle]");
  const drawer = toggle && document.getElementById(toggle.getAttribute("aria-controls") ?? "");
  if (!toggle || !drawer) return;

  function setOpen(open: boolean) {
    drawer!.hidden = !open;
    toggle!.setAttribute("aria-expanded", String(open));
    toggle!.setAttribute("aria-label", open ? "Close navigation menu" : "Open navigation menu");
    document.body.style.overflow = open ? "hidden" : "";
    if (open) drawer!.querySelector<HTMLElement>("a")?.focus();
  }

  toggle.addEventListener("click", () => setOpen(drawer.hidden !== false));
  drawer.addEventListener("click", (event) => {
    if ((event.target as Element).closest("a")) setOpen(false);
  });
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape" || drawer.hidden) return;
    setOpen(false);
    toggle.focus();
  });
}

/**
 * A pill group (`data-filter-controls`) and an optional search box
 * (`data-filter-search`) narrow the items in the matching `data-filter-items`.
 */
export function setupFilters() {
  for (const list of document.querySelectorAll<HTMLElement>("[data-filter-items]")) {
    const name = list.dataset.filterItems;
    const controls = document.querySelector<HTMLElement>(`[data-filter-controls="${name}"]`);
    const search = document.querySelector<HTMLInputElement>(`[data-filter-search="${name}"]`);
    const pills = [...(controls?.querySelectorAll<HTMLButtonElement>("[data-filter-value]") ?? [])];
    const items = [...list.querySelectorAll<HTMLElement>(":scope > [data-filter-value]")];
    const empty = list.querySelector<HTMLElement>("[data-filter-empty]");
    let category = "all";

    function apply() {
      const query = search?.value.trim().toLowerCase() ?? "";
      let shown = 0;
      for (const item of items) {
        const visible =
          (category === "all" || item.dataset.filterValue === category) &&
          (!query ||
            (item.dataset.filterText ?? item.textContent ?? "").toLowerCase().includes(query));
        item.hidden = !visible;
        if (visible) shown += 1;
      }
      if (empty) empty.hidden = shown > 0;
      for (const pill of pills) {
        const active = pill.dataset.filterValue === category;
        pill.classList.toggle("active", active);
        pill.setAttribute("aria-pressed", String(active));
      }
    }

    for (const pill of pills) {
      pill.addEventListener("click", () => {
        category = pill.dataset.filterValue ?? "all";
        apply();
      });
    }
    search?.addEventListener("input", apply);
    list.querySelector("[data-filter-reset]")?.addEventListener("click", () => {
      category = "all";
      if (search) search.value = "";
      apply();
    });
  }
}

export function setupPricingInterval() {
  const root = document.querySelector<HTMLElement>("[data-active-interval]");
  if (!root) return;
  const choices = [...root.querySelectorAll<HTMLButtonElement>("[data-interval-choice]")];
  for (const choice of choices) {
    choice.addEventListener("click", () => {
      root.dataset.activeInterval = choice.dataset.intervalChoice;
      for (const other of choices) {
        const active = other === choice;
        other.classList.toggle("active", active);
        other.setAttribute("aria-checked", String(active));
      }
    });
  }
}

/** A shared `#answer` link opens that disclosure instead of landing on a closed row. */
export function setupDisclosureAnchors() {
  function openTarget() {
    const id = decodeURIComponent(location.hash.slice(1));
    const target = id ? document.getElementById(id) : null;
    if (target instanceof HTMLDetailsElement) target.open = true;
  }
  openTarget();
  window.addEventListener("hashchange", openTarget);
}

export function setupStickyCta() {
  const cta = document.querySelector<HTMLElement>("[data-sticky-cta]");
  if (!cta) return;
  const sync = () => {
    cta.hidden = window.scrollY <= 280;
  };
  window.addEventListener("scroll", sync, { passive: true });
  sync();
}

// Legal pages are where a visitor reads what they are consenting to, so the banner stays off them.
const CONSENT_BANNER_EXCLUDED_PATHS = new Set([
  "/cookie-policy",
  "/privacy-policy",
  "/terms-of-service",
]);

export function setupConsent() {
  const banner = document.querySelector<HTMLElement>("[data-consent-banner]");
  const dialog = document.querySelector<HTMLDialogElement>("[data-consent-dialog]");
  if (!banner || !dialog) return;
  const toggles = [...dialog.querySelectorAll<HTMLInputElement>("[data-consent-category]")];

  function sync(preferences: Readonly<ConsentPreferences>, decided: boolean) {
    updateConsentGate(preferences);
    banner!.hidden = decided || CONSENT_BANNER_EXCLUDED_PATHS.has(location.pathname);
  }

  function decide(source: ConsentDecisionSource) {
    const preferences: ConsentPreferences =
      source === "accept_all"
        ? { analytics: true, marketing: true }
        : source === "reject_all"
          ? { ...DENIED_OPTIONAL_CONSENT }
          : {
              analytics: toggles.some(
                (t) => t.dataset.consentCategory === "analytics" && t.checked,
              ),
              marketing: toggles.some(
                (t) => t.dataset.consentCategory === "marketing" && t.checked,
              ),
            };
    persistConsentRecord(createConsentRecord(preferences, source));
    sync(preferences, true);
    if (dialog!.open) dialog!.close();
  }

  const record = readConsentRecord();
  sync(record?.preferences ?? DENIED_OPTIONAL_CONSENT, record !== null);

  document.addEventListener("click", (event) => {
    const target = event.target as Element;
    const action = target.closest<HTMLElement>("[data-consent-action]")?.dataset.consentAction;
    if (action === "accept_all" || action === "reject_all" || action === "custom") {
      decide(action);
      return;
    }
    if (target.closest("[data-cookie-preferences-trigger]")) {
      const preferences = readConsentRecord()?.preferences ?? DENIED_OPTIONAL_CONSENT;
      for (const toggle of toggles) {
        const category = toggle.dataset.consentCategory;
        toggle.checked =
          category === "analytics" || category === "marketing" ? preferences[category] : false;
      }
      dialog.showModal();
    }
  });

  // A decision in another tab applies here too, including a revocation.
  window.addEventListener("storage", (event) => {
    if (event.key !== CONSENT_STORAGE_KEY) return;
    const next = parseConsentRecord(event.newValue);
    sync(next?.preferences ?? DENIED_OPTIONAL_CONSENT, next !== null);
  });
}

/** Wires every behavior on the current page. The layout calls it once per page load. */
export function startSite() {
  setupThemeMenu();
  setupDrawer();
  setupFilters();
  setupPricingInterval();
  setupDisclosureAnchors();
  setupStickyCta();
  registerOptionalIntegration("analytics", async () =>
    (await import("./analytics")).startAnalytics(),
  );
  setupConsent();
}
