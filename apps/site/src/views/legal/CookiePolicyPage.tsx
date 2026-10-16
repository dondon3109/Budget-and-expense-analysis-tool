import { LegalPageLayout } from "../../components/legal/LegalPageLayout";

export function CookiePolicyPage() {
  return (
    <LegalPageLayout
      title="Cookie Policy"
      summary="This policy explains the cookies and similar browser storage Zoption uses, what is necessary, and how optional categories remain blocked until you choose them."
      lastUpdated="October 16, 2026"
    >
      <section>
        <h2>1. Cookies and similar technologies</h2>
        <p>
          “Cookies” is often used as a general label, but websites can also use localStorage, SDKs,
          pixels, iframes, and related browser technologies. Zoption currently uses browser storage
          for theme choice, this consent record, a remembered transaction sort preference,
          release-update acknowledgments, the product-support chat for the current tab, and Supabase
          authentication/session operation. In the web app, a service worker also caches static
          files so the app loads offline; it never caches your financial workspace, private data, or
          account requests. The public website uses no service worker.
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
          Vitals (LCP, CLS, INP) performance measurement on public pages. On the public website
          PostHog operates in cookieless, memory-only mode without setting analytics cookies,
          storing persistent device identifiers, or creating person profiles. In the web app it
          keeps everything in memory too, so it sets no analytics cookie and writes nothing to your
          device. Zoption does not send your financial workspace data, account credentials, or
          assistant conversations to the analytics platform. On the public website and in the web
          app, this measurement runs only after you allow Analytics.
        </p>
        <p>
          With Analytics allowed, the web app also records conversion steps and feature use, so the
          path from a first public page visit to a first import, and which features people use, can
          be read: a signup page view, the outcome and method (password or Google) of a signup
          attempt, a first app load, a first import into an empty workspace, assistant consent, a
          first assistant question, the name of each app page you open, and that a transaction,
          budget, savings goal, debt, or subscription was added, changed, or removed, and when a
          voice entry, receipt scan, SMS paste, import, assistant message, assistant-drafted
          transaction, or pet action (choosing an egg, hatching, recoloring, turning it on or off)
          succeeds. While you are signed in, these events are linked to your Zoption account:
          PostHog receives your user ID and email address and keeps them on an analytics profile, so
          we can see how each account uses Zoption. Steps before you sign in stay anonymous until
          you do. The events carry no financial detail: they never include an amount, category,
          financial-account name, tenant identifier, free text, or page address with parameters.
          Turning Analytics off stops them and clears the link to your account in this browser.
        </p>
        <p>
          The goals you choose during setup are not one of those steps. It is stored with your
          workspace, not on your device, and their goal events stay in Zoption&apos;s own database,
          carry no financial detail, and are not sent to the analytics platform. See the Privacy
          Policy for how they are deleted and exported.
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
          <button type="button" className="button secondary" data-cookie-preferences-trigger>
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
          PostHog is Zoption&apos;s web measurement provider. It receives cookieless, memory-only
          page-use and Core Web Vitals measurements from the public site, and the conversion and
          feature-use events described in section 2, linked to your user ID and email while you are
          signed in to the web app. It never receives what you enter: no amounts, categories,
          financial-account names, search text, page addresses with parameters, or free text. Before
          enabling any additional Analytics or Marketing provider, Zoption must connect it to the
          consent gate, update this policy and its vendor inventory, disclose purposes and
          retention, and make any minimal Content Security Policy changes deliberately. Optional
          technology must not load before the corresponding consent.
        </p>
      </section>

      <section>
        <h2>6. Relationship to other processing</h2>
        <p>
          Cookie Settings do not control the financial assistant, AI entry (receipt scanning, spoken
          transactions, and PDF statement entry), the user-initiated product-support chat, or
          metadata-only PostHog AI observability and mobile crash telemetry. The financial assistant
          and AI entry each have a separate, versioned consent flow because they involve
          feature-specific server processing. The support chat sends a message only when you choose
          to submit it and keeps its browser copy in session storage. A signed-in bug report is
          stored only after you review and explicitly submit it; this account-bound storage is not
          controlled by Cookie Settings. PostHog receives operational model, latency, token,
          call-structure, finish, and error metadata for the financial assistant without questions,
          answers, financial records, tool payloads, credentials, or internal IDs. Mobile builds
          transmit only sanitized crash summaries without message contents or financial records, and
          feature-use events, linked to your user ID and email only if you allow it in the app (an
          app launch, the name of each screen opened, that a transaction, budget, savings goal,
          debt, subscription, or import was added, changed, or removed, and that a voice entry,
          voice widget note, receipt scan, SMS paste, PDF statement, assistant message, or pet
          action succeeded, with fixed labels such as the transaction type and counts such as
          imported rows, never amounts or text). Read the{" "}
          <a href="/privacy-policy">Privacy Policy</a> for account, financial, provider, assistant,
          and rights information.
        </p>
      </section>

      <section>
        <h2>7. Contact</h2>
        <p>
          Operator: Don Leonard E. Estrera
          <br />
          Email: <a href="mailto:support@zoption.site">support@zoption.site</a>
        </p>
      </section>
    </LegalPageLayout>
  );
}
