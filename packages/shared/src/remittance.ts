export type OfwCurrency = 'USD' | 'EUR' | 'SGD' | 'AED' | 'SAR' | 'JPY' | 'CAD' | 'GBP' | 'AUD';

export type RemittanceProvider = 'mid_market' | 'wise' | 'remitly' | 'western_union' | 'bank_wire';

export interface ExchangeRateBenchmark {
  fromCurrency: OfwCurrency;
  toCurrency: 'PHP';
  midMarketRate: number; // e.g. 56.50
  providerSpreadEstimates: {
    wise: number; // typical spread % e.g. 0.005 (0.5%)
    remitly: number; // e.g. 0.015 (1.5%)
    westernUnion: number; // e.g. 0.025 (2.5%)
    bankWire: number; // e.g. 0.035 (3.5%)
  };
  lastUpdated: string; // ISO date
}

export interface RemittanceCalculationOptions {
  sendAmountMinor: number; // Amount in foreign currency minor units (e.g. 500.00 USD -> 50000)
  fromCurrency: OfwCurrency;
  toCurrency?: 'PHP';
  transferFeeMinor?: number; // In foreign currency minor units (default 0)
  customExchangeRate?: number; // Optional user override for rate
  provider?: RemittanceProvider;
}

export interface RemittanceCalculationResult {
  sendAmountMinor: number;
  fromCurrency: OfwCurrency;
  toCurrency: 'PHP';
  effectiveRate: number;
  midMarketRate: number;
  grossConvertedPhpMinor: number; // Converted at mid-market
  netPhpReceivedMinor: number; // Converted at effective rate (deducting spread)
  transferFeeMinor: number; // Foreign currency fee
  transferFeeInPhpMinor: number; // Fee converted to PHP
  spreadLossPhpMinor: number; // Money lost to FX markup
  totalCostInPhpMinor: number; // transferFeeInPhpMinor + spreadLossPhpMinor
  effectiveLossPercent: number; // (totalCost / grossConverted) * 100
}

export interface DualCurrencyBalance {
  foreignCurrency: OfwCurrency;
  foreignBalanceMinor: number;
  convertedPhpMinor: number;
  exchangeRate: number;
}

export const DEFAULT_OFW_EXCHANGE_RATES: Record<OfwCurrency, ExchangeRateBenchmark> = {
  USD: {
    fromCurrency: 'USD',
    toCurrency: 'PHP',
    midMarketRate: 56.5,
    providerSpreadEstimates: {
      wise: 0.005,
      remitly: 0.015,
      westernUnion: 0.025,
      bankWire: 0.035,
    },
    lastUpdated: '2026-01-01T00:00:00.000Z',
  },
  EUR: {
    fromCurrency: 'EUR',
    toCurrency: 'PHP',
    midMarketRate: 61.2,
    providerSpreadEstimates: {
      wise: 0.005,
      remitly: 0.015,
      westernUnion: 0.025,
      bankWire: 0.035,
    },
    lastUpdated: '2026-01-01T00:00:00.000Z',
  },
  SGD: {
    fromCurrency: 'SGD',
    toCurrency: 'PHP',
    midMarketRate: 42.1,
    providerSpreadEstimates: {
      wise: 0.005,
      remitly: 0.015,
      westernUnion: 0.025,
      bankWire: 0.035,
    },
    lastUpdated: '2026-01-01T00:00:00.000Z',
  },
  AED: {
    fromCurrency: 'AED',
    toCurrency: 'PHP',
    midMarketRate: 15.38,
    providerSpreadEstimates: {
      wise: 0.005,
      remitly: 0.015,
      westernUnion: 0.025,
      bankWire: 0.035,
    },
    lastUpdated: '2026-01-01T00:00:00.000Z',
  },
  SAR: {
    fromCurrency: 'SAR',
    toCurrency: 'PHP',
    midMarketRate: 15.06,
    providerSpreadEstimates: {
      wise: 0.005,
      remitly: 0.015,
      westernUnion: 0.025,
      bankWire: 0.035,
    },
    lastUpdated: '2026-01-01T00:00:00.000Z',
  },
  JPY: {
    fromCurrency: 'JPY',
    toCurrency: 'PHP',
    midMarketRate: 0.38,
    providerSpreadEstimates: {
      wise: 0.005,
      remitly: 0.015,
      westernUnion: 0.025,
      bankWire: 0.035,
    },
    lastUpdated: '2026-01-01T00:00:00.000Z',
  },
  CAD: {
    fromCurrency: 'CAD',
    toCurrency: 'PHP',
    midMarketRate: 41.8,
    providerSpreadEstimates: {
      wise: 0.005,
      remitly: 0.015,
      westernUnion: 0.025,
      bankWire: 0.035,
    },
    lastUpdated: '2026-01-01T00:00:00.000Z',
  },
  GBP: {
    fromCurrency: 'GBP',
    toCurrency: 'PHP',
    midMarketRate: 71.5,
    providerSpreadEstimates: {
      wise: 0.005,
      remitly: 0.015,
      westernUnion: 0.025,
      bankWire: 0.035,
    },
    lastUpdated: '2026-01-01T00:00:00.000Z',
  },
  AUD: {
    fromCurrency: 'AUD',
    toCurrency: 'PHP',
    midMarketRate: 37.2,
    providerSpreadEstimates: {
      wise: 0.005,
      remitly: 0.015,
      westernUnion: 0.025,
      bankWire: 0.035,
    },
    lastUpdated: '2026-01-01T00:00:00.000Z',
  },
};

export const OFW_CURRENCIES: readonly OfwCurrency[] = [
  'USD',
  'EUR',
  'SGD',
  'AED',
  'SAR',
  'JPY',
  'CAD',
  'GBP',
  'AUD',
];

export const REMITTANCE_PROVIDERS: readonly RemittanceProvider[] = [
  'mid_market',
  'wise',
  'remitly',
  'western_union',
  'bank_wire',
];

function roundRate(rate: number): number {
  return Math.round(rate * 1_000_000) / 1_000_000;
}

export function calculateRemittance(
  options: RemittanceCalculationOptions,
): RemittanceCalculationResult {
  const benchmark = DEFAULT_OFW_EXCHANGE_RATES[options.fromCurrency];
  const midMarketRate = benchmark ? benchmark.midMarketRate : 1;
  const provider = options.provider ?? 'mid_market';

  let effectiveRate = options.customExchangeRate ?? midMarketRate;
  if (options.customExchangeRate == null && benchmark) {
    if (provider === 'wise') {
      effectiveRate = roundRate(midMarketRate * (1 - benchmark.providerSpreadEstimates.wise));
    } else if (provider === 'remitly') {
      effectiveRate = roundRate(midMarketRate * (1 - benchmark.providerSpreadEstimates.remitly));
    } else if (provider === 'western_union') {
      effectiveRate = roundRate(midMarketRate * (1 - benchmark.providerSpreadEstimates.westernUnion));
    } else if (provider === 'bank_wire') {
      effectiveRate = roundRate(midMarketRate * (1 - benchmark.providerSpreadEstimates.bankWire));
    } else {
      effectiveRate = midMarketRate;
    }
  }

  const sendAmountMinor = Math.max(0, options.sendAmountMinor);
  const transferFeeMinor = Math.max(0, options.transferFeeMinor ?? 0);

  const grossConvertedPhpMinor = Math.round(sendAmountMinor * midMarketRate);
  const netPhpReceivedMinor = Math.round(sendAmountMinor * effectiveRate);
  const transferFeeInPhpMinor = Math.round(transferFeeMinor * midMarketRate);
  const spreadLossPhpMinor = Math.max(0, grossConvertedPhpMinor - netPhpReceivedMinor);
  const totalCostInPhpMinor = transferFeeInPhpMinor + spreadLossPhpMinor;
  const effectiveLossPercent =
    grossConvertedPhpMinor > 0
      ? Math.round(((totalCostInPhpMinor / grossConvertedPhpMinor) * 100) * 100) / 100
      : 0;

  return {
    sendAmountMinor: options.sendAmountMinor,
    fromCurrency: options.fromCurrency,
    toCurrency: 'PHP',
    effectiveRate,
    midMarketRate,
    grossConvertedPhpMinor,
    netPhpReceivedMinor,
    transferFeeMinor,
    transferFeeInPhpMinor,
    spreadLossPhpMinor,
    totalCostInPhpMinor,
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
  fromCurrency: OfwCurrency,
): Record<string, RemittanceCalculationResult> {
  const providers: RemittanceProvider[] = [
    'mid_market',
    'wise',
    'remitly',
    'western_union',
    'bank_wire',
  ];

  const results: Record<string, RemittanceCalculationResult> = {};
  for (const provider of providers) {
    results[provider] = calculateRemittance({
      sendAmountMinor,
      fromCurrency,
      provider,
    });
  }
  return results;
}
