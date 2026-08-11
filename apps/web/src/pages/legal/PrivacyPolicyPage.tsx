import { Link } from "react-router-dom";

import { LegalPageLayout } from "../../components/legal/LegalPageLayout";

export function PrivacyPolicyPage() {
  return (
    <LegalPageLayout
      title="Privacy Policy"
      summary="This policy describes how Zoption handles account, profile, financial, plan, billing, import, assistant, consent, and operational information."
      lastUpdated="August 11, 2026"
    >
      <section>
        <h2>1. Controller and contact</h2>
        <p>
          The data controller responsible for Zoption is Don Leonard E. Estrera, with a business
          address at Baring, San Isidro, San Francisco, Cebu, Philippines. Our data-protection
          contact is Don Leonard E. Estrera. Privacy questions and requests to access, correct,
          delete, restrict, or otherwise exercise rights relating to personal data may be submitted
          through <a href="mailto:support@zoption.site">support@zoption.site</a>.
        </p>
      </section>

      <section>
        <h2>2. Information Zoption handles</h2>
        <ul>
          <li>
            <strong>Account and profile:</strong> email address, display name,
            authentication/session information, confirmation and recovery activity, and
            profile-picture metadata.
          </li>
          <li>
            <strong>Profile pictures:</strong> uploaded avatars are currently available by a public
            storage link. Anyone who obtains the link may be able to view it, so do not upload a
            sensitive image.
          </li>
          <li>
            <strong>Financial workspace:</strong> manually entered or imported accounts,
            transaction-derived balances, transactions, categories, budgets, subscriptions, calendar
            records, savings goals, and debt-planning records such as balances, APRs, minimum
            payments, as-of dates, target amounts, target dates, and statuses.
          </li>
          <li>
            <strong>Imports and exports:</strong> filenames, mappings, preview and validation
            results, import audit information, and requested filtered transaction CSV exports.
          </li>
          <li>
            <strong>Plan and billing:</strong> plan tier, including Free or Zoption Pro, plus
            feature usage and allowance records used to apply plan limits. If you start a Pro
            checkout or subscribe, this also includes PayPal payer, subscription, plan, and
            checkout-reference identifiers; subscription status and billing interval; current-period
            and scheduled-change timestamps; and minimal verified-webhook event metadata needed to
            process an event and avoid processing it twice.
          </li>
          <li>
            <strong>Assistant:</strong> versioned consent state, display-name preferences, response
            and coaching preferences, questions, bounded conversation history, final responses,
            source and data-quality metadata, compact sanitized run/tool audit snapshots, and
            metadata-only AI observability records such as random trace identifiers, provider/model,
            latency, token counts, call sequence, finish reasons, and error categories.
          </li>
          <li>
            <strong>Preferences and operations:</strong> theme and cookie/storage choices, request
            and security diagnostics, rate-limit data, errors, and service-health information.
          </li>
          <li>
            <strong>Optional analytics:</strong> limited page-use and performance information sent
            to Google Analytics 4 and Cloudflare Web Analytics only after you enable Analytics in
            Cookie Settings. Zoption does not send financial workspace data, account credentials, or
            assistant conversations to either analytics provider.
          </li>
        </ul>
        <div className="legal-callout">
          <p>
            <strong>Do not submit banking credentials.</strong> Zoption does not currently connect
            to banks. Do not enter full account numbers, passwords, PINs, security codes, or bank
            credentials unless a future feature explicitly supports secure handling of that data.
            Full payment-card credentials entered during PayPal approval are handled by PayPal and
            are not stored by this Zoption integration.
          </p>
        </div>
      </section>

      <section>
        <h2>3. Why information is used</h2>
        <p>Zoption uses information to:</p>
        <ul>
          <li>create and secure accounts and authenticate requests;</li>
          <li>
            provide tenant-isolated budgeting, transaction, calendar, import, and export features;
          </li>
          <li>
            provide the AI assistant only after separate assistant consent and monitor provider
            reliability, latency, token use, and safe error categories without sending assistant
            content to the observability provider;
          </li>
          <li>
            determine available plan features and enforce Free and Pro usage limits; and, if you
            choose Pro, initiate PayPal subscription approval, reconcile verified PayPal billing
            webhooks, and apply paid access;
          </li>
          <li>remember browser preferences and honor privacy choices;</li>
          <li>
            prevent abuse, troubleshoot errors, maintain availability, and comply with law; and
          </li>
          <li>communicate about the account, service, security, and policy changes.</li>
        </ul>
        <p>
          We process personal data only when a lawful basis applies. Depending on the purpose and
          the type of data involved, we may process personal data when necessary to provide Zoption
          or perform our agreement with you, comply with a legal obligation, protect vital
          interests, pursue legitimate interests such as securing, maintaining, and improving
          Zoption, or obtain your consent where consent is required. When we rely on legitimate
          interests, we assess whether those interests are overridden by your fundamental rights and
          freedoms. When we process sensitive personal information, we rely only on a ground
          specifically permitted under applicable law. You may withdraw consent at any time where
          processing is based on consent, without affecting processing that lawfully occurred before
          the withdrawal.
        </p>
      </section>

      <section>
        <h2>4. Processors and data sharing</h2>
        <p>Zoption uses service providers to operate the product:</p>
        <ul>
          <li>
            <strong>Supabase</strong> for identity, authentication/session operation, profile
            metadata, and avatar storage.
          </li>
          <li>
            <strong>Cloudflare</strong> for website and API hosting, Cloudflare D1 storage of
            tenant-isolated application and financial data, and consent-gated, cookie-free Web
            Analytics for aggregate page-use and performance measurement.
          </li>
          <li>
            <strong>DeepSeek</strong> only for the separately enabled AI assistant. Zoption may send
            the current question, bounded prior chat, assistant and user display-name profile,
            trusted policy and date context, approved tool definitions, and only the tenant-scoped
            tool results needed for the answer through Zoption&apos;s server.
          </li>
          <li>
            <strong>PostHog</strong> for server-side AI operational observability after separate
            assistant consent. PostHog receives random trace/span identifiers, provider/model,
            latency, token counts, call sequence, finish reasons, error categories, and deployment
            environment. It does not receive questions, answers, conversation history, financial
            records, tool names, arguments or results, credentials, or Zoption user, tenant, thread,
            message, or run identifiers. Zoption disables PostHog person-profile processing for
            these events.
          </li>
          <li>
            <strong>PayPal</strong> only if you start checkout for or subscribe to Zoption Pro.
            PayPal handles payment details in its interfaces and sends billing webhooks that Zoption
            verifies on its server before reconciling subscription state and paid access.
          </li>
          <li>
            <strong>Google Analytics 4</strong> only after you enable Analytics through Cookie
            Settings. It receives limited page-use and performance information, not financial
            workspace data, account credentials, or assistant conversations.
          </li>
        </ul>
        <p>
          Zoption does not sell user financial data. Zoption may disclose information when required
          by law, to protect rights and security, or in a properly structured business transaction
          with appropriate safeguards and notice where required.
        </p>
      </section>

      <section>
        <h2>5. Financial-data security</h2>
        <p>
          Zoption treats financial records as sensitive. Current safeguards include HTTPS encryption
          in transit, verified authentication, server-derived tenant isolation, parameterized
          database access, bounded request validation, rate limiting, and limited authorized access
          through service providers and operational roles. Provider-managed safeguards also apply.
        </p>
        <p>
          We use reasonable administrative and technical safeguards designed to protect personal
          data against unauthorized access, loss, alteration, disclosure, or misuse. Supabase
          manages identity, sessions, profile metadata, and avatar storage. Cloudflare D1 stores
          application and financial records behind Worker routes that derive the tenant from a
          verified Supabase token and apply tenant predicates to database access. Supabase Storage
          access policies restrict avatar uploads and deletion to the authenticated owner. Provider
          backup and recovery controls apply according to the services and plans in use and may not
          allow restoration of an individual record or account. We maintain a documented process for
          assessing and responding to suspected security incidents. Despite these safeguards, no
          internet-based service or method of electronic storage can guarantee absolute security.
          Keep your login credentials confidential, use a unique password, protect the devices you
          use to access Zoption, and promptly report suspected unauthorized access to
          <a href="mailto:support@zoption.site">support@zoption.site</a>.
        </p>
      </section>

      <section>
        <h2>6. Assistant processing</h2>
        <p>
          Browser cookie consent does not enable the assistant. The assistant has separate,
          versioned, server-persisted consent. It is read-only and may retrieve bounded
          tenant-scoped financial information needed to answer a question. Saved goals and
          debt-planning records may be used for deterministic projections. Zoption assistant
          conversations and their sanitized audit snapshots share a 90-day thread-retention window.
        </p>
        <p>
          For a provider-backed request, DeepSeek may receive the current question, bounded prior
          chat, assistant and user display-name profile, trusted compliance and date context,
          approved tool definitions, and only the financial tool results needed for the answer. Tool
          results may include transaction descriptions, categories, account names, calculated
          balances, budgets, trends, recurring or anomaly analysis, and saved goal/debt inputs or
          projections. Zoption excludes transaction notes, internal record identifiers, tenant and
          user identifiers, credentials, secrets, and hidden reasoning from tool results and
          sanitized audit snapshots. Do not type passwords, authentication credentials, payment-card
          details, government identification numbers, medical information, or other sensitive or
          unnecessary personal information into assistant questions. DeepSeek may process request
          and technical information for response generation, security, abuse prevention, and service
          operation under its own terms and privacy practices. Provider processing locations,
          retention, backup deletion, and model-improvement treatment require current provider and
          legal confirmation. Deleting a chat removes Zoption-controlled active D1 messages and
          audit rows, but may not immediately remove information independently retained by the
          provider where its terms or law permit retention.
        </p>
        <p>
          For provider-backed turns, Zoption may send PostHog metadata-only generation events to
          measure AI reliability, latency, token use, call structure, finish reasons, and safe error
          categories. Each turn uses random telemetry-only identifiers and person-profile processing
          is disabled. PostHog does not receive the question, prior chat, answer, financial records,
          tool definitions, tool names, tool arguments or results, credentials, hidden reasoning, or
          Zoption user, tenant, thread, message, request, or run identifiers. This server-side
          processing does not set a PostHog browser cookie and is not controlled by the public-site
          Analytics cookie preference; it is covered by the separate versioned assistant consent.
        </p>
      </section>

      <section>
        <h2>7. Retention</h2>
        <p>
          Account, profile, plan-usage, and financial workspace records are generally retained while
          the account is active and as needed to operate, secure, and support the service. Import
          previews and commit tokens are temporary; successfully committed records become part of
          the financial workspace. Plan tier, usage, and allowance records are retained as needed to
          operate Free and Pro access and apply feature limits. If you start a Pro checkout or
          subscribe, billing provider identifiers, subscription state, and minimal verified event
          metadata are retained as needed to operate paid access, resolve billing issues, meet legal
          obligations, and defend claims. Full payment-card credentials are handled by PayPal and
          are not stored by this integration.
        </p>
        <p>
          Each assistant thread has a 90-day retention window measured from its latest completed
          turn. The thread, messages, response metadata, assistant run, and sanitized tool-call
          snapshots are deleted together when the thread expires or when you delete that chat, all
          chats, or your account. Account deletion purges the tenant&apos;s active D1 financial
          records, goals, debts, chats, and assistant audits. Avatar or Supabase Auth cleanup can
          remain pending and be retried if a provider step is temporarily unavailable; a minimal
          deletion tombstone is retained to stop an unexpired token from recreating the workspace.
          Specific records may be retained longer where required by law or reasonably necessary for
          security, fraud prevention, dispute resolution, or legal claims. Deleted information may
          remain temporarily in provider recovery copies according to provider backup lifecycles and
          is not ordinarily available for individual restoration. Provider-side retention of
          information sent to DeepSeek is governed by that provider&apos;s practices as described
          above. Metadata-only PostHog AI observability events are subject to the project&apos;s
          current 12-month event-retention plan. PostHog controls provider-side retention
          enforcement and deletion timing, so these events do not disappear when the related Zoption
          chat is deleted and may remain through that provider retention period.
        </p>
      </section>

      <section>
        <h2>8. Your choices and rights</h2>
        <p>
          Depending on your location and applicable law, you may have the right to be informed about
          how your personal data is processed; access or obtain a copy of your personal data;
          correct inaccurate or incomplete information; object to certain processing; withdraw
          consent where processing is based on consent; request the erasure or blocking of personal
          data; receive eligible data in a portable format; and file a complaint with a competent
          data-protection authority. You may delete your Zoption account and associated data through
          the account deletion control in Account Settings. For access, correction, objection,
          portability, consent withdrawal, or other privacy requests, contact us at
          <a href="mailto:support@zoption.site">support@zoption.site</a> and describe the request
          and the account concerned. We may request information reasonably necessary to verify your
          identity or your authority to act for another person before processing a request. We will
          use verification information only for handling and documenting the request. We may limit
          or deny a request where permitted or required by applicable law, including where
          fulfilling it would adversely affect another person’s rights, conflict with a legal
          obligation, or where the request is manifestly unfounded or unreasonable. Where
          appropriate, we will explain the reason for the decision. You may also file a complaint
          with the Philippine National Privacy Commission or another data-protection authority with
          jurisdiction over your concern. Exercising your privacy rights will not result in
          discriminatory treatment, although deleting or restricting information necessary to
          provide Zoption may prevent some or all features from functioning.
        </p>
        <p>
          The product currently exports filtered transactions as CSV. That export is not a complete
          account-data archive and does not by itself satisfy every portability request. Account
          Settings includes an in-app account-deletion control; an ongoing paid subscription must be
          canceled or otherwise resolved before deletion can proceed. For browser tracking choices,
          use Cookie Settings or read the <Link to="/cookie-policy">Cookie Policy</Link>.
        </p>
      </section>

      <section>
        <h2>9. International transfers</h2>
        <p>
          Zoption uses service providers that may process personal data outside the Philippines or
          the country where you live. Cloudflare hosts the application, API, and primary D1
          financial database. Supabase processes identity, session, profile, and avatar information.
          If you start a Pro checkout or subscribe, PayPal processes subscription approval and
          payment information. When you enable the AI assistant, the request context described above
          may be transferred to and processed by DeepSeek in locations where it or its subprocessors
          operate. Metadata-only AI observability events are sent to PostHog&apos;s US Cloud region.
          Privacy laws in those locations may differ from those in your country. Zoption remains
          responsible for personal data under its control and restricts transfers to information
          reasonably necessary for the relevant service. We use applicable provider terms and
          reasonable access and security controls, and will use any additional consent or transfer
          mechanism required by law. Contact{" "}
          <a href="mailto:support@zoption.site">support@zoption.site</a> for information about
          relevant processing locations or safeguards.
        </p>
      </section>

      <section>
        <h2>10. Children</h2>
        <p>
          Zoption is not intended for children below 18 years old, and we do not knowingly seek
          their personal information. Contact us if you believe a child has provided information
          improperly.
        </p>
      </section>

      <section>
        <h2>11. Complaints, changes, and contact</h2>
        <p>
          You may contact us at <a href="mailto:support@zoption.site">support@zoption.site</a> with
          questions, privacy requests, or complaints about how Zoption handles your personal data.
          We will review your concern and may request information reasonably necessary to verify
          your identity, understand the issue, and respond appropriately. You may also have the
          right to file a complaint with the Philippine National Privacy Commission or another
          data-protection authority with jurisdiction over your location. We encourage you to
          contact us first so that we have an opportunity to address your concern, but doing so does
          not prevent you from contacting a competent authority where permitted by applicable law.
          We may update this Privacy Policy from time to time to reflect changes to Zoption, our
          data-processing practices, service providers, or applicable legal requirements. We will
          revise the “Last updated” date when changes take effect. If a change materially affects
          your rights or how we use personal data, we will provide additional notice through email,
          an in-service notification, or another appropriate method when required by law. Where a
          change requires your consent, we will request that consent before applying the relevant
          processing. Where applicable, you may object to the change, withdraw previously provided
          consent, or stop using Zoption and delete your account through Account Settings.
        </p>
      </section>
    </LegalPageLayout>
  );
}
