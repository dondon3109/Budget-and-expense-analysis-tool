export type TutorialIconKey =
  "sliders" | "pie-chart" | "camera" | "file-spreadsheet" | "repeat" | "shield-check";

export interface TutorialStep {
  title: string;
  description: string;
  tip?: string;
}

export interface TutorialSection {
  id: string;
  category: string;
  title: string;
  icon: TutorialIconKey;
  summary: string;
  actionText?: string;
  actionHref?: `/${string}`;
  steps: TutorialStep[];
}

export const TUTORIALS_DATA: readonly TutorialSection[] = [
  {
    id: "adjust-balances",
    category: "Accounts & Balances",
    title: "How to Adjust Current Account Balances",
    icon: "sliders",
    summary:
      "Keep your Zoption balances in exact sync with your real-world cash, bank accounts, and e-wallets without messing up your ledger.",
    actionText: "Go to Dashboard to adjust balance",
    actionHref: "/app",
    steps: [
      {
        title: "Locate your Account on the Dashboard",
        description:
          "On your Dashboard under 'Account balances', you will see your Cash, Bank, and any custom accounts (like GCash, Maya, or Savings).",
        tip: "You can adjust any account at any time, including default Cash and Bank accounts.",
      },
      {
        title: "Click the 'Adjust balance' icon",
        description:
          "Click the Sliders icon (Adjust balance) directly next to the account name, or click the 'Adjust balance' button in the section header.",
      },
      {
        title: "Type your real-world actual balance",
        description:
          "Type the exact amount you currently have in your wallet or bank account. Zoption will calculate the difference automatically.",
        tip: "If your new balance is higher, Zoption books it as an Income Adjustment. If lower, it books as an Expense Adjustment under Uncategorized.",
      },
      {
        title: "Save or Undo if needed",
        description:
          "Click 'Save adjustment'. If you made a typo, you can immediately click 'Undo adjustment' to reverse the transaction and restore your previous balance.",
      },
    ],
  },
  {
    id: "envelope-budgeting",
    category: "Budgeting",
    title: "How to Use Envelope Budgeting",
    icon: "pie-chart",
    summary:
      "Allocate monthly spending limits per category so you know exactly how much you have left to spend.",
    actionText: "Open Budgets",
    actionHref: "/app/budgets",
    steps: [
      {
        title: "Open the Budgets tab",
        description:
          "Navigate to the Budgets page from the sidebar or mobile bottom bar. You'll see your monthly spending breakdown.",
      },
      {
        title: "Create envelopes for your key spending categories",
        description:
          "Set budget targets for Groceries, Dining Out, Utilities, Transportation, and Personal Care. Each category functions as an envelope of money.",
      },
      {
        title: "Track envelope progress throughout the month",
        description:
          "As you log expenses, Zoption updates your envelope progress bars in real time. Green means well within budget, yellow means close, and red alerts you to overspending.",
      },
      {
        title: "Share envelopes with household members",
        description:
          "Need a shared grocery or household budget? Click 'Share envelopes' to generate a secure, encrypted link for your partner or roommate.",
        tip: "Shared budgets let both parties see remaining envelope amounts without sharing personal bank credentials.",
      },
    ],
  },
  {
    id: "fast-transactions",
    category: "Transactions",
    title: "Fast Transaction Entry: Voice, Receipts & SMS",
    icon: "camera",
    summary:
      "Log expenses in seconds using camera receipt scanning, natural voice dictation, or SMS auto-fill.",
    actionText: "Add a transaction",
    actionHref: "/app/transactions?add=1",
    steps: [
      {
        title: "Camera Receipt Scanning",
        description:
          "Click 'Scan receipt' on the dashboard or use the mobile camera. Take a photo of your paper receipt or upload an e-receipt screenshot. Zoption extracts the total, date, merchant, and line items.",
      },
      {
        title: "AI Voice Dictation",
        description:
          "Open the AI Assistant or tap the microphone icon on mobile. Say something natural like 'Paid 250 pesos for lunch at Jollibee using GCash'. The assistant parses the amount, account, and category instantly.",
      },
      {
        title: "Bank & E-Wallet SMS Notification Parsing",
        description:
          "Copy transaction SMS alerts from GCash, Maya, BDO, or BPI and paste them directly into Zoption's Quick Paste modal. It detects the amount, reference number, and merchant.",
      },
    ],
  },
  {
    id: "bank-csv-imports",
    category: "Importing Data",
    title: "Importing Bank Statements (PDF, CSV & Excel)",
    icon: "file-spreadsheet",
    summary:
      "Bulk import past bank and e-wallet statements with column mapping and duplicate checks.",
    actionText: "Go to Import Hub",
    actionHref: "/app/import",
    steps: [
      {
        title: "Download your bank statement file",
        description:
          "Sign in to your online banking or e-wallet and download your transaction history as a PDF, CSV, or Excel (.xlsx/.xls) file.",
      },
      {
        title: "Upload to the Import Hub",
        description:
          "Go to Import in Zoption and drop your file. Built-in presets recognize BDO, BPI, MariBank, Bank of America, and JPMorgan Chase automatically, and the generic preset maps standard headings for any other bank or e-wallet.",
      },
      {
        title: "Review duplicate checks & category matches",
        description:
          "Zoption checks each row against existing ledger transactions to prevent double-counting. Review every row in the preview, confirm the categories, and import in one click.",
      },
    ],
  },
  {
    id: "subscriptions-and-bills",
    category: "Bills",
    title: "Tracking Monthly Bills & Subscriptions",
    icon: "repeat",
    summary:
      "Never miss a due date or pay for an unused service with scheduled bill tracking and cancellation guides.",
    actionText: "Manage Bills",
    actionHref: "/app/subscriptions",
    steps: [
      {
        title: "Add your recurring bills",
        description:
          "Add electricity, water, and internet bills, insurance premiums, or services like Netflix and Spotify with their billing cycle (monthly or annual).",
      },
      {
        title: "Track due dates and cash flow impact",
        description:
          "See upcoming charge dates on your Calendar and review your 30-day and annual bill totals.",
      },
      {
        title: "Use Step-by-Step Cancellation Guides",
        description:
          "Want to cancel a service? Zoption provides direct links and instructions on how to cancel subscriptions across major platforms without hassle.",
      },
    ],
  },
  {
    id: "privacy-and-offline",
    category: "Privacy & Sync",
    title: "Offline Use & Data Protection",
    icon: "shield-check",
    summary:
      "Understand how your financial data is protected and how to use Zoption anywhere, even without an internet connection.",
    steps: [
      {
        title: "Local-First Architecture",
        description:
          "On the mobile app, your workspace is stored in an encrypted local SQLite database. You can record transactions, check budgets, and review balances completely offline.",
      },
      {
        title: "Automatic Background Sync",
        description:
          "When you reconnect to Wi-Fi or cellular data, Zoption syncs your changes automatically with conflict resolution.",
      },
      {
        title: "Private, Isolated Workspaces",
        description:
          "Synced records are sent over encrypted connections and stored on Zoption's servers in a workspace isolated from every other account.",
      },
    ],
  },
];

export const TUTORIAL_CATEGORIES: readonly string[] = [
  "All",
  ...new Set(TUTORIALS_DATA.map((tutorial) => tutorial.category)),
];

/** Builds the lowercased searchable index string for a tutorial section. */
export function tutorialSearchText(tutorial: TutorialSection): string {
  return [
    tutorial.title,
    tutorial.summary,
    tutorial.category,
    ...tutorial.steps.flatMap((step) => [step.title, step.description, step.tip ?? ""]),
  ]
    .join(" ")
    .toLowerCase();
}

/** Filters tutorials by category and free-text query across titles, steps, and tips. */
export function filterTutorials(
  tutorials: readonly TutorialSection[],
  { query = "", category = "All" }: { query?: string; category?: string },
): TutorialSection[] {
  const normalizedQuery = query.trim().toLowerCase();
  const normalizedCategory = category.trim() || "All";
  return tutorials.filter((tutorial) => {
    const matchesCategory =
      normalizedCategory === "All" ||
      normalizedCategory.toLowerCase() === "all" ||
      tutorial.category === normalizedCategory;
    if (!matchesCategory) return false;
    if (!normalizedQuery) return true;
    return tutorialSearchText(tutorial).includes(normalizedQuery);
  });
}
