import { useMemo, useState } from "react";
import type { OfwCurrency, RemittanceProvider } from "@zoption/shared";
import {
  calculateRemittance,
  compareRemittanceProviders,
  DEFAULT_OFW_EXCHANGE_RATES,
  OFW_CURRENCIES,
  REMITTANCE_PROVIDERS,
} from "@zoption/shared";
import {
  Building2,
  CheckCircle2,
  Coins,
  Globe,
  HelpCircle,
  Percent,
  TrendingDown,
} from "lucide-react";
import { formatMoney } from "../../lib/formatters";
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

const PROVIDER_NAMES: Record<RemittanceProvider, string> = {
  mid_market: "Mid-Market (Zero Spread)",
  wise: "Wise",
  remitly: "Remitly",
  western_union: "Western Union",
  bank_wire: "Traditional Bank Wire",
};

export function RemittanceCalculatorSection() {
  const [sendAmount, setSendAmount] = useState<number>(1000);
  const [fromCurrency, setFromCurrency] = useState<OfwCurrency>("USD");
  const [selectedProvider, setSelectedProvider] = useState<RemittanceProvider>("wise");
  const [transferFee, setTransferFee] = useState<number>(0);
  const [useCustomRate, setUseCustomRate] = useState<boolean>(false);
  const [customRate, setCustomRate] = useState<string>("");

  const benchmark = DEFAULT_OFW_EXCHANGE_RATES[fromCurrency];
  const parsedCustomRate = useCustomRate && customRate ? parseFloat(customRate) : undefined;
  const sendAmountMinor = Math.round(Math.max(0, sendAmount || 0) * 100);
  const transferFeeMinor = Math.round(Math.max(0, transferFee || 0) * 100);

  const singleResult = useMemo(() => {
    return calculateRemittance({
      sendAmountMinor,
      fromCurrency,
      provider: selectedProvider,
      transferFeeMinor,
      customExchangeRate: parsedCustomRate && !isNaN(parsedCustomRate) ? parsedCustomRate : undefined,
    });
  }, [sendAmountMinor, fromCurrency, selectedProvider, transferFeeMinor, parsedCustomRate]);

  const providerComparison = useMemo(() => {
    return compareRemittanceProviders(sendAmountMinor, fromCurrency);
  }, [sendAmountMinor, fromCurrency]);

  const bestProvider = useMemo(() => {
    // Exclude mid_market theoretical baseline from best commercial provider
    const commercialProviders: RemittanceProvider[] = ["wise", "remitly", "western_union", "bank_wire"];
    let best: RemittanceProvider = "wise";
    let maxReceived = providerComparison[best]?.netPhpReceivedMinor ?? 0;

    for (const p of commercialProviders) {
      const received = providerComparison[p]?.netPhpReceivedMinor ?? 0;
      if (received > maxReceived) {
        maxReceived = received;
        best = p;
      }
    }
    return best;
  }, [providerComparison]);

  const currentCurrencyInfo = CURRENCY_LABELS[fromCurrency];

  return (
    <section className="remittance-calculator-section" aria-labelledby="remittance-heading">
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
            Simulate international transfers, uncover hidden FX markup spreads, and maximize the PHP
            arriving home to your family or savings ledger.
          </p>
        </div>

        <div className="remittance-rate-pill">
          <span className="rate-label">Mid-market Benchmark:</span>
          <strong>
            1 {fromCurrency} = ₱{benchmark?.midMarketRate.toFixed(2) ?? "—"}
          </strong>
        </div>
      </div>

      <div className="remittance-calculator-grid">
        {/* Left Column: Input Form */}
        <div className="remittance-card remittance-inputs-card">
          <h3 className="remittance-card-title">Transfer Parameters</h3>
          
          <div className="remittance-field">
            <label htmlFor="remittance-from-currency">Send Currency</label>
            <div className="remittance-select-wrapper">
              <select
                id="remittance-from-currency"
                value={fromCurrency}
                onChange={(e) => {
                  setFromCurrency(e.target.value as OfwCurrency);
                  if (useCustomRate) {
                    setCustomRate(
                      DEFAULT_OFW_EXCHANGE_RATES[e.target.value as OfwCurrency]?.midMarketRate.toString() || ""
                    );
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
            <label htmlFor="remittance-send-amount">
              Send Amount ({currentCurrencyInfo.symbol})
            </label>
            <div className="remittance-input-wrapper">
              <span className="input-currency-prefix">{currentCurrencyInfo.symbol}</span>
              <input
                id="remittance-send-amount"
                type="number"
                min="1"
                step="any"
                value={sendAmount || ""}
                placeholder="1000"
                onChange={(e) => setSendAmount(parseFloat(e.target.value) || 0)}
              />
            </div>
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
            <label htmlFor="remittance-fee-input">
              Upfront Transfer Fee ({currentCurrencyInfo.symbol})
            </label>
            <div className="remittance-input-wrapper">
              <span className="input-currency-prefix">{currentCurrencyInfo.symbol}</span>
              <input
                id="remittance-fee-input"
                type="number"
                min="0"
                step="any"
                value={transferFee || ""}
                placeholder="0.00"
                onChange={(e) => setTransferFee(parseFloat(e.target.value) || 0)}
              />
            </div>
          </div>

          <div className="remittance-custom-rate-toggle">
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={useCustomRate}
                onChange={(e) => {
                  setUseCustomRate(e.target.checked);
                  if (e.target.checked && !customRate) {
                    setCustomRate(benchmark?.midMarketRate.toString() || "");
                  }
                }}
              />
              <span>Override with custom exchange rate</span>
            </label>
            {useCustomRate && (
              <div className="custom-rate-input-box">
                <label htmlFor="remittance-custom-rate">Custom 1 {fromCurrency} in PHP</label>
                <input
                  id="remittance-custom-rate"
                  type="number"
                  step="0.0001"
                  value={customRate}
                  placeholder={benchmark?.midMarketRate.toString() ?? "56.50"}
                  onChange={(e) => setCustomRate(e.target.value)}
                />
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

          <div className="results-highlight-box">
            <span className="results-highlight-label">Recipient Receives in Philippines</span>
            <strong className="results-highlight-amount">
              {formatMoney(singleResult.netPhpReceivedMinor)}
            </strong>
            <div className="results-highlight-sub">
              Effective exchange rate: 1 {fromCurrency} = ₱{singleResult.effectiveRate.toFixed(4)}
            </div>
          </div>

          <div className="results-breakdown-grid">
            <div className="breakdown-item">
              <div className="breakdown-label">
                <Coins size={15} aria-hidden="true" />
                <span>Gross Value (Mid-Market)</span>
              </div>
              <strong className="breakdown-value">
                {formatMoney(singleResult.grossConvertedPhpMinor)}
              </strong>
            </div>

            <div className="breakdown-item">
              <div className="breakdown-label">
                <TrendingDown size={15} aria-hidden="true" />
                <span>Hidden FX Spread Loss</span>
              </div>
              <strong className={`breakdown-value ${singleResult.spreadLossPhpMinor > 0 ? "loss" : ""}`}>
                {singleResult.spreadLossPhpMinor > 0 ? "−" : ""}
                {formatMoney(singleResult.spreadLossPhpMinor)}
              </strong>
            </div>

            <div className="breakdown-item">
              <div className="breakdown-label">
                <Building2 size={15} aria-hidden="true" />
                <span>Upfront Transfer Fee</span>
              </div>
              <strong className={`breakdown-value ${singleResult.transferFeeInPhpMinor > 0 ? "loss" : ""}`}>
                {singleResult.transferFeeInPhpMinor > 0 ? "−" : ""}
                {formatMoney(singleResult.transferFeeInPhpMinor)}
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

          {singleResult.spreadLossPhpMinor > 0 && (
            <div className="remittance-loss-callout">
              <HelpCircle size={16} aria-hidden="true" />
              <p>
                <strong>Hidden Markup Warning:</strong> You lose approximately{" "}
                <strong>{formatMoney(singleResult.spreadLossPhpMinor)}</strong> in rate spread alone
                compared to the true mid-market rate.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Provider Comparison Section */}
      <div className="remittance-card remittance-comparison-card">
        <div className="comparison-header">
          <div>
            <h3 className="remittance-card-title">Provider Spread & Value Comparison</h3>
            <p className="comparison-subtitle">
              Based on sending {currentCurrencyInfo.symbol}
              {sendAmount.toLocaleString("en-US")} {fromCurrency} converted directly to Philippine Pesos.
            </p>
          </div>
          <div className="best-provider-badge">
            <CheckCircle2 size={15} aria-hidden="true" />
            <span>Best Value: {PROVIDER_NAMES[bestProvider]}</span>
          </div>
        </div>

        <div className="comparison-table-wrapper">
          <table className="comparison-table">
            <thead>
              <tr>
                <th>Provider</th>
                <th>Effective Rate</th>
                <th>Estimated Spread Loss</th>
                <th className="text-right">Net Received (PHP)</th>
                <th className="text-right">Total Drag</th>
              </tr>
            </thead>
            <tbody>
              {REMITTANCE_PROVIDERS.map((provider) => {
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
                    <td className="rate-cell">₱{res.effectiveRate.toFixed(4)}</td>
                    <td className="spread-cell">
                      {res.spreadLossPhpMinor > 0 ? (
                        <span className="spread-loss">−{formatMoney(res.spreadLossPhpMinor)}</span>
                      ) : (
                        <span className="spread-zero">₱0 (0%)</span>
                      )}
                    </td>
                    <td className="received-cell text-right">
                      <strong className="received-amount">
                        {formatMoney(res.netPhpReceivedMinor)}
                      </strong>
                    </td>
                    <td className="drag-cell text-right">
                      <span className={`drag-percent ${res.effectiveLossPercent > 2 ? "high-drag" : ""}`}>
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
