import { Link } from "react-router-dom";

import { LegalPageLayout } from "../../components/legal/LegalPageLayout";
import { useCookieConsent } from "../../consent/CookieConsentProvider";

const Todo = ({ children }: { children: string }) => <span className="legal-todo">{children}</span>;

export function CookiePolicyPage() {
  const { openPreferences } = useCookieConsent();

  return (
    <LegalPageLayout
      title="Cookie Policy"
      summary="This policy explains the cookies and similar browser storage Zoption uses, what is necessary, and how optional categories remain blocked until you choose them."
    >
      <section>
        <h2>1. Cookies and similar technologies</h2>
        <p>
          “Cookies” is often used as a general label, but websites can also use localStorage, SDKs,
          pixels, iframes, and related browser technologies. Zoption currently uses browser storage
          for theme choice, this consent record, and Supabase authentication/session operation.
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
          Analytics could help measure usage and performance. No analytics provider is currently
          enabled. If one is added, its SDK, script, request, beacon, iframe, preconnect, or similar
          activity must remain blocked until you explicitly enable Analytics.
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
        <h2>5. Future providers</h2>
        <p>
          Before enabling any Analytics or Marketing provider, Zoption must connect it to the
          consent gate, update this policy and its vendor inventory, disclose purposes and
          retention, and make any minimal Content Security Policy changes deliberately. Optional
          technology must not load before the corresponding consent.
        </p>
      </section>

      <section>
        <h2>6. Relationship to other processing</h2>
        <p>
          Cookie Settings do not control the DeepSeek assistant. The assistant has a separate
          consent flow because it involves feature-specific server processing. Read the{" "}
          <Link to="/privacy-policy">Privacy Policy</Link> for account, financial, provider,
          assistant, and rights information.
        </p>
      </section>

      <section>
        <h2>7. Contact</h2>
        <p>
          Operator: <Todo>[TODO: fill in legal entity and address]</Todo>
          <br />
          Email: <Todo>[TODO: fill in privacy contact email]</Todo>
        </p>
      </section>
    </LegalPageLayout>
  );
}
