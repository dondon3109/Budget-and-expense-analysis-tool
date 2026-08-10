import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

export type InstallationStatus =
  | "checking"
  | "supported-awaiting-prompt"
  | "ready"
  | "prompting"
  | "installed"
  | "dismissed"
  | "unsupported-browser"
  | "unsupported-ios-chrome"
  | "unavailable"
  | "failure";

export type InstallationEnvironment = "supported-chrome" | "chrome-ios" | "unsupported-browser";

export interface InstallationState {
  status: InstallationStatus;
  errorMessage?: string;
}

export interface InstallationEnvironmentInput {
  userAgent: string;
  platform?: string;
  maxTouchPoints?: number;
  brands?: readonly { brand: string }[];
  hasBraveApi?: boolean;
}

export interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform?: string }>;
}

interface NavigatorWithInstallationHints extends Navigator {
  brave?: unknown;
  standalone?: boolean;
  userAgentData?: { brands?: readonly { brand: string }[] };
}

interface InstallationContextValue extends InstallationState {
  install: () => Promise<void>;
}

const InstallationContext = createContext<InstallationContextValue | undefined>(undefined);

const ALTERNATIVE_CHROMIUM_MARKERS =
  /\b(?:Edg|EdgA|EdgiOS|OPR|Opera|SamsungBrowser|UCBrowser|YaBrowser|Vivaldi|DuckDuckGo|FxiOS)\//i;

function isAppleMobileEnvironment(input: InstallationEnvironmentInput): boolean {
  if (/\b(?:iPhone|iPad|iPod)\b/i.test(input.userAgent)) return true;
  return input.platform === "MacIntel" && (input.maxTouchPoints ?? 0) > 1;
}

export function detectInstallationEnvironment(
  input: InstallationEnvironmentInput,
): InstallationEnvironment {
  const appleMobile = isAppleMobileEnvironment(input);
  const chromeOnIos = /\bCriOS\//i.test(input.userAgent);

  if (appleMobile) return chromeOnIos ? "chrome-ios" : "unsupported-browser";
  if (input.hasBraveApi || ALTERNATIVE_CHROMIUM_MARKERS.test(input.userAgent)) {
    return "unsupported-browser";
  }

  if (input.brands?.length) {
    return input.brands.some(({ brand }) => brand.toLowerCase() === "google chrome")
      ? "supported-chrome"
      : "unsupported-browser";
  }

  return /\bChrome\/\d+/i.test(input.userAgent) ? "supported-chrome" : "unsupported-browser";
}

function isStandaloneMode(): boolean {
  if (typeof window === "undefined" || typeof navigator === "undefined") return false;

  const installationNavigator = navigator as NavigatorWithInstallationHints;
  return (
    installationNavigator.standalone === true ||
    window.matchMedia?.("(display-mode: standalone)").matches === true
  );
}

function currentEnvironment(): InstallationEnvironment {
  const installationNavigator = navigator as NavigatorWithInstallationHints;
  return detectInstallationEnvironment({
    userAgent: installationNavigator.userAgent,
    platform: installationNavigator.platform,
    maxTouchPoints: installationNavigator.maxTouchPoints,
    brands: installationNavigator.userAgentData?.brands,
    hasBraveApi: Boolean(installationNavigator.brave),
  });
}

export function InstallationProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<InstallationState>({ status: "checking" });
  const deferredPrompt = useRef<BeforeInstallPromptEvent | null>(null);
  const promptWasConsumed = useRef(false);

  useEffect(() => {
    if (isStandaloneMode()) {
      setState({ status: "installed" });
      return;
    }

    const environment = currentEnvironment();
    if (environment === "chrome-ios") {
      setState({ status: "unsupported-ios-chrome" });
      return;
    }
    if (environment !== "supported-chrome") {
      setState({ status: "unsupported-browser" });
      return;
    }

    setState({ status: "supported-awaiting-prompt" });
    const displayMode = window.matchMedia?.("(display-mode: standalone)");

    function handleBeforeInstallPrompt(event: Event) {
      const promptEvent = event as BeforeInstallPromptEvent;
      event.preventDefault();
      if (promptWasConsumed.current) return;
      deferredPrompt.current = promptEvent;
      setState({ status: "ready" });
    }

    function handleAppInstalled() {
      promptWasConsumed.current = true;
      deferredPrompt.current = null;
      setState({ status: "installed" });
    }

    function handleDisplayModeChange(event: MediaQueryListEvent) {
      if (event.matches) handleAppInstalled();
    }

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleAppInstalled);
    displayMode?.addEventListener?.("change", handleDisplayModeChange);

    return () => {
      deferredPrompt.current = null;
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("appinstalled", handleAppInstalled);
      displayMode?.removeEventListener?.("change", handleDisplayModeChange);
    };
  }, []);

  const install = useCallback(async () => {
    const promptEvent = deferredPrompt.current;
    if (!promptEvent) {
      setState({ status: "unavailable" });
      return;
    }

    deferredPrompt.current = null;
    promptWasConsumed.current = true;
    setState({ status: "prompting" });

    try {
      await promptEvent.prompt();
      const choice = await promptEvent.userChoice;
      setState({ status: choice.outcome === "accepted" ? "installed" : "dismissed" });
    } catch {
      setState({
        status: "failure",
        errorMessage:
          "Chrome could not open the installation dialog. Use Chrome's menu to try again.",
      });
    }
  }, []);

  const value = useMemo(() => ({ ...state, install }), [install, state]);
  return <InstallationContext.Provider value={value}>{children}</InstallationContext.Provider>;
}

export function useInstallation(): InstallationContextValue {
  const context = useContext(InstallationContext);
  if (!context) throw new Error("useInstallation must be used within InstallationProvider.");
  return context;
}
