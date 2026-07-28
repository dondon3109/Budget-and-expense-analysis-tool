import { LegalPageLayout } from "../../components/legal/LegalPageLayout";

const Todo = ({ children }: { children: string }) => <span className="legal-todo">{children}</span>;

export function TermsOfServicePage() {
  return (
    <LegalPageLayout
      title="Terms of Service"
      summary="These terms explain the rules for using Zoption, including its personal-finance workspace, file imports, exports, and optional AI assistant."
    >
      <section>
        <h2>1. Who operates Zoption</h2>
        <p>
          Zoption is operated by <Todo>[TODO: fill in legal entity and registered address]</Todo>.
          Questions about these Terms may be sent to <Todo>[TODO: fill in contact email]</Todo>.
        </p>
      </section>

      <section>
        <h2>2. Eligibility and acceptance</h2>
        <p>
          You must be legally able to enter a binding agreement and meet the minimum age required in
          your location. <Todo>[TODO: confirm minimum age and any geographic restrictions]</Todo>.
          By creating an account or using Zoption, you agree to these Terms and the Privacy Policy.
        </p>
      </section>

      <section>
        <h2>3. Accounts and security</h2>
        <p>
          You must provide accurate account information, protect your password and devices, and tell
          us promptly about suspected unauthorized access. Email confirmation may be required. We
          may suspend or terminate access when reasonably necessary to protect users, comply with
          law, or address material violations of these Terms.
        </p>
      </section>

      <section>
        <h2>4. Your financial workspace</h2>
        <p>
          Zoption lets you manually enter financial records and import CSV, XLS, or XLSX files. It
          does not currently connect directly to your bank. You decide what to add and remain
          responsible for reviewing imported rows, categories, dates, amounts, balances, and balance
          snapshots for accuracy.
        </p>
        <p>
          Available exports are limited to the current filtered transaction CSV feature. Zoption
          does not currently provide a complete account-data archive or guaranteed portability
          package.
        </p>
        <div className="legal-callout">
          <p>
            <strong>Protect your credentials.</strong> Do not enter full bank-account or
            payment-card numbers, bank passwords, PINs, security codes, or online-banking
            credentials unless Zoption later introduces a feature that explicitly supports their
            secure handling.
          </p>
        </div>
      </section>

      <section>
        <h2>5. AI financial assistant</h2>
        <p>
          The optional assistant requires separate consent. When enabled, Zoption sends your
          questions, bounded chat history, and financial information needed to answer a request to
          the DeepSeek API through Zoption&apos;s server. The assistant is read-only: it does not
          create, edit, or delete your financial records.
        </p>
        <p>
          AI output can be incomplete or wrong. It is for general informational support and is not
          financial, investment, tax, accounting, or legal advice. Verify important decisions with
          qualified professionals. Zoption assistant conversations are designed to expire after 90
          days, subject to operational and backup limitations described in the Privacy Policy.
        </p>
      </section>

      <section>
        <h2>6. Acceptable use</h2>
        <p>You may not use Zoption to:</p>
        <ul>
          <li>break the law, infringe rights, commit fraud, or facilitate harmful activity;</li>
          <li>access another user&apos;s account or data without authorization;</li>
          <li>probe, disrupt, overload, reverse engineer, or bypass security controls;</li>
          <li>upload malware or content you do not have the right to process; or</li>
          <li>misrepresent Zoption output as professional advice or a guaranteed result.</li>
        </ul>
      </section>

      <section>
        <h2>7. Your content and Zoption&apos;s service</h2>
        <p>
          You retain ownership of the records and content you provide. You grant Zoption a limited
          license to host, process, transmit, display, back up, and otherwise use that content only
          as needed to operate, secure, support, and improve the service in line with the Privacy
          Policy.
        </p>
        <p>
          Zoption and its licensors own the application, interface, branding, documentation, and
          other service materials, excluding your content and third-party materials.
        </p>
      </section>

      <section>
        <h2>8. Subscriptions and billing</h2>
        <p>
          <Todo>[TODO: finalize once subscription/payment provider is chosen]</Todo>
        </p>
        <p>
          Future paid features may include free and paid tiers, recurring charges, automatic
          renewal, cancellation rules, refund terms, taxes, price changes, trials, and processing by
          a third-party payment provider. Those details must be completed and presented before any
          paid subscription is offered.
        </p>
      </section>

      <section>
        <h2>9. Availability, changes, and termination</h2>
        <p>
          We may maintain, change, discontinue, or limit parts of Zoption. We do not guarantee
          uninterrupted operation, preservation of every draft, or compatibility with every file.
          You may stop using the service at any time. Account and data deletion requests currently
          must be sent through <Todo>[TODO: fill in contact email/workflow]</Todo>; there is no
          in-app account deletion control at present.
        </p>
      </section>

      <section>
        <h2>10. Disclaimers and liability</h2>
        <p>
          To the maximum extent permitted by law, Zoption is provided “as is” and “as available.” We
          disclaim implied warranties and do not guarantee that calculations, imports,
          categorization, forecasts, or AI output will be error-free or suitable for a particular
          decision.
        </p>
        <p>
          <Todo>
            [TODO: legal review of limitation of liability, liability cap, excluded damages, and
            mandatory consumer-rights carve-outs]
          </Todo>
          . Nothing in these Terms excludes liability that cannot lawfully be excluded.
        </p>
      </section>

      <section>
        <h2>11. Indemnity</h2>
        <p>
          <Todo>[TODO: legal review of indemnity scope and consumer-law applicability]</Todo>. Where
          legally permitted, you are responsible for claims arising from unlawful use, rights
          infringement, or material violation of these Terms.
        </p>
      </section>

      <section>
        <h2>12. Governing law, disputes, and changes</h2>
        <p>
          These Terms are governed by the laws of <Todo>[TODO: fill in jurisdiction]</Todo>, and
          disputes will be handled in{" "}
          <Todo>[TODO: fill in courts or dispute-resolution process]</Todo>, subject to rights that
          apply in your location. We may update these Terms and will provide notice when required.
          Continued use after an effective date means the updated Terms apply.
        </p>
      </section>

      <section>
        <h2>13. Contact</h2>
        <p>
          Legal entity: <Todo>[TODO: fill in]</Todo>
          <br />
          Address: <Todo>[TODO: fill in]</Todo>
          <br />
          Email: <Todo>[TODO: fill in]</Todo>
        </p>
      </section>
    </LegalPageLayout>
  );
}
