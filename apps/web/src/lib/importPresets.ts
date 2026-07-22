import { normalizeCsvHeader, type ImportMapping } from "@budget/shared";

export type ImportPresetId =
  "auto" | "generic" | "bpi" | "bdo" | "maribank" | "bank-of-america" | "jpmorgan";

export type ImportAmountMode = "amount" | "debit-credit";

type MappingField =
  "date" | "description" | "amount" | "debit" | "credit" | "category" | "kind" | "currency";

export interface ImportPreset {
  id: Exclude<ImportPresetId, "auto">;
  label: string;
  filenameHints: string[];
  signatureAliases: string[];
  aliases: Record<MappingField, string[]>;
  preferredAmountMode: ImportAmountMode;
  requiresPhpConfirmation: boolean;
  guidance: string;
}

const genericAliases: ImportPreset["aliases"] = {
  date: ["date", "transaction date", "posting date", "posted date", "post date"],
  description: [
    "description",
    "details",
    "transaction details",
    "particulars",
    "merchant",
    "memo",
    "narration",
    "payee",
  ],
  amount: ["amount", "transaction amount", "value"],
  debit: ["debit", "debit amount", "withdrawal", "withdrawals", "money out"],
  credit: ["credit", "credit amount", "deposit", "deposits", "money in"],
  category: ["category", "category name"],
  kind: ["type", "kind", "transaction type", "details"],
  currency: ["currency", "currency code"],
};

function aliases(overrides: Partial<ImportPreset["aliases"]>): ImportPreset["aliases"] {
  return Object.fromEntries(
    Object.entries(genericAliases).map(([field, values]) => [
      field,
      [...(overrides[field as MappingField] ?? []), ...values],
    ]),
  ) as ImportPreset["aliases"];
}

export const importPresets: ImportPreset[] = [
  {
    id: "generic",
    label: "Generic bank export",
    filenameHints: [],
    signatureAliases: [],
    aliases: genericAliases,
    preferredAmountMode: "amount",
    requiresPhpConfirmation: false,
    guidance: "Matches common Date, Description, Amount, Debit, and Credit headings.",
  },
  {
    id: "bpi",
    label: "BPI",
    filenameHints: ["bpi"],
    signatureAliases: ["branch", "transaction description", "running balance"],
    aliases: aliases({
      date: ["transaction date"],
      description: ["transaction description", "remarks"],
      debit: ["debit amount"],
      credit: ["credit amount"],
    }),
    preferredAmountMode: "debit-credit",
    requiresPhpConfirmation: false,
    guidance: "Supports BPI exports with either Amount or separate Debit and Credit columns.",
  },
  {
    id: "bdo",
    label: "BDO",
    filenameHints: ["bdo"],
    signatureAliases: ["transaction description", "running balance", "reference number"],
    aliases: aliases({
      date: ["transaction date", "post date"],
      description: ["transaction description", "remarks"],
      debit: ["debit amount", "withdrawal amount"],
      credit: ["credit amount", "deposit amount"],
    }),
    preferredAmountMode: "debit-credit",
    requiresPhpConfirmation: false,
    guidance: "Supports common BDO statement headings and split Debit/Credit exports.",
  },
  {
    id: "maribank",
    label: "MariBank",
    filenameHints: ["maribank", "mari bank", "seabank"],
    signatureAliases: ["transaction time", "transaction status", "reference id"],
    aliases: aliases({
      date: ["transaction time", "date and time", "date time"],
      description: ["transaction details", "remarks", "counterparty"],
      amount: ["transaction amount", "amount in php"],
      kind: ["transaction type"],
    }),
    preferredAmountMode: "amount",
    requiresPhpConfirmation: false,
    guidance: "Matches MariBank transaction history exports, including transaction-time headings.",
  },
  {
    id: "bank-of-america",
    label: "Bank of America",
    filenameHints: ["bankofamerica", "bank of america", "bofa"],
    signatureAliases: ["running bal", "reference number", "address"],
    aliases: aliases({
      date: ["posted date"],
      description: ["payee", "description"],
      amount: ["amount"],
    }),
    preferredAmountMode: "amount",
    requiresPhpConfirmation: true,
    guidance:
      "Bank of America commonly exports USD. Clarity stores PHP only and does not convert currencies.",
  },
  {
    id: "jpmorgan",
    label: "JPMorgan / Chase",
    filenameHints: ["jpmorgan", "jp morgan", "chase"],
    signatureAliases: ["check or slip", "posting date", "details"],
    aliases: aliases({
      date: ["posting date"],
      description: ["description", "details"],
      amount: ["amount"],
      kind: ["type", "details"],
    }),
    preferredAmountMode: "amount",
    requiresPhpConfirmation: true,
    guidance:
      "JPMorgan and Chase exports commonly use USD. Clarity stores PHP only and does not convert currencies.",
  },
];

export function getImportPreset(id: ImportPresetId): ImportPreset {
  if (id === "auto") return importPresets[0]!;
  return importPresets.find((preset) => preset.id === id) ?? importPresets[0]!;
}

function findHeader(headers: string[], aliasesToMatch: string[]): string | undefined {
  for (const alias of aliasesToMatch) {
    const normalizedAlias = normalizeCsvHeader(alias);
    const header = headers.find((candidate) => normalizeCsvHeader(candidate) === normalizedAlias);
    if (header) return header;
  }
  return undefined;
}

export function resolvePresetMapping(
  headers: string[],
  preset: ImportPreset,
): { mapping: ImportMapping; amountMode: ImportAmountMode } {
  const amount = findHeader(headers, preset.aliases.amount);
  const debit = findHeader(headers, preset.aliases.debit);
  const credit = findHeader(headers, preset.aliases.credit);
  const hasSplit = Boolean(debit && credit);
  const amountMode =
    preset.preferredAmountMode === "debit-credit" && hasSplit
      ? "debit-credit"
      : amount
        ? "amount"
        : hasSplit
          ? "debit-credit"
          : preset.preferredAmountMode;

  const usedHeaders = new Set<string>();
  const takeUnused = (header: string | undefined) => {
    if (!header) return undefined;
    const identity = header.trim().toLocaleLowerCase("en");
    if (usedHeaders.has(identity)) return undefined;
    usedHeaders.add(identity);
    return header;
  };
  const date = takeUnused(findHeader(headers, preset.aliases.date));
  const description = takeUnused(findHeader(headers, preset.aliases.description)) ?? "";
  const amountMapping =
    amountMode === "amount"
      ? { amount: takeUnused(amount) ?? "" }
      : { debit: takeUnused(debit) ?? "", credit: takeUnused(credit) ?? "" };

  return {
    amountMode,
    mapping: {
      date,
      description,
      ...amountMapping,
      category: takeUnused(findHeader(headers, preset.aliases.category)),
      kind: takeUnused(findHeader(headers, preset.aliases.kind)),
      currency: takeUnused(findHeader(headers, preset.aliases.currency)),
    },
  };
}

export function detectImportPreset(fileName: string, headers: string[]): ImportPreset {
  const normalizedFileName = normalizeCsvHeader(fileName);
  const normalizedHeaders = new Set(headers.map(normalizeCsvHeader));
  const scored = importPresets
    .filter((preset) => preset.id !== "generic")
    .map((preset) => {
      const filenameScore = preset.filenameHints.some((hint) =>
        normalizedFileName.includes(normalizeCsvHeader(hint)),
      )
        ? 12
        : 0;
      const signatureScore = preset.signatureAliases.reduce(
        (score, alias) => score + (normalizedHeaders.has(normalizeCsvHeader(alias)) ? 4 : 0),
        0,
      );
      return { preset, score: filenameScore + signatureScore };
    })
    .sort((left, right) => right.score - left.score);
  const best = scored[0];
  const runnerUp = scored[1];
  return best && best.score >= 8 && best.score >= (runnerUp?.score ?? 0) + 2
    ? best.preset
    : importPresets[0]!;
}
