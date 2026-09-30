import { Check, PiggyBank, Sparkles, TrendingUp } from "lucide-react";
import { useState } from "react";

export function FeatureModules() {
  const [savingsEnabled, setSavingsEnabled] = useState<boolean>(true);
  const [activeSavingsCadence, setActiveSavingsCadence] = useState<"monthly" | "daily" | "yearly">(
    "monthly",
  );

  return (
    <section className="facet-modules" id="modules" aria-labelledby="modules-title">
      <div className="section-head">
        <p className="eyebrow">Six modules, one calm view</p>
        <h2 id="modules-title">Everything that shapes your month, in one quiet place.</h2>
        <p className="section-lead">
          Zoption works the way you actually track money — reviewing files, following budgets, and
          noticing the recurring costs that quietly add up.
        </p>
      </div>

      <div className="facets">
        <article className="facet import-support">
          <div className="facet-text">
            <p className="facet-kicker">Filing</p>
            <h3>Import from the files you already use.</h3>
            <h4>Start with Excel</h4>
            <h4>Bring your bank export</h4>
            <p>
              Whether it&rsquo;s a bank export or a spreadsheet, choosing a CSV, XLSX, or XLS
              workbook opens a preview where you map columns, catch errors, and flag duplicates —
              before any row is saved.
            </p>
            <div className="facet-tags">
              <span>CSV &middot; XLSX &middot; XLS</span>
              <span>Preview-first review</span>
              <span>Duplicate prevention</span>
            </div>
          </div>
          <div className="facet-visual" aria-hidden="true">
            <div className="mini-chip-row">
              <span>Monthly-spend.xlsx</span>
              <span className="chip in-soft">
                <Check size={13} /> Ready to review
              </span>
            </div>
            <div className="sheet">
              <div className="sheet-row heading">
                <span>Date</span>
                <span>Description</span>
                <span>Category</span>
                <span>Amount</span>
              </div>
              <div className="sheet-row">
                <span>Jul 02</span>
                <span>Neighborhood market</span>
                <span>Groceries</span>
                <span>₱1,240</span>
              </div>
              <div className="sheet-row">
                <span>Jul 05</span>
                <span>Monthly salary</span>
                <span>Income</span>
                <span>₱48,000</span>
              </div>
              <div className="sheet-row">
                <span>Jul 08</span>
                <span>Electric bill</span>
                <span>Utilities</span>
                <span>₱2,180</span>
              </div>
              <div className="sheet-row muted-row">
                <span>Jul 11</span>
                <span>Bank transfer</span>
                <span>Review</span>
                <span>₱3,500</span>
              </div>
            </div>
            <p className="facet-note">Every row stays reviewable</p>
          </div>
        </article>

        <article className="facet">
          <div className="facet-text">
            <p className="facet-kicker">Budgeting</p>
            <h3>Set budgets that follow you.</h3>
            <p>
              Give each category a practical monthly target and watch progress in plain language.
              Recurring expenses roll into the same clear picture, so nothing sneaks up at the end
              of the month.
            </p>
            <div className="facet-tags">
              <span>Per-category targets</span>
              <span>Progress in plain words</span>
              <span>Six-month trends</span>
            </div>
          </div>
          <div className="facet-visual" aria-hidden="true">
            <div className="balance-row">
              <span>July budget</span>
              <span>₱4,800 of ₱6,500</span>
            </div>
            <div className="progress row">
              <span>Groceries</span>
              <b>
                ₱4,800 <small>/ ₱6,500</small>
              </b>
              <i>
                <em style={{ width: "74%" }} />
              </i>
            </div>
            <div className="progress row">
              <span>Utilities</span>
              <b>
                ₱2,100 <small>/ ₱3,000</small>
              </b>
              <i>
                <em style={{ width: "70%" }} />
              </i>
            </div>
            <div className="progress row">
              <span>Transport</span>
              <b>
                ₱900 <small>/ ₱1,200</small>
              </b>
              <i>
                <em style={{ width: "75%" }} />
              </i>
            </div>
          </div>
        </article>

        <article className="facet">
          <div className="facet-text">
            <p className="facet-kicker">Subscription tracking</p>
            <h3>Name the bills that quietly repeat.</h3>
            <p>
              Log a subscription and Zoption records its next charge as an expense. Switch to the
              visual renewal calendar to track payment schedules, upcoming billing cycles, and
              cash-flow impact on an interactive month-by-month grid.
            </p>
            <div className="facet-tags">
              <span>Visual renewal calendar</span>
              <span>Payment schedules</span>
              <span>Cash-flow impact</span>
              <span>Annual plans</span>
            </div>
          </div>
          <div className="facet-visual" aria-hidden="true">
            <div className="bill-row">
              <span>Spotify</span>
              <small>Renews ₱139 &middot; Jul 17</small>
            </div>
            <div className="bill-row">
              <span>Canva Pro</span>
              <small>Renews ₱249 &middot; Aug 01</small>
            </div>
            <div className="bill-row">
              <span>iCloud+</span>
              <small>Renews ₱49 &middot; Jul 24</small>
            </div>
            <div className="bill-row">
              <span>Netflix</span>
              <small>Renews ₱549 &middot; Aug 09</small>
            </div>
            <div className="balance-row">
              <span>Upcoming charges</span>
              <span className="chip warn">₱986 this month</span>
            </div>
          </div>
        </article>

        <article className="facet">
          <div className="facet-text">
            <p className="facet-kicker">Transferring</p>
            <h3>Move money without surprises.</h3>
            <p>
              Transfer between your own accounts and see the exact amount that arrives after any fee
              is deducted — then add the transfer to the ledger. No guessing what a move really
              costs.
            </p>
            <div className="facet-tags">
              <span>Fee-aware transfers</span>
              <span>Across your accounts</span>
              <span>Dollar &amp; peso</span>
            </div>
          </div>
          <div className="facet-visual" aria-hidden="true">
            <div className="balance-row">
              <span>Transfer</span>
              <span className="chip in-soft">₱3,500</span>
            </div>
            <div className="bill-row">
              <span>From &middot; Checking</span>
              <small>₱48,000 available</small>
            </div>
            <div className="bill-row">
              <span>To &middot; Savings</span>
              <small>0.6% interest on</small>
            </div>
            <div className="balance-row transfer-result">
              <span>After ₱15 transfer fee</span>
              <b>+₱3,485</b>
            </div>
          </div>
        </article>

        <article className="facet">
          <div className="facet-text">
            <p className="facet-kicker">Savings</p>
            <h3>Put your savings to work while you sleep.</h3>
            <p>
              Turn a savings account on and set the annual rate and pay day you want. Zoption
              accrues interest daily, monthly, or yearly and adds the earned amount to your balance
              — automatically.
            </p>
            <div className="facet-tags">
              <button
                type="button"
                className={`facet-tag-btn ${activeSavingsCadence === "daily" ? "active" : ""}`}
                onClick={() => {
                  setSavingsEnabled(true);
                  setActiveSavingsCadence("daily");
                }}
              >
                Daily
              </button>
              <button
                type="button"
                className={`facet-tag-btn ${activeSavingsCadence === "monthly" ? "active" : ""}`}
                onClick={() => {
                  setSavingsEnabled(true);
                  setActiveSavingsCadence("monthly");
                }}
              >
                Monthly
              </button>
              <button
                type="button"
                className={`facet-tag-btn ${activeSavingsCadence === "yearly" ? "active" : ""}`}
                onClick={() => {
                  setSavingsEnabled(true);
                  setActiveSavingsCadence("yearly");
                }}
              >
                Yearly
              </button>
              <span>Your rate, your pay day</span>
              <span>Interest on</span>
            </div>
          </div>
          <div className="facet-visual">
            <div className="balance-row" aria-hidden="true">
              <span>Savings</span>
              <b>₱28,500</b>
            </div>
            <div className="balance-row interest-row">
              <span aria-hidden="true">
                <PiggyBank size={14} aria-hidden="true" />{" "}
                {savingsEnabled
                  ? `0.6% p.a. · ${
                      activeSavingsCadence === "monthly"
                        ? "monthly pay day"
                        : activeSavingsCadence === "daily"
                          ? "daily accrual"
                          : "yearly pay day"
                    }`
                  : "0.6% p.a. · Interest paused"}
              </span>
              <button
                type="button"
                className={`switch ${savingsEnabled ? "on" : "off"}`}
                role="switch"
                aria-checked={savingsEnabled}
                aria-label="Toggle savings interest accrual"
                onClick={() => setSavingsEnabled((prev) => !prev)}
              />
            </div>
            <div className="interest-gauge">
              <i>
                <em
                  style={{
                    transform: !savingsEnabled
                      ? "scaleX(0)"
                      : activeSavingsCadence === "daily"
                        ? "scaleX(0.95)"
                        : activeSavingsCadence === "monthly"
                          ? "scaleX(0.72)"
                          : "scaleX(0.45)",
                    opacity: savingsEnabled ? 1 : 0.3,
                  }}
                />
              </i>
            </div>
            <div className="balance-row" aria-hidden="true">
              <span>{savingsEnabled ? "Interest earned" : "Accrual status"}</span>
              <span className={`chip ${savingsEnabled ? "in-soft" : "muted-chip"}`}>
                <TrendingUp size={13} aria-hidden="true" />
                {savingsEnabled
                  ? activeSavingsCadence === "daily"
                    ? "+₱7.13 daily"
                    : activeSavingsCadence === "monthly"
                      ? "+₱214 last month"
                      : "+₱2,568 annual yield"
                  : "Paused (₱0)"}
              </span>
            </div>
          </div>
        </article>

        <article className="facet">
          <div className="facet-text">
            <p className="facet-kicker">Assist &mdash; always grounded</p>
            <h3>Ask your numbers, not a chatbot.</h3>
            <p>
              The AI Financial Assistant answers questions about <em>your</em> data with evidence
              and clear limits. It reads only what you ask about, never edits a number, and explains
              the reasoning behind each answer.
            </p>
            <div className="facet-tags">
              <span>Your data only</span>
              <span>Grounded answers</span>
              <span>Never edits</span>
              <span>You consent first</span>
            </div>
          </div>
          <div className="facet-visual" aria-hidden="true">
            <div className="chat">
              <div className="bubble user">What happens to my spending after the 15th?</div>
              <div className="bubble bot">
                After July 15 you spent <b>₱9,240</b> across <b>34</b> transactions. Groceries led
                at <b>₱3,180</b>, up <b>11%</b> vs. the same window in June.
              </div>
              <div className="bubble user">Which are recurring?</div>
              <div className="bubble bot">
                <b>4</b> of your charges repeat monthly, totalling <b>₱986</b>. The largest is
                Netflix at <b>₱549</b>.
              </div>
            </div>
            <div className="chat-input">
              <Sparkles size={15} aria-hidden="true" /> Ask about your money&hellip;
            </div>
          </div>
        </article>
      </div>
    </section>
  );
}
