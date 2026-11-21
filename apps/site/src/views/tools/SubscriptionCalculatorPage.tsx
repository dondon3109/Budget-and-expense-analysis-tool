import type { ReactNode } from "react";

import { LegalPageLayout } from "../../components/legal/LegalPageLayout";
import { appUrl, NEW_TAB } from "../../lib/appUrl";
import { formatPeso } from "../../lib/formatters";
import { SUBSCRIPTION_CALCULATOR_SIGNUP_PATH } from "../../lib/siteEvents";
import { averageMonthlyMinor, yearlyCostMinor } from "./subscriptionCosts";
import "./BudgetCalculatorPage.css";
import "./SubscriptionCalculatorPage.css";

export const SUBSCRIPTION_CALCULATOR_LAST_UPDATED = "November 21, 2026";

/** Round monthly charges, to show how a small bill adds up; not any provider's price. */
const EXAMPLE_MONTHLY_MINOR = [9_900, 14_900, 29_900, 54_900];

/** Static apart from `calculator`, the Astro island that does the arithmetic. */
export function SubscriptionCalculatorPage({ calculator }: { calculator?: ReactNode }) {
  return (
    <LegalPageLayout
      title="Subscription Cost Calculator for Philippine Pesos"
      summary="Add up every streaming, app, gym, and auto-debit subscription you pay for and see what they cost you per month and per year. Runs entirely in your browser, nothing you type is sent anywhere, and you do not need an account."
      lastUpdated={SUBSCRIPTION_CALCULATOR_LAST_UPDATED}
    >
      {calculator}

      <h2>What a small monthly charge costs in a year</h2>
      <table className="calc-table">
        <thead>
          <tr>
            <th scope="col">Charged monthly</th>
            <th scope="col">Per year</th>
            <th scope="col">Over 3 years</th>
          </tr>
        </thead>
        <tbody>
          {EXAMPLE_MONTHLY_MINOR.map((monthlyMinor) => {
            const yearlyMinor = yearlyCostMinor(monthlyMinor, "monthly");
            return (
              <tr key={monthlyMinor}>
                <th scope="row">{formatPeso(monthlyMinor)}</th>
                <td>{formatPeso(yearlyMinor)}</td>
                <td>{formatPeso(yearlyMinor * 3)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p>
        A charge you barely notice each month is a noticeable amount each year. A{" "}
        {formatPeso(yearlyCostMinor(129_900, "yearly"))} yearly renewal works out to about{" "}
        {formatPeso(averageMonthlyMinor(yearlyCostMinor(129_900, "yearly")))} a month, which is why
        this calculator shows both figures side by side.
      </p>

      <h2>How to find every subscription you pay for</h2>
      <p>
        Subscriptions are easy to undercount because the charges are spread across different places.
        Check each of these for the last three months:
      </p>
      <ul>
        <li>
          <strong>Credit and debit card statements.</strong> Look for small charges that repeat on
          the same day each month, especially in US dollars, which arrive as slightly different peso
          amounts each time.
        </li>
        <li>
          <strong>GCash and Maya.</strong> Linked merchants and auto-debit authorisations charge
          your wallet directly, so they never show on a card statement.
        </li>
        <li>
          <strong>Google Play and the App Store.</strong> Their subscription pages list every app
          renewal billed through your phone, including free trials that have quietly converted.
        </li>
        <li>
          <strong>Your telco bill or load.</strong> Postpaid add-ons and charge-to-load services
          renew without a separate receipt.
        </li>
      </ul>
      <p>
        If you find one you no longer want, the{" "}
        <a href="/guides/cancel-subscriptions-auto-debits-philippines">
          guide to cancelling subscriptions and auto-debits in the Philippines
        </a>{" "}
        walks through stopping charges on GCash, Maya, cards, and app stores.
      </p>

      <h2>Monthly or yearly billing?</h2>
      <p>
        Yearly plans are often cheaper than twelve monthly payments, but only for a service you will
        keep for the whole year. Put both options into the calculator as two rows and compare the
        yearly totals; if the saving is small, monthly billing keeps it easy to cancel.
      </p>

      <h2>Exact to the centavo</h2>
      <p>
        Every amount is converted to a yearly cost first, which is exact for weekly (52 charges),
        monthly (12), quarterly (4), and yearly billing. The monthly figure is that yearly total
        spread evenly over 12 months and rounded to the nearest centavo, so it is an average rather
        than any single bill.
      </p>

      <h2>Keep the list current</h2>
      <p>
        A one-time count goes stale as soon as a free trial converts. Zoption keeps your
        subscriptions on a renewal calendar, and when you{" "}
        <a href="/import">import a bank statement</a> it suggests the recurring charges it finds so
        you can add them in one step. To see how subscriptions fit a whole budget, try the{" "}
        <a href="/tools/50-30-20-calculator">50/30/20 calculator</a>.
      </p>

      <p className="calc-cta">
        <a
          className="calc-cta-link"
          href={appUrl(SUBSCRIPTION_CALCULATOR_SIGNUP_PATH)}
          data-site-event="subscription_calculator_signup_clicked"
          {...NEW_TAB}
        >
          Track your subscriptions in Zoption for free
        </a>
      </p>
    </LegalPageLayout>
  );
}
