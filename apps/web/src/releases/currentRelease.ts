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
  releasedOn: "September 20, 2026",
  changes: [
    {
      title: "A startup screen that no longer flickers",
      description:
        "The screen that prepares your private workspace used to fade itself away a quarter of a second after it appeared, showing the dashboard behind it before covering it again. It now holds until your session, your route, and this month's summary are ready, and then fades out once, so opening the app is a single handover rather than a flash.",
    },
    {
      title: "A faster welcome into your workspace",
      description:
        "The screen that appears while your private workspace prepares no longer holds you for a fixed three seconds. It leaves as soon as your session is restored and your workspace has loaded, its progress bar counts those real steps, and signing in through a provider link, a magic link, or a password reset now ends on it for a moment so the workspace no longer appears to jump straight from your provider.",
    },
    {
      title: "Safe-to-spend guidance on the web dashboard",
      description:
        "The dashboard now answers what you can safely spend this week: your remaining monthly budget, or your balance when the month has no budget plan, paced across the days left and capped so an upcoming renewal cannot push your projected balance below zero, with a link straight to your renewals.",
    },
    {
      title: "A cash-flow forecast that shows its shape",
      description:
        "The subscriptions forecast now draws your projected balance as a line instead of a strip of bars, marks the lowest point and the day it lands on, and puts the 30, 60, and 90 day endings side by side so you can pick a horizon without losing the others. Your safety buffer is now an amount you set, drawn on the chart as a threshold, instead of a fixed zero.",
    },
    {
      title: "Dashboard shortcuts to the forecast and the remittance calculator",
      description:
        "The dashboard now carries a card for each. The forecast card reads your lowest projected balance over the next 30 days and how many renewals fall inside that window; the remittance card shows the mid-market benchmark rate. Both open the full tool in one click, with the forecast link landing straight on the forecast view.",
    },
    {
      title: "Honest amounts in the remittance calculator",
      description:
        "The calculator no longer prints a received amount, a savings figure, or a Best Value badge while the amount, the fee, or the exchange rate you typed cannot be read. It says what it is waiting for, names the field that needs fixing, and returns to the real figures as soon as the field is valid.",
    },
    {
      title: "Android Beta 0.2.33",
      description:
        "The official Android Beta opens on the screen your session selects instead of three loading screens, applies your saved theme on the first frame, reads only the transactions the dashboard charts instead of your whole ledger, refreshes once for a sync that writes many rows, and bundles one icon font instead of sixteen.",
    },
  ],
};

/**
 * Ordered most-recent-first. `currentRelease` is always the leading entry so the
 * footer “What’s new” view and the one-time acknowledgement stay in sync with the
 * shipped version, while also listing the most recent patch notes as history.
 *
 * Each entry's version and date are the release that actually shipped its notes,
 * so a batch written ahead of a release is listed under the version that carried it.
 */
export const releaseHistory: readonly ProductRelease[] = [
  currentRelease,
  {
    version: "2.39.0",
    releasedOn: "September 19, 2026",
    changes: [
      {
        title: "Assistant memory that stays until you delete it",
        description:
          "Remembered facts and your debt payoff preference no longer expire after 90 days; they are kept until you delete a fact, clear memory, or delete your account. Conversations and their sanitized audit snapshots still expire 90 days after the last message in a chat, and the assistant asks you to review the updated data-sharing notice once.",
      },
      {
        title: "A rebuilt Memory & Preferences panel",
        description:
          "The Memory panel keeps its title, close button, and Clear memory action in place while the list scrolls, lets you set response detail and coaching tone beside the debt payoff strategy instead of only on the planning page, marks the chosen strategy with a check as well as a colour, and waits for your memory to load instead of claiming it is empty.",
      },
      {
        title: "A question that spans several records is answered from them",
        description:
          "A question that needs several kinds of lookup, such as budget, categories, and trends together, is answered from your own records even when the provider skips one of them, instead of returning a refusal that asks you to rephrase or narrow the date range.",
      },
      {
        title: "Android Beta 0.2.32",
        description:
          "The official Android Beta keeps remembered facts until you delete them, with the updated assistant consent notice, the shared monthly AI allowance, server-side sign-out, and the assistant, savings interest, and profile photo fixes.",
      },
    ],
  },
  {
    version: "2.38.0",
    releasedOn: "September 18, 2026",
    changes: [
      {
        title: "One shared AI allowance for every AI feature",
        description:
          "AI usage now comes from a single monthly pool: 500 actions on Free and 2,000 on Pro, shared by the financial assistant, voice chat, receipt scanning, PDF statement entry, and voice transaction entry. Receipt scanning, voice entry, and PDF entry are included on Free, and live streaming voice chat stays a Pro feature.",
      },
      {
        title: "Reversed payments now end Pro",
        description:
          "A refund, chargeback, or dispute ends Pro access for the period it reverses, instead of leaving the subscription active.",
      },
      {
        title: "Signing out on Android ends the session on the server",
        description:
          "Signing out now revokes the session on the server instead of only clearing the device, and falls back to clearing the device when the phone is offline.",
      },
      {
        title: "Steadier assistant amounts, savings interest, and profile photos",
        description:
          "Assistant answers can no longer state a peso amount that cannot be traced to your own records, an overdrawn savings account no longer earns interest, and profile photo changes appear within a minute instead of staying cached.",
      },
      {
        title: "Android Beta 0.2.31",
        description:
          "The official Android Beta carries the shared monthly AI allowance, server-side sign-out, and the assistant, savings interest, and profile photo fixes.",
      },
    ],
  },
  {
    version: "2.33.0",
    releasedOn: "September 16, 2026",
    changes: [
      {
        title: "Cross-chat assistant memory and editor",
        description:
          "The financial assistant now remembers key budget caps, payday schedules, checking buffers, and recurring bills across chats, ranks saved facts by relevance to your questions, and lets you view, edit, or delete individual remembered facts in the Memory panel on web and mobile.",
      },
      {
        title: "Mobile navigation and UI ergonomics",
        description:
          "Pushed screens now feature modal conflict navigation, responsive review forms, inline bottom-sheet pickers, screen reader currency announcements, and eliminated double-header insets.",
      },
      {
        title: "Monthly transaction Net totals",
        description:
          "Renamed the mobile Transactions month summary to Net with a clear explanation of how income minus expenses differs from your account balance.",
      },
      {
        title: "Mobile cookie consent banner fix",
        description:
          "Cookie consent action buttons on iOS Safari now render at the intended size with visible text labels and easy access to preference controls.",
      },
      {
        title: "Android Beta 0.2.29",
        description:
          "The official Android Beta includes cross-chat assistant memory management, mobile navigation and layout ergonomics, monthly Net explanations, and mobile cookie consent fixes.",
      },
    ],
  },
  {
    version: "2.32.4",
    releasedOn: "September 15, 2026",
    changes: [
      {
        title: "Quick start guide and mobile dashboard fixes",
        description:
          "The quick start guide now disappears completely when dismissed instead of leaving a reopen banner behind, and the mobile Safe-to-Spend renewals button no longer overflows its card on narrow screens.",
      },
      {
        title: "Guided spreadsheet migration and full data portability",
        description:
          "Import transactions smoothly from Excel or CSV with bank preset recognition and column mapping, and export complete unpaywalled JSON account backups on web and mobile.",
      },
      {
        title: "Platform admin console",
        description:
          "Manage sponsored Pro seats, customer reviews, AI and voice models, and support report triage from a central dashboard.",
      },
      {
        title: "Assistant chat history multi-delete",
        description:
          "Select and delete multiple assistant conversation threads at once with single-action confirmation on web and mobile.",
      },
      {
        title: "Android Beta 0.2.28",
        description:
          "The official Android Beta carries the quick start guide and renewals fixes, plus the guided spreadsheet migration flow, complete JSON account export share sheet, multi-chat deletion in assistant history, and same-day transactions that stay in the order you recorded them.",
      },
    ],
  },
  {
    version: "2.32.0",
    releasedOn: "September 13, 2026",
    changes: [
      {
        title: "Safe-to-spend guidance and cash-flow projection",
        description:
          "Know what is safe to spend this week based on your balance, upcoming renewals, and remaining envelope budgets with neutral forward-looking guidance.",
      },
      {
        title: "Fast-path voice draft preview with auto-save",
        description:
          "Voice-logged expenses now show a 3-second auto-saving preview card with one-tap edit or cancel escape hatches.",
      },
      {
        title: "Calm plan guidance replacing over-budget alerts",
        description:
          "Budget limits now provide constructive pacing guidance instead of alarming red warnings, keeping you focused on forward progress.",
      },
    ],
  },
  {
    version: "2.30.1",
    releasedOn: "September 11, 2026",
    changes: [
      {
        title: "Resilient home-screen mic widget voice capture",
        description:
          "Cold-starting the app from the home-screen mic widget preserves your voice recording and review payload without dropping notes during session restore or on devices with full-screen speech UI.",
      },
      {
        title: "Context-aware spoken accounts and categories",
        description:
          "Mic widget voice notes now detect the target account directly from what you speak and suggest matching categories with semantic matching instead of defaulting to Uncategorized.",
      },
      {
        title: "Safer balance adjustments from widget notes",
        description:
          "Balance updates initiated from the mic widget now wait for the account balance to load from the dashboard before computing adjustments.",
      },
      {
        title: "Android Beta 0.2.24",
        description:
          "The official Android Beta includes improved home-screen mic widget voice capture, speech recognition fixes for Android 11+, and context-aware account and category detection.",
      },
    ],
  },
  {
    version: "2.30.0",
    releasedOn: "September 9, 2026",
    changes: [
      {
        title: "Interactive user guides and tutorials page",
        description:
          "Step-by-step walkthroughs to help you master envelope budgeting, balance adjustments, receipt scanning, and financial planning across web and mobile.",
      },
      {
        title: "Interactive Quick Start onboarding guides",
        description:
          "Interactive onboarding cards guide you through balance setup, envelope budgeting, and first transaction entry directly from your dashboard.",
      },
      {
        title: "One-click account balance adjustments",
        description:
          "Keep accounts in exact sync with your real-world balances directly from dashboard account cards and mobile wallets with live delta calculation.",
      },
      {
        title: "Responsive budget controls on compact screens",
        description:
          "Actions like Share Envelopes and Add Budget now wrap cleanly on compact screens without clipping or horizontal scrolling.",
      },
      {
        title: "Android Beta 0.2.23",
        description:
          "The official Android Beta includes the Tutorials screen, dashboard quick start guides, responsive budget screen actions, and one-click balance adjust shortcuts.",
      },
    ],
  },
  {
    version: "2.29.0",
    releasedOn: "September 7, 2026",
    changes: [
      {
        title: "Fast-path voice transaction entry",
        description:
          "Draft transactions directly from live speech with automatic silence detection, live transcript captions, and intelligent category matching across web and mobile.",
      },
      {
        title: "Smart SMS notification quick-paste",
        description:
          "Paste bank and wallet SMS alerts to auto-detect amounts, dates, accounts, and categories with duplicate transaction warnings and drawer review before saving.",
      },
      {
        title: "Native Android home-screen mic widget",
        description:
          "Tap to talk right from your home screen without opening the app, featuring voice expense capture, balance reconciliation, and one-click balance adjustments.",
      },
      {
        title: "Day-1 CSV import and offline privacy mode",
        description:
          "Import your transaction history in 3 simple steps directly on mobile, with offline transcript queuing and in-flight no-store privacy guarantees.",
      },
      {
        title: "Android Beta 0.2.22",
        description:
          "The official Android Beta includes the native home-screen mic widget, day-1 CSV import, offline voice draft queuing, and fast-path transaction transcription.",
      },
    ],
  },
  {
    version: "2.18.0",
    releasedOn: "August 26, 2026",
    changes: [
      {
        title: "Visual Renewal Calendar for Subscriptions",
        description:
          "Switch between table and renewal calendar views to inspect upcoming billing cycles, payment schedules across dates, and cash-flow impact on an interactive month-by-month grid.",
      },
      {
        title: "Category emojis across web and mobile",
        description:
          "Give custom categories their own emoji icons with starter category presets, clear visual badges in transaction lists, and a dedicated mobile category editor.",
      },
      {
        title: "Redesigned mobile transaction ledger",
        description:
          "Navigate expenses month by month on your phone with grouped daily timelines, instant monthly income/expense/net totals, quick category filters, and actionable empty states.",
      },
      {
        title: "Android Beta 0.2.20",
        description:
          "The official Android Beta includes responsive and accurate voice transcription with instant audio capture, faster silence detection, batch transcription fallback, and restored conversation history when reopening voice chat.",
      },
      {
        title: "Focused budget limits",
        description:
          "Spending in categories without a monthly budget is excluded from budget totals and over-budget warnings so your planned spending stays clear.",
      },
    ],
  },
  {
    version: "2.2.1",
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
    version: "2.0.0",
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
      {
        title: "Refreshed dashboards and workflows",
        description:
          "The calendar, profile dashboard, import flow, and financial assistant now share a cleaner visual system with clearer hierarchy, refined controls, and self-hosted fonts.",
      },
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
      {
        title: "Subscriptions charge an account",
        description:
          "Choose the account a subscription is paid from. Adding a subscription records its next charge as an expense in the transaction dashboard so your account balance reflects it right away, while canceling the subscription does not refund or change your recorded transaction history.",
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
