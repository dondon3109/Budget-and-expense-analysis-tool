export interface ReleaseChange {
  title: string;
  description: string;
}

export interface ProductRelease {
  version: string;
  releasedOn: string;
  changes: readonly ReleaseChange[];
}

export const currentRelease: ProductRelease = {
  version: __APP_VERSION__,
  releasedOn: "August 6, 2026",
  changes: [
    {
      title: "Automatic bank interest",
      description:
        "Savings accounts can now earn interest automatically. Turn it on for a savings account, enter the annual rate, and pick how often it pays out — daily, monthly, or once a year. Zoption adds the earned interest to your account balance for you on the set pay day, computing it from your balance so an Interest income entry appears in your transactions automatically.",
    },
  ],
};

/**
 * Ordered most-recent-first. `currentRelease` is always the leading entry so the
 * footer “What’s new” view and the one-time acknowledgement stay in sync with the
 * shipped version, while also listing the most recent patch notes as history.
 */
export const releaseHistory: readonly ProductRelease[] = [
  currentRelease,
  {
    version: "1.1.7",
    releasedOn: "August 6, 2026",
    changes: [
      {
        title: "Subscriptions charge an account",
        description:
          "Choose the account a subscription is paid from. Adding a subscription now records its next charge as an expense in the transaction dashboard, so your account balance reflects it right away. Existing subscriptions are assigned to your Bank account automatically, and canceling a subscription removes its charge.",
      },
      {
        title: "Edit and delete subscriptions",
        description:
          "The monthly subscriptions dashboard now lets you edit a subscription's details — name, amount, billing cycle, billing date, or category — or delete one you no longer pay for, right from the list.",
      },
      {
        title: "Transfer net preview",
        description:
          "When a transfer includes a fee, the form now shows exactly how much the receiving account will get after the fee is deducted.",
      },
    ],
  },
  {
    version: "1.1.5",
    releasedOn: "August 6, 2026",
    changes: [
      {
        title: "Transfer fee overview",
        description:
          "The profile dashboard now shows the total you've paid in transfer fees and the fee-charged transfers behind it, and a new assistant conversation shares how much transfer fees have cost you and simple ways to pay fewer of them.",
      },
      {
        title: "Transfer fees",
        description:
          "Record a fee when you move money between accounts. The fee is deducted from the amount, so the receiving account gets a little less while your sending account pays the full amount.",
      },
      {
        title: "Optional transfer descriptions",
        description:
          "Descriptions are now optional for quick transfers, so you can move money between accounts without typing extra details.",
      },
    ],
  },
  {
    version: "1.1.4",
    releasedOn: "August 5, 2026",
    changes: [
      {
        title: "US dollar transactions",
        description:
          "Record transactions in Philippine pesos or US dollars. Choose the currency when you add a transaction, and every amount keeps its own symbol.",
      },
      {
        title: "Multi-currency dashboard",
        description:
          "The profile dashboard now shows overall balance, income, and expenses in both Philippine pesos and US dollars, so each currency stays separate.",
      },
      {
        title: "Account balances by currency",
        description:
          "Account balances on the dashboard show their Philippine peso and US dollar amounts side by side.",
      },
      {
        title: "Release history toggle",
        description:
          "What’s new starts with the latest update and lets you show or hide previous version notes.",
      },
    ],
  },
  {
    version: "1.1.3",
    releasedOn: "August 4, 2026",
    changes: [
      {
        title: "A full-screen assistant on mobile",
        description:
          "The AI assistant now spans the whole screen on phones instead of a floating card, so the full conversation and your message box use every bit of space.",
      },
      {
        title: "Balanced assistant setup points",
        description:
          "The assistant’s privacy and memory points are rebalanced so the short-term memory card sits centered on its own row.",
      },
    ],
  },
  {
    version: "1.1.2",
    releasedOn: "August 4, 2026",
    changes: [
      {
        title: "PayPal for Zoption Pro",
        description:
          "Pay for Zoption Pro securely with PayPal. Choose monthly or annual billing during checkout.",
      },
      {
        title: "Reliable payment confirmation",
        description:
          "Your billing status now stays accurate while PayPal confirms your payment, survives page refreshes, and lets you check payment status anytime.",
      },
      {
        title: "14-day free assistant cycle",
        description:
          "Free-plan assistant questions reset on a rolling 14-day cycle tied to your first provider-backed question.",
      },
      {
        title: "Mobile theme picker polish",
        description: "Theme options are now more compact and easier to scan on small screens.",
      },
      {
        title: "Compare plans by swiping on mobile",
        description:
          "Free and Zoption Pro now sit side by side so you can swipe to compare feature limits.",
      },
      {
        title: "A taller assistant on mobile",
        description:
          "The AI assistant now fills the screen so the full conversation and your message box stay visible.",
      },
      {
        title: "Version in the footer",
        description: "Tap the version in the footer to review the latest changes anytime.",
      },
      {
        title: "Assistant memory",
        description:
          "The AI assistant now remembers durable preferences and facts across chats, such as your debt payoff strategy or savings targets, with a Memory panel to review and clear them.",
      },
    ],
  },
  {
    version: "1.0.0",
    releasedOn: "July 29, 2026",
    changes: [
      {
        title: "Reliable transaction ordering",
        description:
          "Transactions sharing a date put newer records first, with deterministic fallback ordering.",
      },
      {
        title: "Flexible sorting",
        description:
          "Sort your transactions by date, description, or amount, and Zoption remembers your choice.",
      },
      {
        title: "What’s new updates",
        description:
          "A dialog appears once per released version so you always know what changed in Zoption.",
      },
    ],
  },
];
