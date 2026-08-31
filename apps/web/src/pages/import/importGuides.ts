import { importPresets, type ImportPresetId } from "../../lib/importPresets";

/**
 * Import guides are public, indexable pages, so every claim on them has to be
 * true of the real importer. Each guide is bound to a preset id and the test in
 * importGuides.test.ts fails if a guide references a preset that does not exist.
 */
export type ImportGuidePresetId = Exclude<ImportPresetId, "auto" | "generic">;

export interface ImportGuide {
  presetId: ImportGuidePresetId;
  path: string;
  /** Full institution name used in body copy. */
  institution: string;
  /** Short name used in headings and link text. */
  shortName: string;
  /** SEO title. */
  title: string;
  /** SEO meta description. */
  description: string;
  /** Page H1. */
  heading: string;
  summary: string;
  exportSteps: string[];
  /** Bank-specific detail. Keep to what the importer genuinely handles. */
  notes: string[];
  questions: { question: string; answer: string }[];
}

const SHARED_EXPORT_STEPS = [
  "Sign in to your online banking and open the transaction history or statement page for the account you want to review.",
  "Choose the date range you want, then use the download or export option.",
  "If your bank asks for a format, pick CSV, Excel (.xlsx or .xls), or PDF — Zoption reads all of them.",
  "In Zoption, open Import, choose the file, and check the preview before you save anything.",
];

const PHP_CURRENCY_NOTE =
  "This export is usually in a foreign currency. Zoption stores Philippine pesos only and does not convert currencies, so confirm the amounts are already in pesos before you save them.";

export const IMPORT_GUIDES: ImportGuide[] = [
  {
    presetId: "bdo",
    path: "/import/bdo-statement",
    institution: "BDO (Banco de Oro)",
    shortName: "BDO",
    title: "Import BDO Statements into Zoption — CSV, Excel & PDF",
    description:
      "Bring BDO transaction history into a private peso budget tracker. Zoption detects BDO debit and credit columns, previews every row, and blocks duplicates — with no bank connection.",
    heading: "Import BDO statements into Zoption",
    summary:
      "Turn a downloaded BDO transaction history into categorised expenses, budget progress, and a monthly cash-flow picture — without connecting Zoption to your bank.",
    exportSteps: SHARED_EXPORT_STEPS,
    notes: [
      "BDO exports often split amounts into separate Debit and Credit columns. Zoption detects that layout and reads both, so withdrawals and deposits land with the right sign.",
      "Where a running balance or reference number is present, Zoption recognises those headings and leaves them out of the amount columns.",
    ],
    questions: [
      {
        question: "Do I need to reformat a BDO export before importing it?",
        answer:
          "Usually not. Select the BDO preset — or let Zoption detect it from the file — and the date, description, and amount columns are matched for you. You can remap any column in the preview if something looks off.",
      },
      {
        question: "Will importing the same statement twice create duplicates?",
        answer:
          "No. Zoption checks incoming rows against transactions you already have and flags likely duplicates in the preview, so you decide what to keep before anything is saved.",
      },
    ],
  },
  {
    presetId: "bpi",
    path: "/import/bpi-statement",
    institution: "BPI (Bank of the Philippine Islands)",
    shortName: "BPI",
    title: "Import BPI Statements into Zoption — CSV, Excel & PDF",
    description:
      "Bring BPI transaction history into a private peso budget tracker. Zoption matches BPI debit and credit columns, previews every row, and blocks duplicates — with no bank connection.",
    heading: "Import BPI statements into Zoption",
    summary:
      "Turn a downloaded BPI transaction history into categorised expenses, budget progress, and a monthly cash-flow picture — without connecting Zoption to your bank.",
    exportSteps: SHARED_EXPORT_STEPS,
    notes: [
      "BPI exports use either a single Amount column or separate Debit and Credit columns. Zoption detects which one your file has and switches automatically.",
      "Headings such as Branch, Transaction Description, and Running Balance are recognised, so the description column is not mistaken for an amount.",
    ],
    questions: [
      {
        question: "What if my BPI file uses a single Amount column?",
        answer:
          "That works too. Zoption prefers the split Debit and Credit layout when it is present, and falls back to a single Amount column otherwise. You can switch modes in the preview before saving.",
      },
      {
        question: "Can I import several months of BPI history at once?",
        answer:
          "Yes. Export the full date range you want and import it in one go. Row counts vary by plan, and the preview shows exactly what will be saved before you commit.",
      },
    ],
  },
  {
    presetId: "maribank",
    path: "/import/maribank-statement",
    institution: "MariBank",
    shortName: "MariBank",
    title: "Import MariBank Statements into Zoption — CSV, Excel & PDF",
    description:
      "Bring MariBank transaction history into a private peso budget tracker. Zoption reads MariBank's transaction-time column, previews every row, and blocks duplicates — with no bank connection.",
    heading: "Import MariBank statements into Zoption",
    summary:
      "Turn a downloaded MariBank transaction history into categorised expenses, budget progress, and a monthly cash-flow picture — without connecting Zoption to your bank.",
    exportSteps: SHARED_EXPORT_STEPS,
    notes: [
      "MariBank history typically puts the date and time in one Transaction time column. Zoption reads that combined column and uses the calendar date for each entry.",
      "Transaction type headings such as Transaction type and Transaction status are recognised, which helps separate money in from money out.",
    ],
    questions: [
      {
        question: "Does the time part of the column cause problems?",
        answer:
          "No. Zoption keeps the date and ignores the time, so entries land on the correct day. It also understands U.S. slash dates such as 03/14/2026, which appear in some exports.",
      },
      {
        question: "Can I track transfers between my own accounts?",
        answer:
          "Yes. Transfers are recorded in the ledger but excluded from income and expense totals, so moving money between your own accounts does not look like spending.",
      },
    ],
  },
  {
    presetId: "bank-of-america",
    path: "/import/bank-of-america-statement",
    institution: "Bank of America",
    shortName: "Bank of America",
    title: "Import Bank of America Statements into Zoption — CSV & Excel",
    description:
      "Bring Bank of America transaction history into a private peso budget tracker. Zoption matches Posted Date and Payee columns, previews every row, and blocks duplicates — with no bank connection.",
    heading: "Import Bank of America statements into Zoption",
    summary:
      "Turn a downloaded Bank of America transaction history into categorised expenses and budget progress, alongside your peso accounts, without connecting Zoption to your bank.",
    exportSteps: SHARED_EXPORT_STEPS,
    notes: [
      "Bank of America exports use a Posted Date and a Payee or Description column. Zoption matches both and reads a single Amount column with signed values.",
      PHP_CURRENCY_NOTE,
    ],
    questions: [
      {
        question: "My statement is in US dollars. Can Zoption convert it?",
        answer:
          "No. Zoption stores Philippine pesos only and does not convert currencies. Convert the amounts to pesos before importing, or use a peso-denominated account if you need the figures to match your other records.",
      },
      {
        question: "Which date does Zoption use?",
        answer:
          "The Posted Date column, which reflects when the transaction settled rather than when it was authorised. That keeps your monthly totals consistent with the statement.",
      },
    ],
  },
  {
    presetId: "jpmorgan",
    path: "/import/jpmorgan-statement",
    institution: "JPMorgan Chase",
    shortName: "JPMorgan Chase",
    title: "Import Chase & JPMorgan Statements into Zoption — CSV & Excel",
    description:
      "Bring Chase and JPMorgan transaction history into a private peso budget tracker. Zoption matches Posting Date and Details columns, previews every row, and blocks duplicates — with no bank connection.",
    heading: "Import Chase and JPMorgan statements into Zoption",
    summary:
      "Turn a downloaded Chase or JPMorgan transaction history into categorised expenses and budget progress, alongside your peso accounts, without connecting Zoption to your bank.",
    exportSteps: SHARED_EXPORT_STEPS,
    notes: [
      "Chase and JPMorgan exports use a Posting Date and a Details or Description column. Zoption matches both and reads a single signed Amount column.",
      PHP_CURRENCY_NOTE,
    ],
    questions: [
      {
        question: "My Chase statement is in US dollars. Can Zoption convert it?",
        answer:
          "No. Zoption stores Philippine pesos only and does not convert currencies. Convert the amounts to pesos before importing, or keep foreign-currency accounts separate from your peso budgeting.",
      },
      {
        question: "Are card and checking exports handled the same way?",
        answer:
          "Both use the same Posting Date, Details, and Amount headings, so the same preset covers them. Check the preview to confirm the columns were matched the way you expect.",
      },
    ],
  },
];

export const IMPORT_GUIDE_PATHS = IMPORT_GUIDES.map((guide) => guide.path);

export function findImportGuide(path: string): ImportGuide | undefined {
  return IMPORT_GUIDES.find((guide) => guide.path === path);
}

/**
 * The column headings the importer actually looks for, read straight from the
 * preset so the page cannot advertise detection the matcher does not perform.
 */
export function detectedColumnLabels(presetId: ImportGuidePresetId): string[] {
  const preset = importPresets.find((candidate) => candidate.id === presetId);
  if (!preset) return [];
  return Object.values(preset.aliases)
    .flatMap((aliases) => aliases.slice(0, 1))
    .map((alias) => alias.trim())
    .filter(Boolean);
}
