import { Link } from "react-router-dom";

import { LegalPageLayout } from "../../components/legal/LegalPageLayout";

export function PrivacyPolicyPage() {
  return (
    <LegalPageLayout
      title="Privacy Policy"
      summary="This policy describes how Zoption handles account, profile, financial, import, assistant, consent, and operational information."
    >
      <section>
        <h2>1. Controller and contact</h2>
        <p>
          The data controller responsible for Zoption is Don Leonard E. Estrera, with a business
          address at Baring, San Isidro, San Francisco, Cebu, Philippines. Our data-protection
          contact is Don Leonard E. Estrera. Privacy questions and requests to access, correct,
          delete, restrict, or otherwise exercise rights relating to personal data may be submitted
          through support@zoption.site.
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
            <strong>Financial workspace:</strong> manually entered or imported accounts, balance
            snapshots, transactions, categories, budgets, subscriptions, and calendar records.
          </li>
          <li>
            <strong>Imports and exports:</strong> filenames, mappings, preview and validation
            results, import audit information, and requested filtered transaction CSV exports.
          </li>
          <li>
            <strong>Plan and billing:</strong> Paddle customer, subscription, transaction, price,
            and checkout-reference identifiers; subscription status and billing interval;
            current-period and scheduled-change timestamps; monthly feature usage; and minimal
            signed-notification event metadata needed to process an event and avoid processing it
            twice.
          </li>
          <li>
            <strong>Assistant:</strong> consent state, questions, bounded conversation history, and
            financial tool output needed to answer an enabled assistant request.
          </li>
          <li>
            <strong>Preferences and operations:</strong> theme and cookie/storage choices, request
            and security diagnostics, rate-limit data, errors, and service-health information.
          </li>
          <li>
            <strong>Optional analytics:</strong> limited page-use and performance information sent
            to Google Analytics 4 only after you enable Analytics in Cookie Settings. Zoption does
            not send financial workspace data, account credentials, or assistant conversations to
            Google Analytics 4.
          </li>
        </ul>
        <div className="legal-callout">
          <p>
            <strong>Do not submit banking credentials.</strong> Zoption does not currently connect
            to banks. Do not enter full account numbers, passwords, PINs, security codes, or bank
            credentials unless a future feature explicitly supports secure handling of that data.
            Full payment-card credentials entered during checkout or billing management are handled
            by Paddle&apos;s hosted interface and are not stored by this Zoption integration.
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
          <li>provide the AI assistant only after separate assistant consent;</li>
          <li>
            open Paddle-hosted checkout and customer-portal sessions, reconcile signed billing
            notifications, apply paid access, and enforce plan limits;
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
            <strong>Cloudflare</strong> for website and API hosting and Cloudflare D1 storage of
            tenant-isolated application and financial data.
          </li>
          <li>
            <strong>DeepSeek</strong> only for the separately enabled AI assistant. Zoption may send
            questions, bounded history, and relevant financial tool output to the DeepSeek API
            through the server.
          </li>
          <li>
            <strong>Paddle</strong> for hosted checkout and the hosted customer portal. Paddle
            handles payment details in those interfaces and sends signed billing notifications to
            Zoption so the server can reconcile subscription state and paid access.
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
          data against unauthorized access, loss, alteration, disclosure, or misuse. Zoption uses
          Supabase-hosted infrastructure, which encrypts project data at rest and supports encrypted
          connections in transit. We use Row Level Security policies to restrict access to database
          records according to the authenticated user and the permissions assigned to them. Our
          database provider performs automated backups according to the backup availability and
          retention applicable to our service plan. These backups may cover database records but may
          not include all files, storage objects, external services, or information stored outside
          the database. Backups are intended for service recovery and may not allow restoration of
          individual records or user accounts. We maintain a documented process for assessing and
          responding to suspected security incidents. This process may include investigating the
          incident, containing unauthorized access, mitigating potential harm, restoring affected
          systems, and notifying affected individuals or relevant authorities when required by
          applicable law. Despite these safeguards, no internet-based service or method of
          electronic storage can guarantee absolute security. You should keep your login credentials
          confidential, use a unique password, protect the devices you use to access Zoption, and
          promptly report suspected unauthorized access to support@zoption.site.
        </p>
      </section>

      <section>
        <h2>6. Assistant processing</h2>
        <p>
          Browser cookie consent does not enable the assistant. The assistant has separate,
          server-persisted consent. It is read-only and may retrieve bounded financial information
          needed to answer a question. Zoption assistant conversations are designed to expire after
          90 days.
        </p>
        <p>
          When you use Zoption’s AI assistant, we send the text of your question and any additional
          context reasonably necessary to answer it to DeepSeek, a third-party
          artificial-intelligence service provider. DeepSeek processes this information to generate
          a response and may also process related technical information for service operation,
          security, abuse prevention, and troubleshooting. DeepSeek may process and store
          information on servers located in the People’s Republic of China. DeepSeek’s published
          materials indicate that some user inputs may be used to improve or optimize its services
          and models, subject to available opt-out controls. Zoption has not confirmed whether its
          DeepSeek account has opted out of model training. DeepSeek does not publicly specify a
          fixed retention period for all API inputs or a precise schedule for deleting data from
          backups. Zoption DOES store assistant questions and generated responses in your account
          history. If assistant history is stored, you may delete it through the Assistant page’s
          “Delete chat” or “Delete all chats” controls. Deleting information from Zoption may not
          immediately remove copies independently retained by DeepSeek for security, legal,
          operational, or other permitted purposes. Requests concerning information processed by
          DeepSeek may require coordination with that provider. Do not include passwords,
          authentication credentials, payment-card details, government identification numbers,
          medical information, or other sensitive, confidential, or unnecessary personal information
          in assistant questions. Only provide information reasonably necessary for the assistant to
          respond to your request.
        </p>
      </section>

      <section>
        <h2>7. Retention</h2>
        <p>
          Account and financial records are generally retained while the account is active and as
          needed to operate the service. Assistant conversations are designed to expire after 90
          days. Import previews are temporary and commit tokens expire; successfully committed
          records become part of the financial workspace.
        </p>
        <p>
          We retain personal data only for as long as reasonably necessary for the purposes
          described in this Privacy Policy, subject to the following general retention periods: *
          **Account and profile information:** Retained while your account remains active. When you
          request account deletion, we place your account and associated information into our
          deletion process and aim to remove them from active systems within 30 days, unless
          continued retention is required by law. * **Profile pictures and avatars:** Retained while
          associated with an active account. They are deleted from active storage when you remove
          them or as part of the account-deletion process, ordinarily within 30 days. * **Financial
          records you create in Zoption:** Budgets, expenses, income entries, categories, uploaded
          records, analyses, and related information are retained until you delete them or delete
          your account. Information remaining when an account is deleted is ordinarily removed from
          active systems within 30 days. * **Assistant conversations:** Questions submitted to the
          AI assistant and generated responses are retained in your account history until you delete
          an individual chat, delete all chats, or delete your account. Information independently
          retained by DeepSeek is subject to DeepSeek’s own retention practices, as described in the
          Assistant Processing section. * **Diagnostic and security information:** Application logs,
          authentication records, error reports, and security-event information are generally
          retained for up to 90 days. We may retain relevant records for longer when reasonably
          necessary to investigate a security incident, prevent fraud or abuse, comply with law, or
          establish, exercise, or defend legal claims. * **Account-deletion queue:**
          Account-deletion requests are ordinarily processed within 30 days. Some information may be
          excluded from deletion where retention is legally required or necessary for security,
          fraud prevention, dispute resolution, or legal claims. * **Billing integration records:**
          Zoption stores the provider identifiers, subscription state, period timestamps, usage, and
          minimal event metadata described above as needed to operate paid access and the account.
          Full payment-card credentials are handled by Paddle and are not stored by this
          integration. [TODO: Confirm and publish the retention period for Zoption-controlled
          billing records.] * **Provider backups:** Deleted database information may remain in
          encrypted provider backups until the applicable backup-retention cycle expires, which may
          be up to 30 days under our current infrastructure arrangements. Backup copies are
          maintained for disaster recovery and are not ordinarily accessed or restored except when
          necessary to recover the service. If a backup containing previously deleted information is
          restored, we will take reasonable steps to reapply completed deletion requests. We may
          retain specific information for longer when required to comply with a legal obligation,
          regulatory request, court order, investigation, dispute, or the establishment, exercise,
          or defense of legal claims. Aggregated or anonymized information that no longer identifies
          an individual may be retained for longer for statistical, security, and
          service-improvement purposes.
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
          [support@zoption.site](mailto:support@zoption.site) and describe the request and the
          account concerned. We may request information reasonably necessary to verify your identity
          or your authority to act for another person before processing a request. We will use
          verification information only for handling and documenting the request. We may limit or
          deny a request where permitted or required by applicable law, including where fulfilling
          it would adversely affect another person’s rights, conflict with a legal obligation, or
          where the request is manifestly unfounded or unreasonable. Where appropriate, we will
          explain the reason for the decision. You may also file a complaint with the Philippine
          National Privacy Commission or another data-protection authority with jurisdiction over
          your concern. Exercising your privacy rights will not result in discriminatory treatment,
          although deleting or restricting information necessary to provide Zoption may prevent some
          or all features from functioning.
        </p>
        <p>
          The product currently exports filtered transactions as CSV. That export is not a complete
          account-data archive and does not by itself satisfy every portability request. Account
          Settings includes an in-app account-deletion control; an ongoing Paddle subscription must
          be canceled or otherwise resolved before deletion can proceed. For browser tracking
          choices, use Cookie Settings or read the <Link to="/cookie-policy">Cookie Policy</Link>.
        </p>
      </section>

      <section>
        <h2>9. International transfers</h2>
        <p>
          Zoption uses service providers that may process personal data outside the Philippines or
          the country where you live. Our primary database and application data are processed
          through Supabase cloud infrastructure, although Supabase and its subprocessors may process
          limited information in other locations where they operate. Cloudflare processes email
          addresses, email content, delivery information, and related technical data through its
          Email Service and subprocessors. When you use the AI assistant, assistant questions,
          related context, and generated responses may be transferred to and processed by DeepSeek
          in the People’s Republic of China. The privacy and data-protection laws in these locations
          may differ from those in your country. Zoption remains responsible for personal data under
          its control when it is transferred to a service provider. We use contractual or other
          reasonable measures designed to provide a comparable level of protection, including
          applicable provider data-processing terms, reviewing provider privacy and security
          practices, restricting transfers to information reasonably necessary to provide the
          relevant service, and applying appropriate access and security controls. Where applicable
          law requires additional consent or another transfer mechanism, we will take the required
          steps before making the transfer. You may contact us at
          [support@zoption.site](mailto:support@zoption.site) for more information about relevant
          processing locations or safeguards.
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
          You may contact us at [support@zoption.site](mailto:support@zoption.site) with questions,
          privacy requests, or complaints about how Zoption handles your personal data. We will
          review your concern and may request information reasonably necessary to verify your
          identity, understand the issue, and respond appropriately. You may also have the right to
          file a complaint with the Philippine National Privacy Commission or another
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
