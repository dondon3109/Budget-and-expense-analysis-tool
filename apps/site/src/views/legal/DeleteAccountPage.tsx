import { LegalPageLayout } from "../../components/legal/LegalPageLayout";

export function DeleteAccountPage() {
  return (
    <LegalPageLayout
      title="Delete your Zoption account"
      summary="How to delete your Zoption account and its data from the Android app, the web app, or by email, and what is removed or kept."
      lastUpdated="November 20, 2026"
    >
      <section>
        <h2>1. Delete it in the Android app</h2>
        <ol>
          <li>Open Zoption and sign in.</li>
          <li>Tap More, then Account.</li>
          <li>Under Delete account, enter your current password and confirm.</li>
        </ol>
        <p>
          Deletion needs an internet connection. The encrypted copy on your phone is cleared once
          Zoption confirms the deletion.
        </p>
      </section>

      <section>
        <h2>2. Delete it in the web app</h2>
        <ol>
          <li>
            Sign in at <a href="https://app.zoption.site">app.zoption.site</a>.
          </li>
          <li>Open Settings and scroll to Danger zone.</li>
          <li>Choose Delete account, enter your current password, and confirm.</li>
        </ol>
        <p>
          If you signed up with Google and have no password, create one in Settings first, or ask by
          email as described below.
        </p>
      </section>

      <section>
        <h2>3. Ask by email</h2>
        <p>
          If you cannot sign in, email{" "}
          <a href="mailto:support@zoption.site">support@zoption.site</a> from the address on your
          Zoption account and ask us to delete it. We confirm the request with that address before
          deleting anything.
        </p>
      </section>

      <section>
        <h2>4. Before you delete</h2>
        <p>
          An active paid subscription blocks deletion. Cancel its renewal in Plan and billing, or
          wait for the paid period to end. Deletion is permanent and cannot be undone, so download
          an account archive first if you want a copy of your records.
        </p>
      </section>

      <section>
        <h2>5. What is deleted</h2>
        <p>
          Your sign-in account, profile and profile picture, and your whole financial workspace:
          accounts, transactions, categories, budgets, bills and subscriptions, calendar events,
          imported records, savings goals, debts, assistant chats and remembered facts, and bug
          reports.
        </p>
      </section>

      <section>
        <h2>6. What is kept</h2>
        <p>
          A minimal deletion record is kept so an old sign-in token cannot recreate the workspace.
          Billing records with PayPal or Dodo Payments, if you paid, are kept as long as needed to
          meet legal and tax obligations and resolve disputes. Deleted data can stay in our
          providers&apos; backup copies until those backups expire on their normal schedule. The{" "}
          <a href="/privacy-policy">Privacy Policy</a> has the full retention details.
        </p>
      </section>

      <section>
        <h2>7. Delete some data but keep your account</h2>
        <p>
          You can delete individual transactions, receipts, goals, and other records in the app,
          delete one or all assistant chats, and clear the assistant&apos;s memory, without deleting
          your account.
        </p>
      </section>
    </LegalPageLayout>
  );
}
