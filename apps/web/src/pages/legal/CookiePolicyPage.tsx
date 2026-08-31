import { Link } from "react-router-dom";

import { LegalPageLayout } from "../../components/legal/LegalPageLayout";
import { useCookieConsent } from "../../consent/CookieConsentProvider";

export function CookiePolicyPage() {
  const { openPreferences } = useCookieConsent();

  return (
    <LegalPageLayout
      title="Cookie Policy"
      summary="This policy explains the cookies and similar browser storage Zoption uses, what is necessary, and how optional categories remain blocked until you choose them."
      lastUpdated="August 24, 2026"
    >
      <section>
        <h2>1. Cookies and similar technologies</h2>
        <p>
          “Cookies” is often used as a general label, but websites can also use localStorage, SDKs,
          pixels, iframes, and related browser technologies. Zoption currently uses browser storage
          for theme choice, this consent record, a remembered transaction sort preference,
          release-update acknowledgments, and Supabase authentication/session operation.
        </p>
      </section>

      <section>
        <h2>2. Categories</h2>
        <h3>Necessary — always on</h3>
        <p>
          Necessary technology supports account security and sign-in, remembers your theme, stores
          this browser&apos;s privacy choice, and provides core service behavior. It cannot be
          disabled through Cookie Settings because the application may not work correctly without
          it.
        </p>
        <h3>Analytics — off by default</h3>
        <p>
          Zoption uses PostHog for privacy-preserving, cookieless aggregate usage and Core Web
          Vitals (LCP, CLS, INP) performance measurement on public pages. PostHog operates in
          cookieless, memory-only mode without setting analytics cookies, storing persistent device
          identifiers, or creating person profiles. Zoption does not send your financial workspace
          data, account credentials, or assistant conversations to the analytics platform.
        </p>
        <h3>Marketing — off by default</h3>
        <p>
          Marketing technology could support advertising or campaign measurement. No marketing
          provider is currently enabled. Any future marketing technology must remain blocked until
          you explicitly enable Marketing.
        </p>
      </section>

      <section>
        <h2>3. Your choice</h2>
        <p>
          On a first visit, Zoption offers Accept All, Reject All, and Manage Preferences. Necessary
          is always on; Analytics and Marketing start off. Your versioned choice is stored on this
          browser and can be changed later.
        </p>
        <p>
          <button
            type="button"
            className="button secondary"
            data-cookie-preferences-trigger
            onClick={(event) => openPreferences(event.currentTarget)}
          >
            Open Cookie Settings
          </button>
        </p>
      </section>

      <section>
        <h2>4. Withdrawal, expiry, and multiple devices</h2>
        <p>
          You may withdraw optional consent at any time through Cookie Settings. Revocation blocks
          future optional activity and triggers registered cleanup for an active integration where
          technically possible. Your choice is browser-specific, so another browser, device, or
          private-browsing session may ask separately.
        </p>
        <p>
          Clearing browser storage removes the choice and can reset appearance or sign you out.
          Zoption will ask again when the policy version changes or when a stored record is missing,
          malformed, stale, or unreadable.
        </p>
      </section>

      <section>
        <h2>5. Providers and future changes</h2>
        <p>
          PostHog is Zoption&apos;s public web analytics and performance measurement provider.
          It receives aggregate page-use and Core Web Vitals measurements in cookieless,
          memory-only mode without setting analytics cookies or tracking authenticated financial
          application activity. Before enabling any additional Analytics or Marketing provider,
          Zoption must connect it to the consent gate, update this policy and its vendor inventory,
          disclose purposes and retention, and make any minimal Content Security Policy changes
          deliberately. Optional technology must not load before the corresponding consent.
        </p>
      </section>

      <section>
        <h2>6. Relationship to other processing</h2>
        <p>
          Cookie Settings do not control the DeepSeek financial assistant, the user-initiated
          product-support chat, or metadata-only PostHog AI observability and mobile crash
          telemetry. The financial assistant has a separate, versioned consent flow because it
          involves feature-specific server processing. The support chat sends a message only when
          you choose to submit it and keeps its browser copy in session storage. A signed-in bug
          report is stored only after you review and explicitly submit it; this account-bound
          storage is not controlled by Cookie Settings. PostHog receives operational model,
          latency, token, call-structure, finish, and error metadata for the financial assistant
          without questions, answers, financial records, tool payloads, credentials, or internal
          IDs. Mobile builds transmit only sanitized crash summaries without message contents or
          financial records. Read the <Link to="/privacy-policy">Privacy Policy</Link> for
          account, financial, provider, assistant, and rights information.
        </p>
      </section>

      <section>
        <h2>7. Contact</h2>
        <p>
          Operator: Zoption Administrator
          <br />
          Email: support@zoption.site
        </p>
      </section>
    </LegalPageLayout>
  );
}
