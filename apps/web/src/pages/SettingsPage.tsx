import { useEffect } from "react";
import { useLocation, useSearchParams } from "react-router-dom";

import { useAuth } from "../auth/AuthProvider";
import { BillingSettings } from "../components/account/BillingSettings";
import { CurrencySettings } from "../components/account/CurrencySettings";
import { DangerZoneSettings } from "../components/account/DangerZoneSettings";
import { DataPortabilitySettings } from "../components/account/DataPortabilitySettings";
import { DefaultSpendingAccountSettings } from "../components/account/DefaultSpendingAccountSettings";
import { EmailSettings } from "../components/account/EmailSettings";
import { HelpAndContactSettings } from "../components/account/HelpAndContactSettings";
import { PasswordSettings } from "../components/account/PasswordSettings";
import { ProfileSettings } from "../components/account/ProfileSettings";
import { VoiceLanguageSettings } from "../components/account/VoiceLanguageSettings";
import { AppShell } from "../components/layout/AppShell";
import { CustomerReviewSettings } from "../components/reviews/CustomerReviewSettings";
import { userWorkspace } from "../lib/workspace";
import "./SettingsPage.css";
// Each section's rules used to sit in SettingsPage.css in this order, so they load right after it.
import "../components/account/ProfileSettings.css";
import "../components/account/PasswordSettings.css";
import "../components/account/EmailSettings.css";
import "../components/account/HelpAndContactSettings.css";
import "../components/account/DangerZoneSettings.css";
import "../components/account/DataPortabilitySettings.css";
import "../components/account/VoiceLanguageSettings.css";

const SETTINGS_SECTION_BY_HASH: Record<string, string> = {
  "#profile-settings": "profile-settings",
  "#plan-and-billing": "plan-and-billing",
  "#customer-review": "customer-review",
  "#help-and-contact": "help-and-contact",
  "#help": "help",
  "#contact": "contact",
  "#data-portability": "data-portability",
  "#default-spending-account": "default-spending-account",
  "#workspace-currency": "workspace-currency",
  "#voice-language": "voice-language",
  "#voice-settings": "voice-language",
};

export function SettingsPage() {
  const { user } = useAuth();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const currentEmail = user?.email ?? "";
  const hasPasswordIdentity = user?.identities
    ? user.identities.some((identity) => identity.provider === "email")
    : Boolean(currentEmail);

  useEffect(() => {
    const sectionId = SETTINGS_SECTION_BY_HASH[location.hash];
    if (!sectionId) return;

    const frame = window.requestAnimationFrame(() => {
      const section = document.getElementById(sectionId);
      section?.scrollIntoView({ behavior: "smooth", block: "start" });
      section?.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [location.hash]);

  const emailConfirmationProcessed = searchParams.get("emailChange") === "confirmed";

  return (
    <AppShell>
      <div className="dashboard-page settings-page">
        <header className="dashboard-header">
          <div className="dashboard-heading">
            <p className="eyebrow">Your account</p>
            <h1>Account Settings</h1>
            <p>Keep your identity and sign-in details accurate and secure.</p>
          </div>
        </header>

        {emailConfirmationProcessed && (
          <div className="settings-notice" role="status">
            <strong>Confirmation link processed.</strong>
            <span>
              Your current account email is shown below. If it has not changed yet, complete the
              confirmation sent to the other address.
            </span>
          </div>
        )}

        <div className="settings-sections">
          <ProfileSettings />

          <EmailSettings />

          <PasswordSettings hasPasswordIdentity={hasPasswordIdentity} />

          <VoiceLanguageSettings />

          {user && <CurrencySettings workspace={userWorkspace(user)} />}

          {user && <DefaultSpendingAccountSettings workspace={userWorkspace(user)} />}

          {user && <CustomerReviewSettings workspace={userWorkspace(user)} />}

          {user && <BillingSettings user={user} />}

          <HelpAndContactSettings />

          <DataPortabilitySettings />

          <DangerZoneSettings hasPasswordIdentity={hasPasswordIdentity} />
        </div>
      </div>
    </AppShell>
  );
}
