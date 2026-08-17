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
  releasedOn: "August 17, 2026",
  changes: [
    {
      title: "Cash flow chart built for your phone",
      description:
        "The Money in and out panel now draws the weekly, monthly, and six-month cash flow as a touch-first chart on phone screens. Tap any day or month to see the exact amounts, drag to scrub across the range, and tap again to dismiss. The installed Android app picks this up automatically on its next launch.",
    },
    {
      title: "Recording now looks like recording",
      description:
        "The microphone button shows a pulsing red recording state with a running timer while you speak, and a separate spinner while your voice is being transcribed. Recording and loading are no longer easy to confuse.",
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
    version: "2.2.0",
    releasedOn: "August 14, 2026",
    changes: [
      {
        title: "Turn a receipt photo into a transaction draft",
        description:
          "Choose Scan receipt from Transactions or the dashboard, then take a photo or upload a JPEG, PNG, or WebP image. Zoption drafts the merchant, date, amount, transaction type, and category for you.",
      },
      {
        title: "Review every field before saving",
        description:
          "Correct the AI-drafted details, continue to the familiar import preview, and check duplicate warnings before you confirm. Nothing is added to your workspace until you explicitly commit the reviewed transaction.",
      },
      {
        title: "Receipt photos are never stored",
        description:
          "Receipt scanning stays off until you accept its separate one-time notice. The selected photo is processed only to draft the entry and is discarded immediately after extraction; only the transaction you approve is saved.",
      },
    ],
  },
  {
    version: "2.1.0",
    releasedOn: "August 12, 2026",
    changes: [
      {
        title: "Talk naturally with your Financial Assistant",
        description:
          "Ask a question by voice and receive the same read-only, grounded financial answer in chat. Voice recordings are transcribed only after you enable the separate voice notice, and recordings and generated audio are not stored in your Zoption workspace.",
      },
      {
        title: "Recording stops when you finish",
        description:
          "Push to talk, speak normally, and Zoption stops recording after you finish. If no speech is detected, the recording ends without sending an empty clip for transcription.",
      },
      {
        title: "Choose how voice works for you",
        description:
          "Push-to-talk now starts with automatic sending and spoken plus text replies in Production. You can still switch to transcript review or text-only answers in Voice settings.",
      },
      {
        title: "Clearer spoken answers",
        description:
          "Spoken replies now show when audio is being prepared and turn headings, lists, tables, and links into more natural speech instead of reading formatting aloud.",
      },
      {
        title: "A more capable, easier-to-reach Zoption",
        description:
          "This release also adds Google and Facebook sign-in, in-product help and bug reporting, clearer Free-plan information, improved mobile navigation, and more accurate remaining-budget calculations.",
      },
    ],
  },
  {
    version: "1.2.4",
    releasedOn: "August 10, 2026",
    changes: [
      {
        title: "A smoother welcome to your workspace",
        description:
          "Zoption now uses one polished loading experience after sign-in while your private workspace prepares in the background. It no longer restarts or hands off to an older loading screen before showing your dashboard.",
      },
      {
        title: "Privacy-conscious product insights",
        description:
          "Consent-aware product and AI observability now helps improve reliability while keeping assistant prompts, responses, and financial content out of analytics events.",
      },
      {
        title: "More reliable calendar activity",
        description:
          "Calendar interactions no longer leave the page frozen, and calendar amounts now handle US dollar transactions correctly.",
      },
      {
        title: "A sharper Zoption identity",
        description:
          "A new brand mark now gives Zoption a clearer, more consistent identity across the landing page, sign-in, app navigation, browser tabs, and saved shortcuts.",
      },
    ],
  },
  {
    version: "1.2.3",
    releasedOn: "August 9, 2026",
    changes: [
      {
        title: "Goals and subscriptions at a glance",
        description:
          "The profile dashboard now shows your active savings goals alongside the combined monthly cost of every active subscription, giving you a clearer view of what you are building toward and paying for.",
      },
      {
        title: "Sign-in stays responsive",
        description:
          "Setup, update, billing, and account dialogs now coordinate how they pause the page, preventing the dashboard from remaining unclickable or unscrollable after overlapping dialogs close.",
      },
    ],
  },
  {
    version: "1.2.2",
    releasedOn: "August 9, 2026",
    changes: [
      {
        title: "Refreshed dashboards and workflows",
        description:
          "The calendar, profile dashboard, import flow, and financial assistant now share a cleaner visual system with clearer hierarchy, refined controls, and self-hosted fonts.",
      },
    ],
  },
  {
    version: "1.2.1",
    releasedOn: "August 8, 2026",
    changes: [
      {
        title: "More reliable Pro billing",
        description:
          "Zoption now verifies PayPal subscription updates more carefully and handles delayed or failed payments more reliably, so your Pro status stays in sync with PayPal.",
      },
      {
        title: "Safer spreadsheet imports",
        description:
          "Excel and CSV imports now receive stricter file checks and clearer limits before processing, helping malformed or unusually large files fail safely instead of interrupting your workspace.",
      },
      {
        title: "Smarter assistant memory",
        description:
          "The financial assistant can refine saved memories with a controlled model-assisted pass while keeping usage bounded within each 14-day cycle.",
      },
      {
        title: "Privacy-respecting analytics",
        description:
          "Google Analytics now loads only after you allow Analytics cookies on eligible public pages, and opting out removes its cookies from your browser.",
      },
    ],
  },
  {
    version: "1.2.0",
    releasedOn: "August 6, 2026",
    changes: [
      {
        title: "Automatic bank interest",
        description:
          "Savings accounts can now earn interest automatically. Turn it on for a savings account, enter the annual rate, and pick how often it pays out — daily, monthly, or once a year. Zoption adds the earned interest to your account balance for you on the set pay day, computing it from your balance so an Interest income entry appears in your transactions automatically. Available on Zoption Pro.",
      },
      {
        title: "Interest on your Bank account",
        description:
          "Switch your built-in Bank account to Savings, then turn on automatic interest. The easy-access bank balance you already track can now earn interest the same way a dedicated savings account does.",
      },
    ],
  },
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
