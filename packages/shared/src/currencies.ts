// The supported currencies, their display metadata, and per-currency totals.

/**
 * Every currency an account, transaction, subscription, or workspace can be kept in. PHP leads
 * as the original default; the rest follow roughly by region. Amounts in every currency are
 * stored as integer hundredths of the major unit, even for currencies that print no decimals
 * (JPY, KRW, VND, CLP) or three (KWD, BHD, OMR), so one money rule covers them all.
 */
export const currencies = [
  "PHP",
  "USD",
  "EUR",
  "GBP",
  "JPY",
  "CNY",
  "HKD",
  "TWD",
  "KRW",
  "SGD",
  "MYR",
  "THB",
  "IDR",
  "VND",
  "INR",
  "PKR",
  "BDT",
  "LKR",
  "NPR",
  "AUD",
  "NZD",
  "CAD",
  "MXN",
  "BRL",
  "ARS",
  "CLP",
  "COP",
  "PEN",
  "CHF",
  "SEK",
  "NOK",
  "DKK",
  "PLN",
  "CZK",
  "HUF",
  "TRY",
  "ILS",
  "AED",
  "SAR",
  "QAR",
  "KWD",
  "BHD",
  "OMR",
  "EGP",
  "ZAR",
  "NGN",
  "KES",
] as const;
export type Currency = (typeof currencies)[number];

export const currencyMetadata: Record<
  Currency,
  { label: string; name: string; plural: string; symbol: string; locale: string }
> = {
  PHP: {
    label: "Philippine Peso (PHP)",
    name: "Philippine Peso",
    plural: "Philippine pesos",
    symbol: "₱",
    locale: "en-PH",
  },
  USD: {
    label: "US Dollar (USD)",
    name: "US Dollar",
    plural: "US dollars",
    symbol: "$",
    locale: "en-US",
  },
  EUR: { label: "Euro (EUR)", name: "Euro", plural: "euros", symbol: "€", locale: "de-DE" },
  GBP: {
    label: "British Pound (GBP)",
    name: "British Pound",
    plural: "British pounds",
    symbol: "£",
    locale: "en-GB",
  },
  JPY: {
    label: "Japanese Yen (JPY)",
    name: "Japanese Yen",
    plural: "Japanese yen",
    symbol: "¥",
    locale: "ja-JP",
  },
  CNY: {
    label: "Chinese Yuan (CNY)",
    name: "Chinese Yuan",
    plural: "Chinese yuan",
    symbol: "CN¥",
    locale: "zh-CN",
  },
  HKD: {
    label: "Hong Kong Dollar (HKD)",
    name: "Hong Kong Dollar",
    plural: "Hong Kong dollars",
    symbol: "HK$",
    locale: "en-HK",
  },
  TWD: {
    label: "New Taiwan Dollar (TWD)",
    name: "New Taiwan Dollar",
    plural: "New Taiwan dollars",
    symbol: "NT$",
    locale: "zh-TW",
  },
  KRW: {
    label: "South Korean Won (KRW)",
    name: "South Korean Won",
    plural: "South Korean won",
    symbol: "₩",
    locale: "ko-KR",
  },
  SGD: {
    label: "Singapore Dollar (SGD)",
    name: "Singapore Dollar",
    plural: "Singapore dollars",
    symbol: "S$",
    locale: "en-SG",
  },
  MYR: {
    label: "Malaysian Ringgit (MYR)",
    name: "Malaysian Ringgit",
    plural: "Malaysian ringgit",
    symbol: "RM",
    locale: "ms-MY",
  },
  THB: {
    label: "Thai Baht (THB)",
    name: "Thai Baht",
    plural: "Thai baht",
    symbol: "฿",
    locale: "th-TH",
  },
  IDR: {
    label: "Indonesian Rupiah (IDR)",
    name: "Indonesian Rupiah",
    plural: "Indonesian rupiah",
    symbol: "Rp",
    locale: "id-ID",
  },
  VND: {
    label: "Vietnamese Dong (VND)",
    name: "Vietnamese Dong",
    plural: "Vietnamese dong",
    symbol: "₫",
    locale: "vi-VN",
  },
  INR: {
    label: "Indian Rupee (INR)",
    name: "Indian Rupee",
    plural: "Indian rupees",
    symbol: "₹",
    locale: "en-IN",
  },
  PKR: {
    label: "Pakistani Rupee (PKR)",
    name: "Pakistani Rupee",
    plural: "Pakistani rupees",
    symbol: "Rs",
    locale: "en-PK",
  },
  BDT: {
    label: "Bangladeshi Taka (BDT)",
    name: "Bangladeshi Taka",
    plural: "Bangladeshi taka",
    symbol: "৳",
    locale: "bn-BD",
  },
  LKR: {
    label: "Sri Lankan Rupee (LKR)",
    name: "Sri Lankan Rupee",
    plural: "Sri Lankan rupees",
    symbol: "Rs",
    locale: "en-LK",
  },
  NPR: {
    label: "Nepalese Rupee (NPR)",
    name: "Nepalese Rupee",
    plural: "Nepalese rupees",
    symbol: "Rs",
    locale: "ne-NP",
  },
  AUD: {
    label: "Australian Dollar (AUD)",
    name: "Australian Dollar",
    plural: "Australian dollars",
    symbol: "A$",
    locale: "en-AU",
  },
  NZD: {
    label: "New Zealand Dollar (NZD)",
    name: "New Zealand Dollar",
    plural: "New Zealand dollars",
    symbol: "NZ$",
    locale: "en-NZ",
  },
  CAD: {
    label: "Canadian Dollar (CAD)",
    name: "Canadian Dollar",
    plural: "Canadian dollars",
    symbol: "CA$",
    locale: "en-CA",
  },
  MXN: {
    label: "Mexican Peso (MXN)",
    name: "Mexican Peso",
    plural: "Mexican pesos",
    symbol: "MX$",
    locale: "es-MX",
  },
  BRL: {
    label: "Brazilian Real (BRL)",
    name: "Brazilian Real",
    plural: "Brazilian reais",
    symbol: "R$",
    locale: "pt-BR",
  },
  ARS: {
    label: "Argentine Peso (ARS)",
    name: "Argentine Peso",
    plural: "Argentine pesos",
    symbol: "AR$",
    locale: "es-AR",
  },
  CLP: {
    label: "Chilean Peso (CLP)",
    name: "Chilean Peso",
    plural: "Chilean pesos",
    symbol: "CL$",
    locale: "es-CL",
  },
  COP: {
    label: "Colombian Peso (COP)",
    name: "Colombian Peso",
    plural: "Colombian pesos",
    symbol: "CO$",
    locale: "es-CO",
  },
  PEN: {
    label: "Peruvian Sol (PEN)",
    name: "Peruvian Sol",
    plural: "Peruvian soles",
    symbol: "S/",
    locale: "es-PE",
  },
  CHF: {
    label: "Swiss Franc (CHF)",
    name: "Swiss Franc",
    plural: "Swiss francs",
    symbol: "CHF",
    locale: "de-CH",
  },
  SEK: {
    label: "Swedish Krona (SEK)",
    name: "Swedish Krona",
    plural: "Swedish kronor",
    symbol: "kr",
    locale: "sv-SE",
  },
  NOK: {
    label: "Norwegian Krone (NOK)",
    name: "Norwegian Krone",
    plural: "Norwegian kroner",
    symbol: "kr",
    locale: "nb-NO",
  },
  DKK: {
    label: "Danish Krone (DKK)",
    name: "Danish Krone",
    plural: "Danish kroner",
    symbol: "kr",
    locale: "da-DK",
  },
  PLN: {
    label: "Polish Złoty (PLN)",
    name: "Polish Złoty",
    plural: "Polish złoty",
    symbol: "zł",
    locale: "pl-PL",
  },
  CZK: {
    label: "Czech Koruna (CZK)",
    name: "Czech Koruna",
    plural: "Czech korunas",
    symbol: "Kč",
    locale: "cs-CZ",
  },
  HUF: {
    label: "Hungarian Forint (HUF)",
    name: "Hungarian Forint",
    plural: "Hungarian forints",
    symbol: "Ft",
    locale: "hu-HU",
  },
  TRY: {
    label: "Turkish Lira (TRY)",
    name: "Turkish Lira",
    plural: "Turkish lira",
    symbol: "₺",
    locale: "tr-TR",
  },
  ILS: {
    label: "Israeli New Shekel (ILS)",
    name: "Israeli New Shekel",
    plural: "Israeli new shekels",
    symbol: "₪",
    locale: "he-IL",
  },
  AED: {
    label: "UAE Dirham (AED)",
    name: "UAE Dirham",
    plural: "UAE dirhams",
    symbol: "AED",
    locale: "en-AE",
  },
  SAR: {
    label: "Saudi Riyal (SAR)",
    name: "Saudi Riyal",
    plural: "Saudi riyals",
    symbol: "SAR",
    locale: "en-SA",
  },
  QAR: {
    label: "Qatari Riyal (QAR)",
    name: "Qatari Riyal",
    plural: "Qatari riyals",
    symbol: "QAR",
    locale: "en-QA",
  },
  KWD: {
    label: "Kuwaiti Dinar (KWD)",
    name: "Kuwaiti Dinar",
    plural: "Kuwaiti dinars",
    symbol: "KD",
    locale: "en-KW",
  },
  BHD: {
    label: "Bahraini Dinar (BHD)",
    name: "Bahraini Dinar",
    plural: "Bahraini dinars",
    symbol: "BD",
    locale: "en-BH",
  },
  OMR: {
    label: "Omani Rial (OMR)",
    name: "Omani Rial",
    plural: "Omani rials",
    symbol: "OMR",
    locale: "en-OM",
  },
  EGP: {
    label: "Egyptian Pound (EGP)",
    name: "Egyptian Pound",
    plural: "Egyptian pounds",
    symbol: "E£",
    locale: "en-EG",
  },
  ZAR: {
    label: "South African Rand (ZAR)",
    name: "South African Rand",
    plural: "South African rand",
    symbol: "R",
    locale: "en-ZA",
  },
  NGN: {
    label: "Nigerian Naira (NGN)",
    name: "Nigerian Naira",
    plural: "Nigerian naira",
    symbol: "₦",
    locale: "en-NG",
  },
  KES: {
    label: "Kenyan Shilling (KES)",
    name: "Kenyan Shilling",
    plural: "Kenyan shillings",
    symbol: "KSh",
    locale: "en-KE",
  },
};

const currencySet: ReadonlySet<string> = new Set(currencies);

/** Currencies printed without a minor unit. Their amounts still store hundredths. */
const zeroDecimalCurrencies: ReadonlySet<Currency> = new Set(["JPY", "KRW", "VND", "CLP"]);

/**
 * Decimal places to print an amount with: none for a zero-decimal currency holding a whole
 * amount, otherwise two, so a fractional amount is never rounded away on screen.
 */
export function currencyFractionDigits(currency: Currency, amountMinor: number): 0 | 2 {
  return zeroDecimalCurrencies.has(currency) && amountMinor % 100 === 0 ? 0 : 2;
}

/** Narrows untrusted text (a stored row, a CSV cell, a remembered setting) to a supported currency. */
export function isCurrency(value: unknown): value is Currency {
  return typeof value === "string" && currencySet.has(value);
}

/** Amounts summed per currency. A currency with nothing recorded is absent rather than zero. */
export type CurrencyTotals = Partial<Record<Currency, number>>;

/** Adds `amountMinor` to one currency's running total in place. */
export function addToCurrencyTotal(
  totals: CurrencyTotals,
  currency: Currency,
  amountMinor: number,
): void {
  totals[currency] = (totals[currency] ?? 0) + amountMinor;
}

/** The currencies with a non-zero total other than `except`, in `currencies` order. */
export function otherCurrenciesWithAmounts(totals: CurrencyTotals, except: Currency): Currency[] {
  return currencies.filter((currency) => currency !== except && (totals[currency] ?? 0) !== 0);
}
