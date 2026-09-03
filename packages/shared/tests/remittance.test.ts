import { describe, expect, it } from 'vitest';

import {
  calculateDualCurrencyBalance,
  calculateRemittance,
  compareRemittanceProviders,
  DEFAULT_OFW_EXCHANGE_RATES,
  OFW_CURRENCIES,
  type OfwCurrency,
} from '../src/remittance';

describe('DEFAULT_OFW_EXCHANGE_RATES benchmark data', () => {
  it('defines benchmarks for all supported OFW currencies', () => {
    const expectedCurrencies: OfwCurrency[] = [
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

    expect(OFW_CURRENCIES).toEqual(expectedCurrencies);

    for (const currency of expectedCurrencies) {
      const benchmark = DEFAULT_OFW_EXCHANGE_RATES[currency];
      expect(benchmark).toBeDefined();
      expect(benchmark.fromCurrency).toBe(currency);
      expect(benchmark.toCurrency).toBe('PHP');
      expect(benchmark.midMarketRate).toBeGreaterThan(0);
      expect(benchmark.providerSpreadEstimates.wise).toBe(0.005);
      expect(benchmark.providerSpreadEstimates.remitly).toBe(0.015);
      expect(benchmark.providerSpreadEstimates.westernUnion).toBe(0.025);
      expect(benchmark.providerSpreadEstimates.bankWire).toBe(0.035);
      expect(typeof benchmark.lastUpdated).toBe('string');
    }
  });

  it('has expected reasonable mid-market rates for standard OFW corridors', () => {
    expect(DEFAULT_OFW_EXCHANGE_RATES.USD.midMarketRate).toBe(56.5);
    expect(DEFAULT_OFW_EXCHANGE_RATES.EUR.midMarketRate).toBe(61.2);
    expect(DEFAULT_OFW_EXCHANGE_RATES.SGD.midMarketRate).toBe(42.1);
    expect(DEFAULT_OFW_EXCHANGE_RATES.AED.midMarketRate).toBe(15.38);
    expect(DEFAULT_OFW_EXCHANGE_RATES.SAR.midMarketRate).toBe(15.06);
    expect(DEFAULT_OFW_EXCHANGE_RATES.JPY.midMarketRate).toBe(0.38);
    expect(DEFAULT_OFW_EXCHANGE_RATES.CAD.midMarketRate).toBe(41.8);
    expect(DEFAULT_OFW_EXCHANGE_RATES.GBP.midMarketRate).toBe(71.5);
    expect(DEFAULT_OFW_EXCHANGE_RATES.AUD.midMarketRate).toBe(37.2);
  });
});

describe('calculateRemittance', () => {
  it('calculates mid-market remittance with zero fee and zero spread', () => {
    const result = calculateRemittance({
      sendAmountMinor: 50_000, // 500.00 USD
      fromCurrency: 'USD',
      provider: 'mid_market',
    });

    expect(result).toEqual({
      sendAmountMinor: 50_000,
      fromCurrency: 'USD',
      toCurrency: 'PHP',
      effectiveRate: 56.5,
      midMarketRate: 56.5,
      grossConvertedPhpMinor: 2_825_000, // 500 * 56.50 * 100
      netPhpReceivedMinor: 2_825_000,
      transferFeeMinor: 0,
      transferFeeInPhpMinor: 0,
      spreadLossPhpMinor: 0,
      totalCostInPhpMinor: 0,
      effectiveLossPercent: 0,
    });
  });

  it('calculates Wise remittance with 0.5% FX spread', () => {
    const result = calculateRemittance({
      sendAmountMinor: 50_000, // 500.00 USD
      fromCurrency: 'USD',
      provider: 'wise',
    });

    // 56.50 * (1 - 0.005) = 56.2175
    expect(result.effectiveRate).toBe(56.2175);
    expect(result.midMarketRate).toBe(56.5);
    expect(result.grossConvertedPhpMinor).toBe(2_825_000);
    // 50000 * 56.2175 = 2810875
    expect(result.netPhpReceivedMinor).toBe(2_810_875);
    expect(result.spreadLossPhpMinor).toBe(14_125);
    expect(result.transferFeeMinor).toBe(0);
    expect(result.transferFeeInPhpMinor).toBe(0);
    expect(result.totalCostInPhpMinor).toBe(14_125);
    expect(result.effectiveLossPercent).toBe(0.5);
  });

  it('calculates Remitly, Western Union, and Bank Wire spreads correctly', () => {
    const remitly = calculateRemittance({
      sendAmountMinor: 50_000,
      fromCurrency: 'USD',
      provider: 'remitly',
    });
    // 56.50 * (1 - 0.015) = 55.6525
    expect(remitly.effectiveRate).toBe(55.6525);
    expect(remitly.netPhpReceivedMinor).toBe(2_782_625);
    expect(remitly.spreadLossPhpMinor).toBe(42_375);
    expect(remitly.effectiveLossPercent).toBe(1.5);

    const westernUnion = calculateRemittance({
      sendAmountMinor: 50_000,
      fromCurrency: 'USD',
      provider: 'western_union',
    });
    // 56.50 * (1 - 0.025) = 55.0875
    expect(westernUnion.effectiveRate).toBe(55.0875);
    expect(westernUnion.netPhpReceivedMinor).toBe(2_754_375);
    expect(westernUnion.spreadLossPhpMinor).toBe(70_625);
    expect(westernUnion.effectiveLossPercent).toBe(2.5);

    const bankWire = calculateRemittance({
      sendAmountMinor: 50_000,
      fromCurrency: 'USD',
      provider: 'bank_wire',
    });
    // 56.50 * (1 - 0.035) = 54.5225
    expect(bankWire.effectiveRate).toBe(54.5225);
    expect(bankWire.netPhpReceivedMinor).toBe(2_726_125);
    expect(bankWire.spreadLossPhpMinor).toBe(98_875);
    expect(bankWire.effectiveLossPercent).toBe(3.5);
  });

  it('incorporates upfront transfer fees into total cost and effective loss', () => {
    const result = calculateRemittance({
      sendAmountMinor: 50_000, // 500.00 USD
      fromCurrency: 'USD',
      provider: 'wise',
      transferFeeMinor: 500, // 5.00 USD fee
    });

    expect(result.transferFeeMinor).toBe(500);
    // 500 * 56.50 = 28250 PHP minor
    expect(result.transferFeeInPhpMinor).toBe(28_250);
    expect(result.spreadLossPhpMinor).toBe(14_125);
    // 28250 + 14125 = 42375
    expect(result.totalCostInPhpMinor).toBe(42_375);
    // 42375 / 2825000 * 100 = 1.5%
    expect(result.effectiveLossPercent).toBe(1.5);
  });

  it('honors custom exchange rates over provider defaults', () => {
    const result = calculateRemittance({
      sendAmountMinor: 100_000, // 1000.00 USD
      fromCurrency: 'USD',
      customExchangeRate: 55.0,
      provider: 'wise', // should be overridden by customExchangeRate
    });

    expect(result.effectiveRate).toBe(55.0);
    expect(result.midMarketRate).toBe(56.5);
    expect(result.grossConvertedPhpMinor).toBe(5_650_000);
    expect(result.netPhpReceivedMinor).toBe(5_500_000);
    expect(result.spreadLossPhpMinor).toBe(150_000);
    expect(result.totalCostInPhpMinor).toBe(150_000);
    expect(result.effectiveLossPercent).toBe(2.65);
  });

  it('handles custom exchange rates better than mid-market gracefully without negative loss', () => {
    const result = calculateRemittance({
      sendAmountMinor: 100_000,
      fromCurrency: 'USD',
      customExchangeRate: 58.0,
    });

    expect(result.effectiveRate).toBe(58.0);
    expect(result.midMarketRate).toBe(56.5);
    expect(result.grossConvertedPhpMinor).toBe(5_650_000);
    expect(result.netPhpReceivedMinor).toBe(5_800_000);
    expect(result.spreadLossPhpMinor).toBe(0);
    expect(result.totalCostInPhpMinor).toBe(0);
    expect(result.effectiveLossPercent).toBe(0);
  });

  it('handles edge case of zero send amount', () => {
    const result = calculateRemittance({
      sendAmountMinor: 0,
      fromCurrency: 'AED',
      provider: 'wise',
    });

    expect(result.grossConvertedPhpMinor).toBe(0);
    expect(result.netPhpReceivedMinor).toBe(0);
    expect(result.spreadLossPhpMinor).toBe(0);
    expect(result.totalCostInPhpMinor).toBe(0);
    expect(result.effectiveLossPercent).toBe(0);
  });

  it('handles zero send amount with a flat transfer fee without dividing by zero', () => {
    const result = calculateRemittance({
      sendAmountMinor: 0,
      fromCurrency: 'SAR',
      transferFeeMinor: 200, // 2.00 SAR
    });

    expect(result.grossConvertedPhpMinor).toBe(0);
    expect(result.transferFeeInPhpMinor).toBe(3_012); // 200 * 15.06
    expect(result.totalCostInPhpMinor).toBe(3_012);
    expect(result.effectiveLossPercent).toBe(0);
  });
});

describe('calculateDualCurrencyBalance', () => {
  it('converts foreign currency balance using mid-market benchmark', () => {
    const usdBalance = calculateDualCurrencyBalance(100_000, 'USD'); // 1,000.00 USD
    expect(usdBalance).toEqual({
      foreignCurrency: 'USD',
      foreignBalanceMinor: 100_000,
      convertedPhpMinor: 5_650_000, // 1000 * 56.50 * 100
      exchangeRate: 56.5,
    });

    const jpyBalance = calculateDualCurrencyBalance(500_000, 'JPY'); // 5,000 JPY
    expect(jpyBalance).toEqual({
      foreignCurrency: 'JPY',
      foreignBalanceMinor: 500_000,
      convertedPhpMinor: 190_000, // 500000 * 0.38
      exchangeRate: 0.38,
    });

    const sgdBalance = calculateDualCurrencyBalance(25_000, 'SGD'); // 250.00 SGD
    expect(sgdBalance).toEqual({
      foreignCurrency: 'SGD',
      foreignBalanceMinor: 25_000,
      convertedPhpMinor: 1_052_500, // 25000 * 42.10
      exchangeRate: 42.1,
    });
  });

  it('supports custom exchange rate override for dual currency balance', () => {
    const result = calculateDualCurrencyBalance(50_000, 'EUR', 62.5);
    expect(result).toEqual({
      foreignCurrency: 'EUR',
      foreignBalanceMinor: 50_000,
      convertedPhpMinor: 3_125_000, // 50000 * 62.50
      exchangeRate: 62.5,
    });
  });
});

describe('compareRemittanceProviders', () => {
  it('returns comparison results for all providers in ascending order of cost', () => {
    const comparison = compareRemittanceProviders(100_000, 'USD'); // 1,000.00 USD

    expect(Object.keys(comparison)).toEqual([
      'mid_market',
      'wise',
      'remitly',
      'western_union',
      'bank_wire',
    ]);

    expect(comparison.mid_market!.netPhpReceivedMinor).toBe(5_650_000);
    expect(comparison.wise!.netPhpReceivedMinor).toBe(5_621_750);
    expect(comparison.remitly!.netPhpReceivedMinor).toBe(5_565_250);
    expect(comparison.western_union!.netPhpReceivedMinor).toBe(5_508_750);
    expect(comparison.bank_wire!.netPhpReceivedMinor).toBe(5_452_250);

    expect(comparison.mid_market!.netPhpReceivedMinor).toBeGreaterThan(
      comparison.wise!.netPhpReceivedMinor,
    );
    expect(comparison.wise!.netPhpReceivedMinor).toBeGreaterThan(
      comparison.remitly!.netPhpReceivedMinor,
    );
    expect(comparison.remitly!.netPhpReceivedMinor).toBeGreaterThan(
      comparison.western_union!.netPhpReceivedMinor,
    );
    expect(comparison.western_union!.netPhpReceivedMinor).toBeGreaterThan(
      comparison.bank_wire!.netPhpReceivedMinor,
    );

    expect(comparison.wise!.effectiveLossPercent).toBe(0.5);
    expect(comparison.remitly!.effectiveLossPercent).toBe(1.5);
    expect(comparison.western_union!.effectiveLossPercent).toBe(2.5);
    expect(comparison.bank_wire!.effectiveLossPercent).toBe(3.5);
  });
});
