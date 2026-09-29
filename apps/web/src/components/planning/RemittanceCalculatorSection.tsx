import { useMemo, useState } from "react";
import type { OfwCurrency, RemittanceCurrency, RemittanceProvider } from "@zoption/shared";
import {
  calculateRemittance,
  compareRemittanceProviders,
  MoneyParseError,
  OFW_CURRENCIES,
  parseAmountToMinor,
  REMITTANCE_PROVIDERS,
  remittanceDirectionFor,
  remittanceMidMarketRate,
} from "@zoption/shared";
import {
  Building2,
  CheckCircle2,
  Clock,
  Coins,
  Globe,
  HelpCircle,
  Percent,
  TrendingDown,
} from "lucide-react";
import { formatMoney } from "../../lib/formatters";
import { useWorkspaceCurrency } from "../../lib/workspaceCurrency";
import "./RemittanceCalculatorSection.css";

const CURRENCY_LABELS: Record<OfwCurrency, { name: string; symbol: string; country: string }> = {
  USD: { name: "US Dollar", symbol: "$", country: "United States" },
  EUR: { name: "Euro", symbol: "€", country: "European Union" },
  SGD: { name: "Singapore Dollar", symbol: "S$", country: "Singapore" },
  AED: { name: "UAE Dirham", symbol: "AED", country: "United Arab Emirates" },
  SAR: { name: "Saudi Riyal", symbol: "SAR", country: "Saudi Arabia" },
  JPY: { name: "Japanese Yen", symbol: "¥", country: "Japan" },
  CAD: { name: "Canadian Dollar", symbol: "CA$", country: "Canada" },
  GBP: { name: "British Pound", symbol: "£", country: "United Kingdom" },
  AUD: { name: "Australian Dollar", symbol: "A$", country: "Australia" },
};

const PESO_LABEL = { name: "Philippine Peso", symbol: "₱", country: "Philippines" };

function currencyLabel(currency: RemittanceCurrency) {
  return currency === "PHP" ? PESO_LABEL : CURRENCY_LABELS[currency];
}

/**
 * Received amounts can land in any corridor currency, not only the two workspace currencies
 * `formatMoney` knows. Pesos keep the app's whole-peso format; a foreign currency keeps cents,
 * since pesos sent abroad often arrive as small amounts.
 */
function formatCorridorMoney(amountMinor: number, currency: RemittanceCurrency): string {
  if (currency === "PHP") return formatMoney(amountMinor, "PHP");
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amountMinor / 100);
}

/** A peso-outbound rate is a small fraction (1 PHP = 0.0177 USD), so it keeps more places. */
function formatRate(rate: number): string {
  return rate >= 1 ? rate.toFixed(4) : rate.toFixed(6);
}

const PROVIDER_NAMES: Record<RemittanceProvider, string> = {
  mid_market: "Mid-Market (Zero Spread)",
  wise: "Wise",
  remitly: "Remitly",
  western_union: "Western Union",
  bank_wire: "Traditional Bank Wire",
};

/**
 * Resolves a typed amount into integer minor units through the shared parser, the same
 * boundary the mobile calculator uses. Anything the parser rejects, including a negative
 * amount, carries the reason instead of being quietly rounded or clamped to zero.
 */
function parseAmountField(value: string): { minor: number; error: string | null } {
  const trimmed = value.trim();
  if (trimmed === "") return { minor: 0, error: null };

  let parsed: number;
  try {
    parsed = parseAmountToMinor(trimmed);
  } catch (error) {
    return {
      minor: 0,
      error: error instanceof MoneyParseError ? error.message : "Enter a valid amount.",
    };
  }

  if (parsed < 0) return { minor: 0, error: "Enter an amount greater than zero." };
  return { minor: parsed, error: null };
}

// A trailing separator is allowed because it is a keystroke on the way to a real rate, not a
// different number: "60." and "60.0" both mean 60.
const CUSTOM_RATE_PATTERN = /^(?:\d+(?:\.\d*)?|\.\d+)$/;

/**
 * An exchange rate is not money, so it keeps its own parser. It still has to be strict:
 * parseFloat reads "12abc" as 12 and "-5" as -5, either of which would silently reprice
 * every figure below. An empty or unusable rate falls back to the benchmark mid-market
 * rate, the value the field is seeded with when the override is switched on.
 */
function parseCustomRateField(
  value: string,
  fallbackRate: number,
): { rate: number; error: string | null } {
  const trimmed = value.trim();
  if (trimmed === "") return { rate: fallbackRate, error: null };

  const rate = CUSTOM_RATE_PATTERN.test(trimmed) ? Number(trimmed) : Number.NaN;
  if (!Number.isFinite(rate) || rate <= 0) {
    return {
      rate: fallbackRate,
      error: `Enter an exchange rate greater than zero, such as ${fallbackRate >= 1 ? fallbackRate.toFixed(2) : fallbackRate.toFixed(6)}.`,
    };
  }
  return { rate, error: null };
}

export function RemittanceCalculatorSection() {
  // The workspace currency is the side money leaves from: a PHP workspace sends pesos abroad,
  // a USD workspace sends dollars (or another corridor currency) home to the Philippines.
  const direction = remittanceDirectionFor(useWorkspaceCurrency());
  const [sendAmountText, setSendAmountText] = useState("1000");
  const [foreignCurrency, setForeignCurrency] = useState<OfwCurrency>("USD");
  const [selectedProvider, setSelectedProvider] = useState<RemittanceProvider>("wise");
  const [transferFeeText, setTransferFeeText] = useState("");
  const [useCustomRate, setUseCustomRate] = useState<boolean>(false);
  const [customRate, setCustomRate] = useState<string>("");

  const sendCurrency: RemittanceCurrency = direction === "to_php" ? foreignCurrency : "PHP";
  const receiveCurrency: RemittanceCurrency = direction === "to_php" ? "PHP" : foreignCurrency;
  const midMarketRate = remittanceMidMarketRate(foreignCurrency, direction);
  const customRateField = useCustomRate ? parseCustomRateField(customRate, midMarketRate) : null;
  const customExchangeRate = customRateField?.rate;
  const customRateError = customRateField?.error ?? null;

  const sendAmount = parseAmountField(sendAmountText);
  const transferFee = parseAmountField(transferFeeText);
  const sendAmountMinor = sendAmount.minor;
  const transferFeeMinor = transferFee.minor;

  // An amount the section cannot send with, an unreadable fee, or an unusable rate makes every
  // figure the results column reports a guess, so it waits instead of showing a confident zero.
  const hasBlockingError =
    sendAmountMinor <= 0 ||
    sendAmount.error !== null ||
    transferFee.error !== null ||
    customRateError !== null;
  // The provider comparison prices the send amount alone: it ignores the fee and the custom rate,
  // so a typo in either must not blank a table that is still correct.
  const comparisonWaiting = sendAmountMinor <= 0 || sendAmount.error !== null;

  const singleResult = useMemo(() => {
    return calculateRemittance({
      sendAmountMinor,
      foreignCurrency,
      direction,
      provider: selectedProvider,
      transferFeeMinor,
      customExchangeRate,
    });
  }, [
    sendAmountMinor,
    foreignCurrency,
    direction,
    selectedProvider,
    transferFeeMinor,
    customExchangeRate,
  ]);

  const providerComparison = useMemo(() => {
    return compareRemittanceProviders(sendAmountMinor, foreignCurrency, direction);
  }, [sendAmountMinor, foreignCurrency, direction]);

  const bestProvider = useMemo(() => {
    // Exclude mid_market theoretical baseline from best commercial provider
    const commercialProviders: RemittanceProvider[] = [
      "wise",
      "remitly",
      "western_union",
      "bank_wire",
    ];
    let best: RemittanceProvider = "wise";
    let maxReceived = providerComparison[best]?.netReceivedMinor ?? 0;

    for (const p of commercialProviders) {
      const received = providerComparison[p]?.netReceivedMinor ?? 0;
      if (received > maxReceived) {
        maxReceived = received;
        best = p;
      }
    }
    return best;
  }, [providerComparison]);

  const sendInfo = currencyLabel(sendCurrency);
  const receiveInfo = currencyLabel(receiveCurrency);
  const foreignInfo = CURRENCY_LABELS[foreignCurrency];

  return (
    <section
      id="remittance-calculator"
      className="remittance-calculator-section"
      aria-labelledby="remittance-heading"
    >
      <div className="remittance-header">
        <div className="remittance-title-group">
          <div className="remittance-badge">
            <Globe size={16} aria-hidden="true" />
            <span>OFW & Cross-Border Planning</span>
          </div>
          <h2 id="remittance-heading" className="remittance-heading">
            Remittance & FX Fee Calculator
          </h2>
          <p className="remittance-subheading">
            {direction === "to_php"
              ? "Simulate international transfers, uncover hidden FX markup spreads, and maximize the PHP arriving home to your family or savings ledger."
              : "Simulate sending pesos abroad, uncover hidden FX markup spreads, and maximize what arrives on the other side."}
          </p>
        </div>

        <div className="remittance-rate-pill">
          <span className="rate-label">Mid-market Benchmark:</span>
          <strong>
            1 {sendCurrency} = {receiveInfo.symbol}
            {direction === "to_php" ? midMarketRate.toFixed(2) : formatRate(midMarketRate)}
          </strong>
        </div>
      </div>

      <div className="remittance-calculator-grid">
        {/* Left Column: Input Form */}
        <div className="remittance-card remittance-inputs-card">
          <h3 className="remittance-card-title">Transfer Parameters</h3>

          <div className="remittance-field">
            <label htmlFor="remittance-from-currency">
              {direction === "to_php" ? "Send Currency" : "Receive Currency"}
            </label>
            <div className="remittance-select-wrapper">
              <select
                id="remittance-from-currency"
                value={foreignCurrency}
                onChange={(e) => {
                  const next = e.target.value as OfwCurrency;
                  setForeignCurrency(next);
                  if (useCustomRate) {
                    setCustomRate(remittanceMidMarketRate(next, direction).toString());
                  }
                }}
              >
                {OFW_CURRENCIES.map((curr) => (
                  <option key={curr} value={curr}>
                    {curr} – {CURRENCY_LABELS[curr].name} ({CURRENCY_LABELS[curr].country})
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="remittance-field">
            <label htmlFor="remittance-send-amount">Send Amount ({sendInfo.symbol})</label>
            <div className="remittance-input-wrapper">
              <span className="input-currency-prefix">{sendInfo.symbol}</span>
              <input
                id="remittance-send-amount"
                type="text"
                inputMode="decimal"
                value={sendAmountText}
                placeholder="1000"
                aria-invalid={sendAmount.error !== null}
                aria-describedby={sendAmount.error ? "remittance-send-amount-error" : undefined}
                onChange={(e) => setSendAmountText(e.target.value)}
              />
            </div>
            {sendAmount.error && (
              <small className="field-error" id="remittance-send-amount-error">
                {sendAmount.error}
              </small>
            )}
          </div>

          <div className="remittance-field">
            <label htmlFor="remittance-provider-select">Remittance Provider</label>
            <div className="remittance-select-wrapper">
              <select
                id="remittance-provider-select"
                value={selectedProvider}
                onChange={(e) => setSelectedProvider(e.target.value as RemittanceProvider)}
                disabled={useCustomRate}
              >
                {REMITTANCE_PROVIDERS.map((p) => (
                  <option key={p} value={p}>
                    {PROVIDER_NAMES[p]}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="remittance-field">
            <label htmlFor="remittance-fee-input">Upfront Transfer Fee ({sendInfo.symbol})</label>
            <div className="remittance-input-wrapper">
              <span className="input-currency-prefix">{sendInfo.symbol}</span>
              <input
                id="remittance-fee-input"
                type="text"
                inputMode="decimal"
                value={transferFeeText}
                placeholder="0.00"
                aria-invalid={transferFee.error !== null}
                aria-describedby={transferFee.error ? "remittance-fee-input-error" : undefined}
                onChange={(e) => setTransferFeeText(e.target.value)}
              />
            </div>
            {transferFee.error && (
              <small className="field-error" id="remittance-fee-input-error">
                {transferFee.error}
              </small>
            )}
          </div>

          <div className="remittance-custom-rate-toggle">
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={useCustomRate}
                onChange={(e) => {
                  setUseCustomRate(e.target.checked);
                  if (e.target.checked && !customRate) {
                    setCustomRate(midMarketRate.toString());
                  }
                }}
              />
              <span>Override with custom exchange rate</span>
            </label>
            {useCustomRate && (
              <div className="custom-rate-input-box">
                <label htmlFor="remittance-custom-rate">
                  Custom 1 {sendCurrency} in {receiveCurrency}
                </label>
                {/* A number input drops "12abc" before the parser sees it, which would hide the
                    rejection behind a silently empty field. */}
                <input
                  id="remittance-custom-rate"
                  type="text"
                  inputMode="decimal"
                  value={customRate}
                  placeholder={midMarketRate.toString()}
                  aria-invalid={customRateError !== null}
                  aria-describedby={customRateError ? "remittance-custom-rate-error" : undefined}
                  onChange={(e) => setCustomRate(e.target.value)}
                />
                {customRateError && (
                  <small className="field-error" id="remittance-custom-rate-error">
                    {customRateError}
                  </small>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Key Metrics & Calculation Breakdown */}
        <div className="remittance-card remittance-results-card">
          <div className="results-header">
            <h3 className="remittance-card-title">Projected Remittance Value</h3>
            <span className="provider-tag">{PROVIDER_NAMES[selectedProvider]}</span>
          </div>

          {hasBlockingError && (
            <div className="results-pending" role="status">
              <Clock size={18} aria-hidden="true" />
              <div>
                <strong>Waiting for a valid amount</strong>
                <p>
                  Fix the highlighted field to see the projected received value, effective rate, and
                  fee breakdown.
                </p>
              </div>
            </div>
          )}

          {!hasBlockingError && (
            <>
              <div className="results-highlight-box">
                <span className="results-highlight-label">
                  Recipient Receives in {receiveInfo.country}
                </span>
                <strong className="results-highlight-amount">
                  {formatCorridorMoney(singleResult.netReceivedMinor, receiveCurrency)}
                </strong>
                <div className="results-highlight-sub">
                  Effective exchange rate: 1 {sendCurrency} = {receiveInfo.symbol}
                  {formatRate(singleResult.effectiveRate)}
                </div>
              </div>

              <div className="results-breakdown-grid">
                <div className="breakdown-item">
                  <div className="breakdown-label">
                    <Coins size={15} aria-hidden="true" />
                    <span>Gross Value (Mid-Market)</span>
                  </div>
                  <strong className="breakdown-value">
                    {formatCorridorMoney(singleResult.grossConvertedMinor, receiveCurrency)}
                  </strong>
                </div>

                <div className="breakdown-item">
                  <div className="breakdown-label">
                    <TrendingDown size={15} aria-hidden="true" />
                    <span>Hidden FX Spread Loss</span>
                  </div>
                  <strong
                    className={`breakdown-value ${singleResult.spreadLossMinor > 0 ? "loss" : ""}`}
                  >
                    {singleResult.spreadLossMinor > 0 ? "−" : ""}
                    {formatCorridorMoney(singleResult.spreadLossMinor, receiveCurrency)}
                  </strong>
                </div>

                <div className="breakdown-item">
                  <div className="breakdown-label">
                    <Building2 size={15} aria-hidden="true" />
                    <span>Upfront Transfer Fee</span>
                  </div>
                  <strong
                    className={`breakdown-value ${singleResult.transferFeeConvertedMinor > 0 ? "loss" : ""}`}
                  >
                    {singleResult.transferFeeConvertedMinor > 0 ? "−" : ""}
                    {formatCorridorMoney(singleResult.transferFeeConvertedMinor, receiveCurrency)}
                  </strong>
                </div>

                <div className="breakdown-item">
                  <div className="breakdown-label">
                    <Percent size={15} aria-hidden="true" />
                    <span>Total Fee Drag (% Loss)</span>
                  </div>
                  <strong className="breakdown-value drag">
                    {singleResult.effectiveLossPercent.toFixed(2)}%
                  </strong>
                </div>
              </div>

              {singleResult.spreadLossMinor > 0 && (
                <div className="remittance-loss-callout">
                  <HelpCircle size={16} aria-hidden="true" />
                  <p>
                    <strong>Hidden Markup Warning:</strong> You lose approximately{" "}
                    <strong>
                      {formatCorridorMoney(singleResult.spreadLossMinor, receiveCurrency)}
                    </strong>{" "}
                    in rate spread alone compared to the true mid-market rate.
                  </p>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Provider Comparison Section */}
      <div className="remittance-card remittance-comparison-card">
        <div className="comparison-header">
          <div>
            <h3 className="remittance-card-title">Provider Spread & Value Comparison</h3>
            {comparisonWaiting ? (
              <p className="comparison-subtitle">
                Provider spreads and net received value appear once a valid send amount is entered.
              </p>
            ) : (
              <p className="comparison-subtitle">
                Based on sending {sendInfo.symbol}
                {(sendAmountMinor / 100).toLocaleString("en-US")} {sendCurrency} converted directly
                to{" "}
                {direction === "to_php"
                  ? "Philippine Pesos"
                  : `${foreignInfo.name} (${foreignCurrency})`}
                .
              </p>
            )}
          </div>
          {!comparisonWaiting && (
            <div className="best-provider-badge">
              <CheckCircle2 size={15} aria-hidden="true" />
              <span>Best Value: {PROVIDER_NAMES[bestProvider]}</span>
            </div>
          )}
        </div>

        {/* At narrow widths this table scrolls sideways, and a scroll container with no tab stop
            is unreachable by keyboard. Same treatment as the dashboard's category list. */}
        <div
          className="comparison-table-wrapper"
          role="region"
          aria-label="Provider spread comparison"
          tabIndex={0}
        >
          <table className="comparison-table">
            <caption className="sr-only">Provider spread and value comparison</caption>
            <thead>
              <tr>
                <th scope="col">Provider</th>
                <th scope="col">Effective Rate</th>
                <th scope="col">Estimated Spread Loss</th>
                <th scope="col" className="text-right">
                  Net Received ({receiveCurrency})
                </th>
                <th scope="col" className="text-right">
                  Total Drag
                </th>
              </tr>
            </thead>
            <tbody>
              {comparisonWaiting && (
                <tr>
                  <td className="comparison-pending-cell" colSpan={5}>
                    Provider comparison is waiting for a valid send amount.
                  </td>
                </tr>
              )}
              {!comparisonWaiting &&
                REMITTANCE_PROVIDERS.map((provider) => {
                  const res = providerComparison[provider];
                  if (!res) return null;
                  const isBest = provider === bestProvider;
                  const isMidMarket = provider === "mid_market";

                  return (
                    <tr
                      key={provider}
                      className={`${isBest ? "row-best" : ""} ${isMidMarket ? "row-baseline" : ""}`}
                    >
                      <td className="provider-name-cell">
                        <div className="provider-cell-content">
                          <strong>{PROVIDER_NAMES[provider]}</strong>
                          {isBest && <span className="tag-best">Recommended</span>}
                          {isMidMarket && <span className="tag-baseline">Benchmark</span>}
                        </div>
                      </td>
                      <td className="rate-cell">
                        {receiveInfo.symbol}
                        {formatRate(res.effectiveRate)}
                      </td>
                      <td className="spread-cell">
                        {res.spreadLossMinor > 0 ? (
                          <span className="spread-loss">
                            −{formatCorridorMoney(res.spreadLossMinor, receiveCurrency)}
                          </span>
                        ) : (
                          <span className="spread-zero">
                            {formatCorridorMoney(0, receiveCurrency)} (0%)
                          </span>
                        )}
                      </td>
                      <td className="received-cell text-right">
                        <strong className="received-amount">
                          {formatCorridorMoney(res.netReceivedMinor, receiveCurrency)}
                        </strong>
                      </td>
                      <td className="drag-cell text-right">
                        <span
                          className={`drag-percent ${res.effectiveLossPercent > 2 ? "high-drag" : ""}`}
                        >
                          {res.effectiveLossPercent.toFixed(2)}%
                        </span>
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
