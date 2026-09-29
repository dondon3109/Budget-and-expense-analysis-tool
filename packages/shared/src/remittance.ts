import type { Currency } from "./types";

export type OfwCurrency = "USD" | "EUR" | "SGD" | "AED" | "SAR" | "JPY" | "CAD" | "GBP" | "AUD";

export type RemittanceProvider = "mid_market" | "wise" | "remitly" | "western_union" | "bank_wire";

export interface ExchangeRateBenchmark {
  fromCurrency: OfwCurrency;
  toCurrency: "PHP";
  midMarketRate: number; // e.g. 56.50
  providerSpreadEstimates: {
    wise: number; // typical spread % e.g. 0.005 (0.5%)
    remitly: number; // e.g. 0.015 (1.5%)
    westernUnion: number; // e.g. 0.025 (2.5%)
    bankWire: number; // e.g. 0.035 (3.5%)
  };
  lastUpdated: string; // ISO date
}

/**
 * Which way money moves across the peso border. `to_php` sends a foreign currency home to the
 * Philippines; `from_php` sends pesos out. The workspace currency picks the direction: a
 * PHP workspace sends pesos abroad, a USD workspace sends dollars home.
 */
export type RemittanceDirection = "to_php" | "from_php";

export type RemittanceCurrency = OfwCurrency | "PHP";

export function remittanceDirectionFor(workspaceCurrency: Currency): RemittanceDirection {
  return workspaceCurrency === "PHP" ? "from_php" : "to_php";
}

export interface RemittanceCalculationOptions {
  /** In send-currency minor units (e.g. 500.00 USD -> 50000). */
  sendAmountMinor: number;
  /** The non-peso side of the corridor. */
  foreignCurrency: OfwCurrency;
  /** Defaults to `to_php`. */
  direction?: RemittanceDirection;
  /** In send-currency minor units (default 0). */
  transferFeeMinor?: number;
  /** Optional user override: receive-currency units per one send-currency unit. */
  customExchangeRate?: number;
  provider?: RemittanceProvider;
}

export interface RemittanceCalculationResult {
  sendAmountMinor: number;
  sendCurrency: RemittanceCurrency;
  receiveCurrency: RemittanceCurrency;
  /** Receive-currency units per one send-currency unit, after the provider spread. */
  effectiveRate: number;
  midMarketRate: number;
  /** Converted at mid-market, in receive-currency minor units. */
  grossConvertedMinor: number;
  /** Converted at the effective rate (after the spread), in receive-currency minor units. */
  netReceivedMinor: number;
  /** In send-currency minor units. */
  transferFeeMinor: number;
  /** The fee converted at mid-market, in receive-currency minor units. */
  transferFeeConvertedMinor: number;
  /** Money lost to FX markup, in receive-currency minor units. */
  spreadLossMinor: number;
  /** transferFeeConvertedMinor + spreadLossMinor. */
  totalCostMinor: number;
  /** (totalCost / grossConverted) * 100 */
  effectiveLossPercent: number;
}

export interface DualCurrencyBalance {
  foreignCurrency: OfwCurrency;
  foreignBalanceMinor: number;
  convertedPhpMinor: number;
  exchangeRate: number;
}

export const DEFAULT_OFW_EXCHANGE_RATES: Record<OfwCurrency, ExchangeRateBenchmark> = {
  USD: {
    fromCurrency: "USD",
    toCurrency: "PHP",
    midMarketRate: 56.5,
    providerSpreadEstimates: {
      wise: 0.005,
      remitly: 0.015,
      westernUnion: 0.025,
      bankWire: 0.035,
    },
    lastUpdated: "2026-01-01T00:00:00.000Z",
  },
  EUR: {
    fromCurrency: "EUR",
    toCurrency: "PHP",
    midMarketRate: 61.2,
    providerSpreadEstimates: {
      wise: 0.005,
      remitly: 0.015,
      westernUnion: 0.025,
      bankWire: 0.035,
    },
    lastUpdated: "2026-01-01T00:00:00.000Z",
  },
  SGD: {
    fromCurrency: "SGD",
    toCurrency: "PHP",
    midMarketRate: 42.1,
    providerSpreadEstimates: {
      wise: 0.005,
      remitly: 0.015,
      westernUnion: 0.025,
      bankWire: 0.035,
    },
    lastUpdated: "2026-01-01T00:00:00.000Z",
  },
  AED: {
    fromCurrency: "AED",
    toCurrency: "PHP",
    midMarketRate: 15.38,
    providerSpreadEstimates: {
      wise: 0.005,
      remitly: 0.015,
      westernUnion: 0.025,
      bankWire: 0.035,
    },
    lastUpdated: "2026-01-01T00:00:00.000Z",
  },
  SAR: {
    fromCurrency: "SAR",
    toCurrency: "PHP",
    midMarketRate: 15.06,
    providerSpreadEstimates: {
      wise: 0.005,
      remitly: 0.015,
      westernUnion: 0.025,
      bankWire: 0.035,
    },
    lastUpdated: "2026-01-01T00:00:00.000Z",
  },
  JPY: {
    fromCurrency: "JPY",
    toCurrency: "PHP",
    midMarketRate: 0.38,
    providerSpreadEstimates: {
      wise: 0.005,
      remitly: 0.015,
      westernUnion: 0.025,
      bankWire: 0.035,
    },
    lastUpdated: "2026-01-01T00:00:00.000Z",
  },
  CAD: {
    fromCurrency: "CAD",
    toCurrency: "PHP",
    midMarketRate: 41.8,
    providerSpreadEstimates: {
      wise: 0.005,
      remitly: 0.015,
      westernUnion: 0.025,
      bankWire: 0.035,
    },
    lastUpdated: "2026-01-01T00:00:00.000Z",
  },
  GBP: {
    fromCurrency: "GBP",
    toCurrency: "PHP",
    midMarketRate: 71.5,
    providerSpreadEstimates: {
      wise: 0.005,
      remitly: 0.015,
      westernUnion: 0.025,
      bankWire: 0.035,
    },
    lastUpdated: "2026-01-01T00:00:00.000Z",
  },
  AUD: {
    fromCurrency: "AUD",
    toCurrency: "PHP",
    midMarketRate: 37.2,
    providerSpreadEstimates: {
      wise: 0.005,
      remitly: 0.015,
      westernUnion: 0.025,
      bankWire: 0.035,
    },
    lastUpdated: "2026-01-01T00:00:00.000Z",
  },
};

export const OFW_CURRENCIES: readonly OfwCurrency[] = [
  "USD",
  "EUR",
  "SGD",
  "AED",
  "SAR",
  "JPY",
  "CAD",
  "GBP",
  "AUD",
];

export const REMITTANCE_PROVIDERS: readonly RemittanceProvider[] = [
  "mid_market",
  "wise",
  "remitly",
  "western_union",
  "bank_wire",
];

function roundRate(rate: number): number {
  return Math.round(rate * 1_000_000) / 1_000_000;
}

/**
 * Mid-market receive units per one send unit. The benchmarks are quoted as pesos per foreign
 * unit, so sending pesos out reads the inverse.
 */
export function remittanceMidMarketRate(
  foreignCurrency: OfwCurrency,
  direction: RemittanceDirection = "to_php",
): number {
  const benchmark = DEFAULT_OFW_EXCHANGE_RATES[foreignCurrency];
  const pesosPerForeignUnit = benchmark ? benchmark.midMarketRate : 1;
  return direction === "to_php" ? pesosPerForeignUnit : roundRate(1 / pesosPerForeignUnit);
}

function providerSpread(benchmark: ExchangeRateBenchmark, provider: RemittanceProvider): number {
  if (provider === "wise") return benchmark.providerSpreadEstimates.wise;
  if (provider === "remitly") return benchmark.providerSpreadEstimates.remitly;
  if (provider === "western_union") return benchmark.providerSpreadEstimates.westernUnion;
  if (provider === "bank_wire") return benchmark.providerSpreadEstimates.bankWire;
  return 0;
}

export function calculateRemittance(
  options: RemittanceCalculationOptions,
): RemittanceCalculationResult {
  const direction = options.direction ?? "to_php";
  const benchmark = DEFAULT_OFW_EXCHANGE_RATES[options.foreignCurrency];
  const midMarketRate = remittanceMidMarketRate(options.foreignCurrency, direction);
  const provider = options.provider ?? "mid_market";

  let effectiveRate = options.customExchangeRate ?? midMarketRate;
  if (options.customExchangeRate == null && benchmark && provider !== "mid_market") {
    effectiveRate = roundRate(midMarketRate * (1 - providerSpread(benchmark, provider)));
  }

  const sendAmountMinor = Math.max(0, options.sendAmountMinor);
  const transferFeeMinor = Math.max(0, options.transferFeeMinor ?? 0);

  const grossConvertedMinor = Math.round(sendAmountMinor * midMarketRate);
  const netReceivedMinor = Math.round(sendAmountMinor * effectiveRate);
  const transferFeeConvertedMinor = Math.round(transferFeeMinor * midMarketRate);
  const spreadLossMinor = Math.max(0, grossConvertedMinor - netReceivedMinor);
  const totalCostMinor = transferFeeConvertedMinor + spreadLossMinor;
  const effectiveLossPercent =
    grossConvertedMinor > 0
      ? Math.round((totalCostMinor / grossConvertedMinor) * 100 * 100) / 100
      : 0;

  return {
    sendAmountMinor: options.sendAmountMinor,
    sendCurrency: direction === "to_php" ? options.foreignCurrency : "PHP",
    receiveCurrency: direction === "to_php" ? "PHP" : options.foreignCurrency,
    effectiveRate,
    midMarketRate,
    grossConvertedMinor,
    netReceivedMinor,
    transferFeeMinor,
    transferFeeConvertedMinor,
    spreadLossMinor,
    totalCostMinor,
    effectiveLossPercent,
  };
}

export function calculateDualCurrencyBalance(
  foreignBalanceMinor: number,
  currency: OfwCurrency,
  customRate?: number,
): DualCurrencyBalance {
  const benchmark = DEFAULT_OFW_EXCHANGE_RATES[currency];
  const exchangeRate = customRate ?? (benchmark ? benchmark.midMarketRate : 1);
  const convertedPhpMinor = Math.round(foreignBalanceMinor * exchangeRate);

  return {
    foreignCurrency: currency,
    foreignBalanceMinor,
    convertedPhpMinor,
    exchangeRate,
  };
}

export function compareRemittanceProviders(
  sendAmountMinor: number,
  foreignCurrency: OfwCurrency,
  direction: RemittanceDirection = "to_php",
): Record<string, RemittanceCalculationResult> {
  const providers: RemittanceProvider[] = [
    "mid_market",
    "wise",
    "remitly",
    "western_union",
    "bank_wire",
  ];

  const results: Record<string, RemittanceCalculationResult> = {};
  for (const provider of providers) {
    results[provider] = calculateRemittance({
      sendAmountMinor,
      foreignCurrency,
      direction,
      provider,
    });
  }
  return results;
}
