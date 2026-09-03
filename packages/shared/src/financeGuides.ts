export interface FinanceGuideSection {
  id: string;
  title: string;
  content: string;
  keyTakeaways?: string[];
}

export interface FinanceGuideFaq {
  question: string;
  answer: string;
}

export interface FinanceGuide {
  slug: string;
  title: string;
  seoTitle: string;
  description: string;
  category: "budgeting" | "subscriptions" | "banking" | "tools";
  readTimeMinutes: number;
  publishedDate: string;
  updatedDate: string;
  author: string;
  keywords: string[];
  sections: FinanceGuideSection[];
  faqs: FinanceGuideFaq[];
}

export const FINANCE_GUIDES: FinanceGuide[] = [
  {
    slug: "track-gcash-maya-without-bank-linking",
    title: "How to Track GCash & Maya Expenses Without Bank Linking",
    seoTitle: "Track GCash & Maya Expenses Safely Without Bank Linking (Privacy-First)",
    description:
      "A complete guide to tracking Philippine e-wallet transactions from GCash, Maya, and GrabPay without sharing your bank credentials or granting third-party API access.",
    category: "budgeting",
    readTimeMinutes: 7,
    publishedDate: "2026-01-15",
    updatedDate: "2026-08-20",
    author: "Zoption Personal Finance Team",
    keywords: [
      "gcash expense tracker",
      "maya transaction tracker",
      "track ewallet expenses philippines",
      "budgeting without bank credentials",
      "privacy first finance philippines",
      "gcash transaction history export",
      "maya statement tracking",
    ],
    sections: [
      {
        id: "the-privacy-problem-with-bank-linking",
        title: "The Security & Privacy Risks of Traditional Bank Aggregators",
        content:
          "Traditional personal finance apps often require users to connect their bank and e-wallet accounts via third-party aggregators. In the Philippines, this frequently requires entering login credentials, SMS OTPs, or granting broad read-and-write scopes. If an aggregator suffers a breach or mismanages tokens, your account safety and transaction history are at risk. Furthermore, Philippine e-wallets like GCash and Maya frequently update security protocols, causing automated scrapers to break and trigger unwanted security lockouts on your primary mobile wallet.",
        keyTakeaways: [
          "Entering online banking credentials into third-party apps violates the terms of service of many Philippine financial institutions.",
          "Automated credential scrapers can inadvertently trigger account freezes and fraud alerts on GCash and Maya.",
          "Privacy-first tracking eliminates exposure to third-party data leaks.",
        ],
      },
      {
        id: "how-to-export-ewallet-data",
        title: "Exporting Transaction Records from GCash and Maya",
        content:
          "Both GCash and Maya provide built-in mechanisms to view and export your activity. In GCash, you can request an official Transaction History or Statement of Account (eSOA) sent directly to your verified email as a PDF or CSV format covering up to 6 or 12 months. In Maya, you can download monthly account statements directly from the app under Account Settings or export transaction summaries. These official exports contain accurate timestamps, reference numbers, amounts, and merchant details.",
        keyTakeaways: [
          "GCash: Request official Transaction History via the in-app Activity tab or Help Center to receive a detailed breakdown via email.",
          "Maya: Access monthly statements directly from the Profile & Settings menu.",
          "Statements include official BSP-regulated reference IDs for easy reconciliation.",
        ],
      },
      {
        id: "manual-and-csv-import-workflows",
        title: "Privacy-Preserving Workflows: CSV Import and Smart Presets",
        content:
          "Rather than handing over account credentials, modern budgeters use structured CSV imports and clipboard parsers. By uploading your exported e-wallet statements or pasting standard confirmation SMS receipts into a local-first budget tracker, your raw banking credentials never leave your custody. Intelligent column mapping detects standard GCash (e.g. 'Express Send', 'Pay QR', 'Bank Transfer') and Maya line items, categorizing expenses automatically while preserving your total financial privacy.",
        keyTakeaways: [
          "Use standardized CSV import presets configured specifically for Philippine e-wallets.",
          "Parse SMS confirmations (e.g. 2882 GCash alerts) into ledger entries without connecting API keys.",
          "Keep your financial ledger synchronized across your devices without external credential exposure.",
        ],
      },
      {
        id: "best-practices-ewallet-budgeting",
        title: "Best Practices for Managing Multiple Philippine Wallets",
        content:
          "Many Filipinos maintain separate wallets for distinct purposes: GCash for daily peer-to-peer transfers and street vendors, Maya for digital banking interest and virtual card subscriptions, and bank debit cards for ATM withdrawals. To avoid double-counting transfers between your own accounts, tag inter-wallet movements as 'Transfers' rather than income or expense. Reconcile balances weekly against your actual app balance to catch unbilled subscriptions and hidden cash-in convenience fees.",
        keyTakeaways: [
          "Separate internal transfers between GCash and Maya from genuine living expenses.",
          "Track cash-in and convenience fees (e.g. 1% convenience charge or ₱15 InstaPay fees) as explicit transaction costs.",
          "Perform a weekly 5-minute reconciliation to maintain 100% accurate net worth figures.",
        ],
      },
    ],
    faqs: [
      {
        question: "Is it safe to link my GCash or Maya account to budgeting apps?",
        answer:
          "Most cybersecurity and financial experts advise against sharing your login credentials or OTPs with third-party aggregators. Using file-based imports (CSV/PDF) or local ledger tracking gives you identical financial analytics with zero risk of unauthorized account access.",
      },
      {
        question: "How do I avoid double-counting transfers from BPI/BDO to GCash?",
        answer:
          "When moving money from your bank account to GCash via InstaPay or Cash-In, mark the transaction in your tracker as a 'Transfer between accounts' instead of an expense. Only record an expense when money actually leaves your wallet to pay a merchant or individual.",
      },
      {
        question: "Can I track cash payments alongside e-wallet transactions?",
        answer:
          "Yes. A unified privacy-first tracker allows you to create manual cash accounts alongside your GCash and Maya ledgers, giving you a consolidated view of your cashflow in Philippine Pesos (PHP).",
      },
    ],
  },
  {
    slug: "cancel-subscriptions-auto-debits-philippines",
    title: "How to Cancel Sneaky Subscriptions and Auto-Debits in the Philippines",
    seoTitle: "How to Cancel Auto-Debits & Subscriptions in the Philippines (GCash, Maya, Cards)",
    description:
      "A comprehensive guide to finding, revoking, and stopping recurring charges, AutoPay authorisations, virtual card debits, and hidden app renewals in the Philippines.",
    category: "subscriptions",
    readTimeMinutes: 8,
    publishedDate: "2026-02-01",
    updatedDate: "2026-08-25",
    author: "Zoption Personal Finance Team",
    keywords: [
      "cancel gcash autopay",
      "stop recurring payments maya",
      "cancel subscriptions philippines",
      "how to cancel apple subscription gcash",
      "google play auto debit cancel philippines",
      "stop credit card recurring payment bdo bpi",
    ],
    sections: [
      {
        id: "the-rise-of-stealth-subscriptions",
        title: "The Rise of Stealth Subscriptions & Recurring Merchant Debits",
        content:
          "From international streaming services (Netflix, Spotify, Disney+) to cloud storage (Google One, iCloud) and delivery memberships (GrabUnlimited, Foodpanda pandapro), recurring digital debits have quietly become one of the largest budget leaks for Filipino consumers. Many sign up during promotional free trials using GCash AutoPay or Maya Virtual Cards, only for recurring charges to silently renew without real-time confirmation notifications.",
        keyTakeaways: [
          "Free trials automatically convert to full-price recurring subscriptions unless revoked 24 to 48 hours prior to renewal.",
          "Merchant auto-debits deduct funds immediately upon wallet cash-in if your balance was previously empty.",
          "Tracking recurring schedules proactively protects against unwanted renewals.",
        ],
      },
      {
        id: "how-to-cancel-gcash-autopay",
        title: "Step-by-Step: Revoking GCash AutoPay & Linked Merchants",
        content:
          "To stop automatic deductions from your GCash wallet: Open the GCash app, navigate to 'Profile' at the bottom right, tap 'Settings', then select 'Linked Accounts' or 'AutoPay'. Here, you will see all active merchant billing authorizations (e.g. Google Play, Apple Services, Spotify, Alipay merchants). Tap the specific merchant and select 'Unlink' or 'Cancel AutoPay'. Confirm the cancellation to revoke future direct-debit rights.",
        keyTakeaways: [
          "Path: Profile > Settings > Linked Accounts > Select Merchant > Unlink Account.",
          "Revoke at least 24 hours prior to billing to prevent pre-authorized deduction queues.",
          "Unlinking from GCash terminates the billing authorization even if you cannot log into the merchant website.",
        ],
      },
      {
        id: "managing-maya-virtual-cards",
        title: "Controlling Maya Subscriptions & Virtual Card Debits",
        content:
          "Maya users frequently use the Maya Virtual Visa/Mastercard for online subscriptions. If a stubborn merchant continues attempting charges, you can navigate to the 'Cards' tab in the Maya app, view your active virtual card, and temporarily freeze it or regenerate the CVV / 16-digit card number. Additionally, check 'Settings' > 'Manage Recurring Payments' to revoke active merchant tokens directly.",
        keyTakeaways: [
          "Use the Maya Card Freeze feature to immediately stop any unauthorized or pending charges.",
          "Regenerate your Maya Virtual Card number if a foreign subscription refuses cancellation.",
          "Audit authorized merchants inside Maya Profile Settings periodically.",
        ],
      },
      {
        id: "app-store-ecosystem-cancellations",
        title: "Cancelling iOS App Store & Google Play Subscriptions",
        content:
          "If your subscription was purchased through an mobile ecosystem: On iOS, open Settings > Tap your Apple ID profile at the top > Subscriptions > Select the service > Tap 'Cancel Subscription'. On Android, open the Google Play Store > Tap your profile avatar > 'Payments & subscriptions' > 'Subscriptions' > Select the item > Tap 'Cancel subscription'. Always complete this step in addition to unlinking payment methods.",
        keyTakeaways: [
          "Apple ID and Google Play require cancellation through their respective operating system settings.",
          "Deleting an app from your phone does NOT cancel its recurring monthly billing cycle.",
          "Cancelling before the cutoff allows you to use the remaining paid duration without being charged again.",
        ],
      },
    ],
    faqs: [
      {
        question: "Does uninstalling an app cancel my subscription in GCash or Maya?",
        answer:
          "No. Uninstalling or deleting an application does not terminate its billing agreement. You must cancel the subscription inside the App Store, Google Play Store, or revoke the authorization inside your GCash/Maya linked accounts.",
      },
      {
        question: "What happens if GCash has no balance when an auto-debit triggers?",
        answer:
          "The transaction will fail due to insufficient funds. However, some merchants will retry automatically every 24 to 72 hours, meaning any subsequent cash-in into your GCash wallet may be immediately deducted unless you cancel the AutoPay authorization.",
      },
      {
        question: "Can I get a refund for an accidental recurring renewal?",
        answer:
          "For Apple App Store purchases, visit reportaproblem.apple.com to request a refund. For Google Play, submit a refund request within 48 hours via play.google.com. For direct merchant billing, you must contact customer support directly.",
      },
    ],
  },
  {
    slug: "high-yield-digital-banking-cashflow-guide",
    title: "High-Yield Digital Banking & Cashflow Forecasting Guide (2026)",
    seoTitle: "High-Yield Digital Banking & Cashflow Forecasting in the Philippines (2026)",
    description:
      "Maximize daily and monthly interest with Philippine digital banks like Seabank, Maya Bank, CIMB, GoTyme, and Tonik while forecasting your cashflow and liquidity needs.",
    category: "banking",
    readTimeMinutes: 9,
    publishedDate: "2026-03-01",
    updatedDate: "2026-08-28",
    author: "Zoption Personal Finance Team",
    keywords: [
      "philippine digital banks interest rates 2026",
      "seabank interest calculation",
      "maya bank high yield savings",
      "gotyme cashflow forecasting",
      "pdic insurance digital banks",
      "daily compounding interest philippines",
      "withholding tax on bank interest philippines",
    ],
    sections: [
      {
        id: "landscape-philippine-digital-banking",
        title: "The Philippine Digital Banking Landscape in 2026",
        content:
          "Digital banks regulated by the Bangko Sentral ng Pilipinas (BSP) have revolutionized personal savings in the Philippines by offering interest rates ranging between 3.5% and 8.0% p.a., compared to traditional banks offering 0.05% to 0.125%. Leading institutions include Seabank (daily interest crediting), Maya Bank (mission-based boosted rates up to 10-14% p.a.), GoTyme Bank (GoSave goal vaults with free transfers), CIMB Bank (GSave and UpSave accounts), and Tonik Bank (high-yield Stashes and Time Deposits). All BSP-licensed digital banks are insured by the Philippine Deposit Insurance Corporation (PDIC) up to ₱500,000 per depositor.",
        keyTakeaways: [
          "Digital bank interest rates significantly outperform traditional brick-and-mortar savings accounts.",
          "Deposits are PDIC-insured up to ₱500,000 across separate banking institutions.",
          "Daily interest crediting enables rapid compound growth on emergency funds and short-term liquidity.",
        ],
      },
      {
        id: "calculating-net-interest-and-taxes",
        title: "Calculating Gross vs. Net Yields & 20% Final Withholding Tax",
        content:
          "In the Philippines, interest income earned from peso bank deposits is subject to a statutory 20% Final Withholding Tax (FWT) deducted automatically by the bank before crediting. To calculate your exact earnings: Daily Net Interest = (Account Balance × Annual Interest Rate ÷ 365) × (1 - 0.20). For example, a ₱100,000 emergency fund earning 4.5% gross annual interest produces approximately ₱12.33 gross per day, resulting in ₱9.86 net daily crediting directly into your balance.",
        keyTakeaways: [
          "Always calculate net yields by subtracting the 20% Final Withholding Tax.",
          "Daily compounding interest slightly increases effective annual yield (APY) over simple monthly interest.",
          "Maintain clear tracking of net earnings across each individual high-yield vault.",
        ],
      },
      {
        id: "cashflow-forecasting-and-stashes",
        title: "Cashflow Forecasting: Balancing High Yield with Liquidity",
        content:
          "High yields should never compromise your ability to meet upcoming debt obligations, credit card cutoffs, and utility deadlines. Cashflow forecasting involves projecting your liquid cash reserves 30 to 90 days into the future. By maintaining high-yield emergency funds in flexible accounts (like Seabank or GoTyme GoSave) and allocating scheduled bills to dedicated digital stashes, you earn maximum daily interest right up until the day payment is disbursed.",
        keyTakeaways: [
          "Forecast liquidity 30 to 90 days forward to prevent premature withdrawals or overdraft penalties.",
          "Use sub-accounts or goal vaults (stashes) to partition funds for upcoming annual insurance, tuition, or travel.",
          "Time your fund transfers to clear before InstaPay / PESONet cutoff windows.",
        ],
      },
      {
        id: "multi-bank-optimization-strategy",
        title: "The Multi-Bank Optimization Playbook",
        content:
          "An optimal personal finance setup distributes funds strategically: 1) Daily operational cash in GCash/Maya for merchant payments; 2) 3-to-6 months emergency fund distributed across Seabank and GoTyme up to the PDIC limit; 3) Short-term goal savings in high-rate time deposits (e.g. Tonik or Maya boosted savings); 4) Traditional bank account (BPI, BDO, UnionBank) for payroll and proof-of-income documentation when applying for visas or home mortgages.",
        keyTakeaways: [
          "Keep deposits per institution under ₱500,000 for 100% PDIC insurance coverage.",
          "Maintain at least one traditional bank account for formal financial history and visa statements.",
          "Automate weekly or monthly savings transfers to compound digital bank gains effortlessly.",
        ],
      },
    ],
    faqs: [
      {
        question: "Are digital banks safe and regulated in the Philippines?",
        answer:
          "Yes. Digital banks operating in the Philippines hold official Digital Banking licenses from the Bangko Sentral ng Pilipinas (BSP) and are members of the Philippine Deposit Insurance Corporation (PDIC), insuring eligible deposits up to ₱500,000 per depositor.",
      },
      {
        question: "How does 20% withholding tax affect my daily interest?",
        answer:
          "The bank automatically withholds 20% of your gross interest earnings as required by the National Internal Revenue Code (NIRC). The credited amount you see in your transaction history is already your net interest.",
      },
      {
        question: "Can I transfer money freely between digital banks?",
        answer:
          "Yes. Digital banks utilize InstaPay (instant up to ₱50,000 per transaction) and PESONet (same-day batch clearing for larger amounts). Several digital banks offer free weekly InstaPay transfers.",
      },
    ],
  },
  {
    slug: "replace-excel-spreadsheets-budget-tracker",
    title: "The Complete Guide to Escaping Manual Excel Spreadsheets for Budgeting",
    seoTitle: "Why and How to Replace Excel Spreadsheets with Modern Budget Trackers",
    description:
      "Discover the limitations of manual Excel spreadsheets for personal finance and how switching to a dedicated local-first budget tracker saves hours of manual entry.",
    category: "tools",
    readTimeMinutes: 7,
    publishedDate: "2026-03-15",
    updatedDate: "2026-08-30",
    author: "Zoption Personal Finance Team",
    keywords: [
      "excel budget template vs app",
      "replace excel budget tracker",
      "google sheets personal finance alternatives",
      "automated personal finance tool",
      "local first finance spreadsheet alternative",
      "budgeting without broken formulas",
    ],
    sections: [
      {
        id: "the-hidden-cost-of-spreadsheet-budgeting",
        title: "The Hidden Friction of Manual Excel & Google Sheets Budgeting",
        content:
          "Millions of finance-conscious individuals start their budgeting journey with a customized Microsoft Excel or Google Sheets workbook. While spreadsheets offer total customization, they suffer from critical drawbacks: cumbersome mobile entry, fragile formulas prone to accidental corruption, lack of automated recurring subscription tracking, and hours spent manually copy-pasting numbers each month. Over time, spreadsheet maintenance fatigue leads most people to abandon budgeting entirely.",
        keyTakeaways: [
          "Spreadsheets introduce excessive friction when recording transactions on mobile devices while on the go.",
          "Broken cell references and accidental formula overwrites create inaccurate financial reports.",
          "Manual spreadsheet upkeep takes hours each month that could be spent on strategic wealth planning.",
        ],
      },
      {
        id: "core-advantages-of-dedicated-trackers",
        title: "What Dedicated Budget Trackers Do Better Than Spreadsheets",
        content:
          "Dedicated personal finance platforms provide domain-specific features that generic grid software cannot match: automatic recurring subscription detection, cashflow forecasting engines, multi-currency ledger reconciliation, instant receipt parsing, and interactive visual analytics. More importantly, local-first finance applications store data on your own device with zero cloud lock-in, combining the ownership benefits of an Excel file with the automated intelligence of a native application.",
        keyTakeaways: [
          "Instant categorisation and recurring subscription schedules without complex nested VLOOKUP or SUMIFS formulas.",
          "Cashflow projection models that simulate future account balances based on historical cadence.",
          "Full data ownership and exportability without the maintenance headaches of raw grid sheets.",
        ],
      },
      {
        id: "migration-plan-excel-to-tracker",
        title: "A Seamless 3-Step Migration Plan from Excel to a Modern Tracker",
        content:
          "Transitioning from an existing spreadsheet does not mean losing your historical records. Step 1: Export your historical transaction sheet as a standard CSV file with Date, Description, Amount, and Category columns. Step 2: Import the CSV into your new tracker using universal column mapping to populate past months. Step 3: Establish your recurring baseline by setting up known monthly bills, subscriptions, and income schedules to enable automated forward-looking cashflow forecasting.",
        keyTakeaways: [
          "Step 1: Export clean historical data from your existing spreadsheet as CSV.",
          "Step 2: Use column-mapping presets to import years of transaction history in seconds.",
          "Step 3: Define recurring subscriptions and income cadences to activate automated forecasting.",
        ],
      },
      {
        id: "maintaining-the-habit",
        title: "Building a Sustainable, Friction-Free Budgeting Habit",
        content:
          "The best financial system is the one you actually use consistently. By eliminating manual cell formatting and formula debugging, you can reduce your financial management routine to a quick 2-minute daily check-in or a weekly 10-minute review. Focus your energy on high-leverage decisions—such as increasing your savings rate, eliminating unused subscriptions, and optimizing high-yield interest—rather than fixing spreadsheet syntax errors.",
        keyTakeaways: [
          "Switching from manual data entry to smart imports reduces weekly budgeting time by over 80%.",
          "Focus on actionable financial decisions rather than debugging spreadsheet formulas.",
          "Enjoy complete privacy and local-first data security without sacrificing modern automation.",
        ],
      },
    ],
    faqs: [
      {
        question: "Can I still export my financial data to CSV or Excel if needed?",
        answer:
          "Yes. High-quality personal finance tools provide full data export in CSV and JSON formats, ensuring you never experience platform lock-in and can still perform custom analysis in Excel whenever you wish.",
      },
      {
        question: "How difficult is it to migrate my historical data from Google Sheets?",
        answer:
          "It takes only a few minutes. Save your Google Sheets tab as a CSV file, then use the import tool to map your columns (Date, Payee/Description, Category, Amount). The platform will ingest your historical entries seamlessly.",
      },
      {
        question: "Why is a local-first budget tracker better than cloud-only budgeting apps?",
        answer:
          "Local-first trackers store your sensitive financial records directly on your local device or encrypted storage, ensuring complete privacy, zero downtime, fast performance without internet dependency, and total protection against third-party server breaches.",
      },
    ],
  },
];

export function getAllFinanceGuides(): FinanceGuide[] {
  return FINANCE_GUIDES;
}

export function getFinanceGuideBySlug(slug: string): FinanceGuide | null {
  if (!slug || typeof slug !== "string") {
    return null;
  }
  const normalized = slug.trim().toLowerCase();
  return FINANCE_GUIDES.find((guide) => guide.slug.toLowerCase() === normalized) ?? null;
}
