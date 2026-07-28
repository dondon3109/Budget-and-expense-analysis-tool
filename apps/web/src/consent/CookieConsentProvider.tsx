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

import {
  CONSENT_STORAGE_KEY,
  DENIED_OPTIONAL_CONSENT,
  createConsentRecord,
  type ConsentPreferences,
  type ConsentRecord,
} from "./consent";
import { updateConsentGate } from "./consentGate";
import { parseConsentRecord, persistConsentRecord, readConsentRecord } from "./consentStorage";

interface CookieConsentContextValue {
  consent: ConsentRecord | null;
  hasDecision: boolean;
  preferences: Readonly<ConsentPreferences>;
  preferencesOpen: boolean;
  preferencesReturnFocus: HTMLElement | null;
  acceptAll: () => void;
  rejectAll: () => void;
  savePreferences: (preferences: ConsentPreferences) => void;
  openPreferences: (returnFocus?: HTMLElement) => void;
  closePreferences: () => void;
}

const CookieConsentContext = createContext<CookieConsentContextValue | null>(null);

export function CookieConsentProvider({ children }: { children: ReactNode }) {
  const [consent, setConsent] = useState<ConsentRecord | null>(readConsentRecord);
  const [preferencesOpen, setPreferencesOpen] = useState(false);
  const preferencesReturnFocusRef = useRef<HTMLElement | null>(null);
  const preferences = consent?.preferences ?? DENIED_OPTIONAL_CONSENT;

  useEffect(() => {
    updateConsentGate(preferences);
  }, [preferences]);

  useEffect(() => {
    function syncConsent(event: StorageEvent) {
      if (event.key !== CONSENT_STORAGE_KEY) return;
      setConsent(parseConsentRecord(event.newValue));
    }

    window.addEventListener("storage", syncConsent);
    return () => window.removeEventListener("storage", syncConsent);
  }, []);

  const closePreferences = useCallback(() => {
    const returnFocus = preferencesReturnFocusRef.current;
    setPreferencesOpen(false);
    window.setTimeout(() => {
      const target = returnFocus?.isConnected
        ? returnFocus
        : document.querySelector<HTMLElement>("[data-cookie-preferences-trigger]");
      target?.focus();
    }, 0);
  }, []);

  const applyDecision = useCallback(
    (nextPreferences: ConsentPreferences, source: ConsentRecord["source"]) => {
      const record = createConsentRecord(nextPreferences, source);
      persistConsentRecord(record);
      setConsent(record);
      closePreferences();
    },
    [closePreferences],
  );

  const acceptAll = useCallback(() => {
    applyDecision({ analytics: true, marketing: true }, "accept_all");
  }, [applyDecision]);

  const rejectAll = useCallback(() => {
    applyDecision({ analytics: false, marketing: false }, "reject_all");
  }, [applyDecision]);

  const savePreferences = useCallback(
    (nextPreferences: ConsentPreferences) => {
      applyDecision(nextPreferences, "custom");
    },
    [applyDecision],
  );

  const openPreferences = useCallback((returnFocus?: HTMLElement) => {
    preferencesReturnFocusRef.current =
      returnFocus ??
      (document.activeElement instanceof HTMLElement ? document.activeElement : null);
    setPreferencesOpen(true);
  }, []);

  const value = useMemo<CookieConsentContextValue>(
    () => ({
      consent,
      hasDecision: consent !== null,
      preferences,
      preferencesOpen,
      preferencesReturnFocus: preferencesReturnFocusRef.current,
      acceptAll,
      rejectAll,
      savePreferences,
      openPreferences,
      closePreferences,
    }),
    [
      acceptAll,
      closePreferences,
      consent,
      openPreferences,
      preferences,
      preferencesOpen,
      rejectAll,
      savePreferences,
    ],
  );

  return <CookieConsentContext.Provider value={value}>{children}</CookieConsentContext.Provider>;
}

export function useCookieConsent(): CookieConsentContextValue {
  const context = useContext(CookieConsentContext);
  if (!context) {
    throw new Error("useCookieConsent must be used within CookieConsentProvider.");
  }
  return context;
}

export function useOptionalCookieConsent(): CookieConsentContextValue | null {
  return useContext(CookieConsentContext);
}
