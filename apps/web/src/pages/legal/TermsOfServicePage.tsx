import { LegalPageLayout } from "../../components/legal/LegalPageLayout";

export function TermsOfServicePage() {
  return (
    <LegalPageLayout
      title="Terms of Service"
      summary="These terms explain the rules for using Zoption, including its Free and Pro plans, personal-finance workspace, file imports, exports, and optional AI assistant."
      lastUpdated="August 11, 2026"
    >
      <section>
        <h2>1. Who operates Zoption</h2>
        <p>
          Zoption is operated by Don Leonard E. Estrera, doing this business as Zoption. Questions
          about these Terms may be sent to{" "}
          <a href="mailto:support@zoption.site">support@zoption.site</a>.
        </p>
      </section>

      <section>
        <h2>2. Eligibility and acceptance</h2>
        <p>
          You must be at least 18 years old and legally capable of entering into a binding agreement
          to create an account or use Zoption. By creating an account or using Zoption, you
          represent that you meet these eligibility requirements, agree to be bound by these Terms,
          and acknowledge that you have read the Privacy Policy.
        </p>
      </section>

      <section>
        <h2>3. Accounts and security</h2>
        <p>
          You must provide accurate, complete, and current account information and keep that
          information updated. You are responsible for safeguarding your login credentials and
          taking reasonable measures to secure the devices you use to access Zoption. You must
          promptly notify us at <a href="mailto:support@zoption.site">support@zoption.site</a> if
          you suspect that your account, password, or other login credentials have been lost,
          compromised, or accessed without authorization. We may require you to verify your email
          address before activating your account or allowing access to certain features. We may
          temporarily suspend or restrict access when reasonably necessary to investigate suspected
          misuse, protect Zoption or its users, prevent security threats, or comply with applicable
          law. We may terminate an account for a material or repeated violation of these Terms.
          Where reasonably practicable, we will provide notice of the action taken, unless doing so
          could create a security risk or violate applicable law.
        </p>
      </section>

      <section>
        <h2>4. Your financial workspace</h2>
        <p>
          Zoption lets you manually enter financial records and import CSV, XLS, or XLSX files. It
          does not currently connect directly to your bank. Account balances are calculated from the
          transactions recorded in Zoption; they are not live bank balances and may omit activity
          from before you began tracking. You decide what to add and remain responsible for
          reviewing imported rows, categories, dates, amounts, calculated balances, savings goals,
          and debt planning inputs for accuracy.
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
          Zoption also offers a separate product-support chat on the landing page and signed-in
          workspace. It can explain Zoption features and navigation but cannot see your account,
          financial workspace, or private Assistant history. When you send a support message, that
          message and bounded support-chat context are sent to the AI provider. Do not include
          passwords, authentication codes, banking credentials, or unnecessary sensitive personal or
          financial information.
        </p>
        <p>
          The optional assistant requires separate, versioned consent. When enabled, Zoption sends
          your question, bounded chat history, trusted policy and date context, approved tool
          definitions, and tenant-scoped financial results needed to answer the request to the AI
          provider through Zoption&apos;s server. Those results may use recorded transactions,
          calculated balances, budgets, categories, savings goals, debt inputs, and deterministic
          planning projections. The assistant is read-only: it does not create, edit, or delete your
          financial records.
        </p>
        <p>
          AI output and planning projections can be incomplete or wrong. They provide educational
          budgeting and financial-wellness information, not personalized financial, investment, tax,
          accounting, legal, retirement-allocation, or insurance advice. Verify important decisions
          and consult an appropriately qualified professional when needed. Zoption assistant
          conversations and their compact sanitized audit snapshots are designed to expire together
          after the thread&apos;s 90-day retention window, subject to the Privacy Policy.
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
        <h2>8. Free plan, subscriptions, and billing</h2>
        <p>
          Creating an account places you on the Free plan. The Free plan has no subscription charge
          and does not require a payment method, but it is subject to the feature and usage limits
          shown in Zoption. If you reach a limit, the affected action may remain unavailable until
          the relevant usage window resets, you free available capacity where supported, or you
          upgrade to Zoption Pro. Free-plan features and limits may change as described in Section
          9.
        </p>
        <p>
          Zoption Pro is an optional paid plan offered through monthly and annual PayPal
          subscriptions. Prices are charged in Philippine pesos; the price, billing interval, and
          plan shown in PayPal approval apply to the subscription you confirm. Subscriptions renew
          automatically for the selected interval unless you cancel renewal. Taxes may apply.
        </p>

        <p>
          You can request cancellation through Plan and billing in Zoption. Cancellation stops
          future renewal, and your paid access remains available through the end of the current paid
          period. When paid access ends, your account returns to the Free plan and its current
          limits apply. Zoption does not issue automatic refunds for the current paid period.
        </p>

        <p>
          A completed PayPal approval screen does not by itself activate or change paid access.
          Zoption grants, changes, pauses, or removes paid access only after its server receives and
          processes a verified PayPal webhook notification. A short confirmation delay may occur
          after checkout or a billing change. Your use of PayPal may also be subject to
          PayPal&apos;s terms and privacy notices.
        </p>
      </section>

      <section>
        <h2>9. Availability, changes, and termination</h2>
        <p>
          We may maintain, modify, discontinue, or limit any part of Zoption. We do not guarantee
          uninterrupted operation, preservation of every draft, or compatibility with every file or
          device. You may stop using Zoption at any time. You may request deletion of your account
          and associated data through the account deletion control in your account settings. An
          ongoing paid subscription must be canceled or otherwise resolved before Zoption can delete
          the linked account. Account deletion may be permanent and may result in the loss of
          content, records, and other information associated with your account. We may retain
          certain information where reasonably necessary to comply with legal obligations, resolve
          disputes, prevent fraud or abuse, enforce these Terms, or complete the deletion process
          through our backup systems.
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
          To the maximum extent permitted by applicable law, Zoption is provided on an “as is” and
          “as available” basis. We do not make any express or implied warranty that Zoption will
          always be available, secure, error-free, complete, or compatible with every device,
          browser, file, or third-party service. Information, calculations, classifications,
          summaries, forecasts, and other results produced through Zoption are provided for general
          informational and organizational purposes only. Zoption does not provide financial,
          accounting, tax, investment, or legal advice. You are responsible for reviewing and
          verifying information before relying on it or making financial or other decisions. You
          should consult an appropriately qualified professional when necessary. We do not guarantee
          that user-provided data, imported files, automatically generated classifications,
          calculations, or analyses will be accurate or complete. You are responsible for
          maintaining appropriate copies or backups of information that is important to you. To the
          maximum extent permitted by applicable law, Zoption and its operator will not be liable
          for indirect, incidental, special, consequential, exemplary, or punitive damages, or for
          any loss of profits, revenue, business opportunities, goodwill, data, or anticipated
          savings, arising from or relating to your access to or use of Zoption, your inability to
          use Zoption, reliance on information produced through Zoption, unauthorized access to your
          account, or the conduct of a third-party service provider. To the maximum extent permitted
          by applicable law, our total aggregate liability arising from or relating to Zoption or
          these Terms will not exceed the greater of: (a) the total amount you paid to Zoption
          during the 12 months immediately preceding the event giving rise to the claim; or (b) PHP
          1,000. These disclaimers and limitations do not apply to liability arising from fraud, bad
          faith, willful misconduct, gross negligence, or any other liability that cannot lawfully
          be excluded or limited. They also do not limit any mandatory rights or remedies available
          to you under applicable consumer-protection or data-protection laws. Nothing in these
          Terms excludes liability that cannot lawfully be excluded.
        </p>
      </section>

      <section>
        <h2>11. Indemnity</h2>
        <p>
          To the extent permitted by applicable law, you agree to indemnify and hold harmless
          Zoption and its operator from third-party claims, damages, liabilities, judgments, and
          reasonable costs and expenses, including reasonable legal fees where recoverable, that
          directly arise from: (a) your unlawful or fraudulent use of Zoption; (b) content, files,
          or other materials you submit through Zoption that infringe another person’s
          intellectual-property, privacy, or other legal rights; or (c) your intentional or material
          violation of these Terms. We will provide you with reasonable notice of any covered claim
          and reasonable cooperation in responding to it. You may not settle a claim in a manner
          that admits wrongdoing by, imposes liability on, or requires action from Zoption without
          our prior written consent. You are not required to indemnify Zoption for any claim arising
          from our own breach of these Terms, violation of applicable law, fraud, willful
          misconduct, or negligence. This section does not limit any mandatory rights or remedies
          available under applicable consumer-protection or other laws.
        </p>
      </section>

      <section>
        <h2>12. Governing law, disputes, and changes</h2>
        <p>
          These Terms and any dispute arising out of or relating to Zoption are governed by the laws
          of the Republic of the Philippines, without regard to conflict-of-laws principles.
          However, nothing in these Terms limits any mandatory rights or protections available to
          you under the laws applicable in your location. Before commencing formal proceedings, you
          should contact us at <a href="mailto:support@zoption.site">support@zoption.site</a> and
          provide sufficient details about the dispute. You and Zoption agree to attempt in good
          faith to resolve the matter through our internal complaint-resolution process. For
          disputes covered by applicable Philippine internet-transaction laws, the internal
          complaint-resolution process will be considered exhausted if the complaint remains
          unresolved seven calendar days after it was submitted. If the dispute cannot be resolved
          informally, either party may bring the matter before a court of competent jurisdiction and
          proper venue under applicable Philippine law. Nothing in these Terms prevents you from
          filing a complaint with the Department of Trade and Industry, the National Privacy
          Commission, or another government authority with jurisdiction over the matter. We may
          update these Terms from time to time to reflect changes to Zoption, our business
          practices, or applicable legal and regulatory requirements. The updated Terms will
          identify their effective date. When required by law, or when changes materially affect
          your rights or obligations, we will provide reasonable advance notice through email, an
          in-service notification, or another appropriate method. Unless otherwise required by law,
          updated Terms will apply prospectively from their stated effective date. By continuing to
          use Zoption after that date, you agree to the updated Terms. If you do not agree to an
          update, you must stop using Zoption and may delete your account through your account
          settings. Where applicable law requires your express consent to a change, the change will
          not apply to you unless that consent is obtained.
        </p>
      </section>

      <section>
        <h2>13. Contact</h2>
        <p>
          Legal entity: Zoption
          <br />
          Address: San Francisco, Cebu, Philippines
          <br />
          Email: <a href="mailto:support@zoption.site">support@zoption.site</a>
        </p>
      </section>
    </LegalPageLayout>
  );
}
