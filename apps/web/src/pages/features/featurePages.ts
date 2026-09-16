/**
 * Feature explainer pages are public and indexable, so every claim on them has to be
 * true of the shipped product. Each page also names where to read next: the guide that
 * goes deeper and the sibling explainer.
 *
 * siteMetadata.ts reads FEATURE_PAGES for titles, descriptions, canonicals, and sitemap
 * entries, and PublicRoutes.tsx turns the same list into routes, so a page added here is
 * routed, prerendered, and submitted to the sitemap in one step. feature-pages.test.tsx
 * fails when a page here has no manifest entry, or when copy claims something the web
 * app cannot do.
 */
export interface FeaturePageSection {
  id: string;
  title: string;
  body: string;
  /** Ordered steps rendered as a numbered list under the body. */
  steps?: string[];
}

export interface FeaturePage {
  path: FeaturePagePath;
  /** SEO title. */
  title: string;
  /** SEO meta description. */
  description: string;
  /** Page H1. */
  heading: string;
  summary: string;
  keywords: string[];
  sections: FeaturePageSection[];
  /** A guide that covers the same ground in more depth. */
  relatedGuideSlug: string;
  /** The sibling explainer, so the two pages link to each other. */
  relatedFeaturePath: FeaturePagePath;
}

export type FeaturePagePath = "/features/receipt-scanning" | "/features/voice-expense-entry";

/** Feeds the WebPage dateModified and the sitemap lastmod; keep the two in step. */
export const FEATURE_PAGES_LAST_MODIFIED = "2026-09-16";
export const FEATURE_PAGES_LAST_UPDATED = "September 16, 2026";

export const FEATURE_PAGES: FeaturePage[] = [
  {
    path: "/features/receipt-scanning",
    title: "Receipt Scanning for Expense Tracking — Zoption",
    description:
      "Turn a receipt photo into a reviewed transaction draft with merchant, date, total, and category. The image is never stored, duplicates are blocked, and amounts stay exact to the centavo.",
    heading: "Scan a receipt into your budget",
    summary:
      "Photograph a paper receipt or a checkout screen and Zoption drafts the transaction: merchant, date, total, and a likely category. You confirm the draft before it reaches your ledger.",
    keywords: [
      "receipt scanner expense tracker",
      "scan receipt into budget",
      "receipt photo to transaction",
      "receipt images never stored",
      "philippines receipt tracking",
    ],
    sections: [
      {
        id: "what-happens-after-the-photo",
        title: "What Happens After You Take the Photo",
        body: "Zoption reads the merchant, the date, the total, and a likely category from the image, then shows them as an editable draft. Check the fields, fix anything the reading got wrong, and save when it looks right. If the reading is wrong, close the draft and type the transaction instead, because nothing is saved until you confirm it.",
        steps: [
          "Take a photo of the receipt or upload an image of it.",
          "Check the merchant, date, total, and category in the draft.",
          "Edit what the reading got wrong, then confirm to save it.",
        ],
      },
      {
        id: "consent-and-no-stored-image",
        title: "Its Own Consent, and No Stored Image",
        body: "Receipt reading is optional and asks for its own consent, separate from the rest of Zoption. The image is read to produce the draft and is never stored, kept, or used for anything else, and declining the consent leaves every other feature working exactly the same way.",
      },
      {
        id: "duplicates-and-peso-accuracy",
        title: "Duplicates Are Blocked and Centavos Stay Exact",
        body: "A receipt you already recorded will not become a second transaction: Zoption fingerprints each entry and skips a match, the same check it uses for imported statement files. Amounts are stored in pesos and centavos, so the total printed on the receipt and the total in your ledger agree to the centavo.",
      },
      {
        id: "one-ledger-three-ways-in",
        title: "One Ledger, Three Ways In",
        body: "Scanning a receipt is one of three ways to record spending without typing every field: import a statement file, dictate a transaction by voice, or scan a receipt. All three land in the same categories, budgets, and reports, so the month stays in one place. Receipt scanning is available on the web app and in the Android Beta.",
      },
    ],
    relatedGuideSlug: "replace-excel-spreadsheets-budget-tracker",
    relatedFeaturePath: "/features/voice-expense-entry",
  },
  {
    path: "/features/voice-expense-entry",
    title: "Voice Expense Entry for Fast Transaction Logging — Zoption",
    description:
      "Speak a transaction and Zoption drafts the amount, merchant, date, and category for a one tap confirmation. English and Tagalog are supported, and you review every draft before it saves.",
    heading: "Log spending by voice",
    summary:
      "Say what you spent and Zoption drafts the transaction: amount, merchant, date, and category. You review the draft and confirm it, so a misheard word costs one correction rather than a wrong record.",
    keywords: [
      "voice expense entry",
      "speech to transaction philippines",
      "log expenses by talking",
      "tagalog voice expense tracker",
      "hands free expense logging",
    ],
    sections: [
      {
        id: "from-spoken-sentence-to-draft",
        title: "From Spoken Sentence to Reviewed Draft",
        body: "Voice entry listens while you speak, transcribes the sentence, and pulls out the amount and the merchant. What you get is an editable form, not a saved transaction, so you can correct the category or the amount before it reaches your ledger.",
        steps: [
          "Tap the microphone on the transactions page or inside the assistant.",
          "Say the transaction in your own words, such as the amount and where you spent it.",
          "Check the draft, adjust anything that is off, and confirm to save.",
        ],
      },
      {
        id: "english-and-tagalog",
        title: "English and Tagalog, One Setting",
        body: "Voice entry understands English and Tagalog. The voice language setting offers Auto, which detects either language, or you can fix it to English or Tagalog. The same choice applies to the assistant's voice input and hands free conversation, and you can change it at any time in Account Settings.",
      },
      {
        id: "microphone-and-control",
        title: "The Microphone Is Yours to Control",
        body: "Your browser or phone asks for microphone permission the first time you use voice entry. If you decline, typing and importing still work exactly as before. Audio is used to produce the transcription while you are recording, and what you keep is the draft you confirm.",
      },
      {
        id: "same-ledger-same-budgets",
        title: "The Same Ledger and the Same Budgets",
        body: "A spoken transaction lands in the same categories, budgets, and reports as every other entry, and it goes through the same duplicate check. Voice is a faster way in, not a separate set of books. Voice entry is available on the web app and in the Android Beta.",
      },
    ],
    relatedGuideSlug: "track-gcash-maya-without-bank-linking",
    relatedFeaturePath: "/features/receipt-scanning",
  },
];

export function findFeaturePage(path: string): FeaturePage | undefined {
  return FEATURE_PAGES.find((page) => page.path === path);
}
