import { CookieConsentBanner } from "./CookieConsentBanner";
import { CookiePreferencesDialog } from "./CookiePreferencesDialog";
import "./cookieConsent.css";

export function CookieConsentExperience() {
  return (
    <>
      <CookieConsentBanner />
      <CookiePreferencesDialog />
    </>
  );
}
