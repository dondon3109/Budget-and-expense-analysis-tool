import { Link } from "react-router-dom";

import { LegalPageLayout } from "../../components/legal/LegalPageLayout";

const Todo = ({ children }: { children: string }) => <span className="legal-todo">{children}</span>;

export function PrivacyPolicyPage() {
  return (
    <LegalPageLayout
      title="Privacy Policy"
      summary="This policy describes how Zoption handles account, profile, financial, import, assistant, consent, and operational information."
    >
      <section>
        <h2>1. Controller and contact</h2>
        <p>
          The organization responsible for Zoption is{" "}
          <Todo>[TODO: fill in legal entity, address, and data-protection contact]</Todo>. Privacy
          and data-rights requests may be sent to{" "}
          <Todo>[TODO: fill in contact email/workflow]</Todo>.
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
            <strong>Assistant:</strong> consent state, questions, bounded conversation history, and
            financial tool output needed to answer an enabled assistant request.
          </li>
          <li>
            <strong>Preferences and operations:</strong> theme and cookie/storage choices, request
            and security diagnostics, rate-limit data, errors, and service-health information.
          </li>
        </ul>
        <div className="legal-callout">
          <p>
            <strong>Do not submit banking credentials.</strong> Zoption does not currently connect
            to banks. Do not enter full account or card numbers, passwords, PINs, security codes, or
            bank credentials unless a future feature explicitly supports secure handling of that
            data.
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
          <li>remember browser preferences and honor privacy choices;</li>
          <li>
            prevent abuse, troubleshoot errors, maintain availability, and comply with law; and
          </li>
          <li>communicate about the account, service, security, and policy changes.</li>
        </ul>
        <p>
          Legal bases may include performance of a contract, legitimate interests in operating and
          securing Zoption, consent where required, and legal obligations.{" "}
          <Todo>[TODO: legal review and confirm lawful bases by jurisdiction]</Todo>.
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
        </ul>
        <p>
          <Todo>
            [TODO: verify provider legal names, locations, subprocessors, transfer mechanisms,
            retention, training terms, certifications, and contractual safeguards]
          </Todo>
          . Zoption does not sell user financial data. Zoption may disclose information when
          required by law, to protect rights and security, or in a properly structured business
          transaction with appropriate safeguards and notice where required.
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
          <Todo>
            [TODO: verify and describe encryption at rest, access-review practices,
            incident-response contacts, backup controls, and production monitoring]
          </Todo>
          . No internet service can promise absolute security. Keep your credentials private, use a
          unique password, protect your device, and report suspected access promptly.
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
          <Todo>
            [TODO: verify DeepSeek retention, training, regional processing, deletion, and backup
            behavior before publication]
          </Todo>
          . Do not include information in assistant questions that is not needed for the request.
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
          <Todo>
            [TODO: define account, profile, avatar, financial record, diagnostic, deletion-queue,
            provider-backup, and legal-retention periods]
          </Todo>
          . Residual copies may remain in provider backups until ordinary backup cycles complete.
        </p>
      </section>

      <section>
        <h2>8. Your choices and rights</h2>
        <p>
          Depending on your location, you may have rights to access, correct, delete, restrict,
          object, withdraw consent, or receive portable data. Requests must currently be submitted
          through <Todo>[TODO: fill in contact email/workflow]</Todo>. Zoption may verify identity
          before completing a request.
        </p>
        <p>
          The product currently exports filtered transactions as CSV. That export is not a complete
          account-data archive and does not by itself satisfy every portability request. You can
          permanently delete your account from Account Settings after confirming the action and your
          current password. Zoption removes its D1 workspace records immediately; any managed
          Storage/Auth cleanup that cannot finish at once continues securely. For browser tracking
          choices, use Cookie Settings or read the <Link to="/cookie-policy">Cookie Policy</Link>.
        </p>
      </section>

      <section>
        <h2>9. International transfers</h2>
        <p>
          Service providers may process information outside your country.{" "}
          <Todo>
            [TODO: identify relevant transfer locations and legal safeguards after provider and
            jurisdiction review]
          </Todo>
          .
        </p>
      </section>

      <section>
        <h2>10. Children</h2>
        <p>
          Zoption is not intended for children below <Todo>[TODO: confirm minimum age]</Todo>, and
          we do not knowingly seek their personal information. Contact us if you believe a child has
          provided information improperly.
        </p>
      </section>

      <section>
        <h2>11. Complaints, changes, and contact</h2>
        <p>
          You may contact <Todo>[TODO: fill in privacy contact]</Todo> with questions or complaints
          and may have the right to complain to{" "}
          <Todo>[TODO: identify relevant supervisory authority]</Todo>. We may update this Policy
          and will change the last-updated date and provide additional notice when required.
        </p>
      </section>
    </LegalPageLayout>
  );
}
