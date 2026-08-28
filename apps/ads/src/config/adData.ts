import type {
  AdTheme,
  CombinedStoryConfig,
  FeatureHighlightConfig,
  ProblemSolutionConfig,
  ProductShowcaseConfig,
} from "./types";

export const zoptionTheme: AdTheme = {
  background: "#f4f1e9",
  ink: "#17342e",
  accent: "#0f6b5b",
  accentStrong: "#06473d",
  accentSoft: "#d5f4ea",
  paper: "#fffdf8",
  muted: "#646964",
};

export const featureHighlightConfig: FeatureHighlightConfig = {
  durationSeconds: 13,
  eyebrow: "YOUR MONTH, MADE CLEAR",
  headline: "See where your money goes.",
  subtext: "Track expenses, follow budgets, and understand what is still available.",
  cta: "Start for free",
  url: "zoption.site",
  asset: {
    alt: "Illustrative Zoption monthly overview",
    fit: "cover",
    position: "center",
  },
  featureLabels: ["Expenses in one place", "Budgets you can follow", "A clearer monthly picture"],
  theme: zoptionTheme,
};

export const problemSolutionConfig: ProblemSolutionConfig = {
  durationSeconds: 15,
  eyebrow: "FROM SCATTERED TO CLEAR",
  headline: "Still wondering where your money goes?",
  subtext: "Bring your records together and turn them into a practical monthly view.",
  cta: "Build a clearer money habit",
  url: "zoption.site",
  asset: {
    alt: "Illustrative Zoption expense and budget view",
    fit: "cover",
    position: "center",
  },
  problemLines: ["Receipts everywhere", "Budgets in your head", "No clear monthly picture"],
  solutionSteps: ["Record or import", "Set category budgets", "Review trends and recurring costs"],
  theme: zoptionTheme,
};

export const productShowcaseConfig: ProductShowcaseConfig = {
  durationSeconds: 12,
  eyebrow: "PRIVATE BUDGETING, SIMPLIFIED",
  headline: "Your finances. One calm view.",
  subtext: "A private workspace for expenses, budgets, recurring costs, and read-only insights.",
  cta: "Try Zoption today",
  url: "zoption.site",
  asset: {
    alt: "Illustrative Zoption product dashboard",
    fit: "cover",
    position: "center",
  },
  callouts: ["Monthly overview", "Budget visibility", "Read-only assistant"],
  theme: zoptionTheme,
};

export const combinedStoryConfig: CombinedStoryConfig = {
  durationSeconds: 60,
  eyebrow: "FROM RECORDS TO REAL CLARITY",
  headline: "Your money has a story. Zoption helps you understand it.",
  subtext:
    "Import transactions, follow your budget, and ask a read-only AI assistant by text or voice.",
  cta: "Start with Zoption",
  url: "zoption.site",
  asset: {
    alt: "Illustrative Zoption financial workspace",
    fit: "cover",
    position: "center",
  },
  chapters: ["Bring it together", "See the month", "Ask your assistant", "Use your voice"],
  importSteps: ["Choose CSV or Excel", "Match and preview", "Import approved rows"],
  assistantPrompts: [
    "Where did most of my spending go?",
    "Am I still on track with groceries?",
    "Which recurring costs should I review?",
  ],
  voiceBenefits: ["Speak your question", "Review before sending", "Hear a spoken reply"],
  theme: zoptionTheme,
};
