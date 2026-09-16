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

/** A related tool or page a guide sends the reader to, rendered as a card. */
export interface FinanceGuideRelatedLink {
  to: string;
  label: string;
  description: string;
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
  relatedLinks?: FinanceGuideRelatedLink[];
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
  {
    slug: "budget-monthly-salary-philippines",
    title: "How to Budget a Monthly Salary in the Philippines",
    seoTitle: "How to Budget a Monthly Salary in the Philippines (Peso Plan)",
    description:
      "A step by step way to plan a Philippine salary in pesos: start from take home pay, list fixed bills first, move savings on payday, and review the month against real spending.",
    category: "budgeting",
    readTimeMinutes: 8,
    publishedDate: "2026-09-16",
    updatedDate: "2026-09-16",
    author: "Zoption Personal Finance Team",
    keywords: [
      "how to budget salary philippines",
      "monthly budget philippines pesos",
      "take home pay budget",
      "payday budget plan",
      "budgeting on a 30000 salary",
      "philippine household budget example",
    ],
    sections: [
      {
        id: "budget-from-take-home-pay",
        title: "Start From the Money That Actually Lands",
        content:
          "Build the plan on take home pay, the amount that reaches your account after SSS, PhilHealth, Pag-IBIG, and withholding tax. Contribution rates and tax brackets change, so read the figures on your latest payslip instead of a rate table you found online: the payslip is the only version that matches your salary. Zoption stores amounts in pesos and centavos, so the number you plan with is the number that lands, with no rounding drift by the end of the month.",
        keyTakeaways: [
          "Budget from take home pay, not gross salary.",
          "Take statutory contributions from your payslip, because rates change.",
          "Amounts are kept in whole centavos, so totals stay exact.",
        ],
      },
      {
        id: "list-fixed-bills-first",
        title: "List Fixed Bills Before Anything Else",
        content:
          "Fixed bills arrive whether or not you think about them: rent or amortization, electricity, water, internet, phone load, transport to work, loan payments, and the subscriptions you still use. Add them up first. Whatever is left is the money you actually get to decide on. Zoption gives each bill its own category with a monthly limit, so the fixed side of the month is visible before payday arrives.",
        keyTakeaways: [
          "Add every recurring bill before you plan any spending.",
          "What remains after fixed bills is the real flexible amount.",
        ],
      },
      {
        id: "worked-example-thirty-thousand",
        title: "A Worked Example on ₱30,000 Take Home",
        content:
          "Say ₱30,000 lands each month. Fixed bills come to ₱13,000: ₱8,000 rent, ₱2,500 electricity and water, ₱1,500 internet and load, and ₱1,000 transport to work. Savings takes ₱6,000, which is 20 percent. That leaves ₱11,000 for groceries, dining, and everything else, and it is the number to watch through the month. When an emergency lands in the flexible part, move money between categories on purpose instead of quietly spending the savings.",
        keyTakeaways: [
          "Fixed ₱13,000, savings ₱6,000, flexible ₱11,000 on a ₱30,000 take home.",
          "Move money between categories deliberately rather than borrowing from savings.",
        ],
      },
      {
        id: "move-savings-on-payday",
        title: "Move Savings Out on Payday",
        content:
          "Treat savings like a bill with a due date. On payday, move the savings amount to a separate account or into a goal, then spend what remains. A goal in Zoption holds a target amount and a target date, and the dashboard reports a savings rate for the month, so you can see whether the plan survived contact with real life. If a full month of expenses feels too far away, start with one month of fixed bills as the emergency fund.",
        keyTakeaways: [
          "Move savings on payday, before flexible spending starts.",
          "A goal with a target amount and date keeps the number concrete.",
        ],
      },
      {
        id: "irregular-income-and-extra-pay",
        title: "Handle Irregular Pay, Bonuses, and the 13th Month",
        content:
          "If your income changes month to month, budget from your lowest recent month and treat anything above it as savings rather than as a permanent raise in your baseline. The 13th month pay, bonuses, and refunds should not quietly raise your monthly spending: record them as income in the month they arrive, then move them to a goal or a debt. Zoption reports income and expenses separately, so a one off deposit does not make a hard month look healthy.",
        keyTakeaways: [
          "Plan the baseline on your lowest recent month.",
          "Send bonuses and the 13th month to a goal or a debt, not to the baseline.",
        ],
      },
      {
        id: "review-the-month",
        title: "Review the Month in Ten Minutes",
        content:
          "At the end of the month, compare the plan with what happened: spending per category against each budget, the six month trend, and the recurring expenses the app has spotted. If you track a bank account or a wallet like GCash or Maya, download the CSV the app lets you export and import it instead of typing rows. On the web app a file can be CSV, XLSX, or XLS, and the Android app also reads PDF statements. The preview shows every row before anything is saved, and duplicate entries are blocked.",
        keyTakeaways: [
          "Compare planned against actual per category, then look at the six month trend.",
          "Import a CSV export instead of typing rows, and check the preview before saving.",
        ],
      },
    ],
    faqs: [
      {
        question: "Should I budget from my gross salary or my take home pay?",
        answer:
          "Use take home pay. Gross salary is what you earn before SSS, PhilHealth, Pag-IBIG, and withholding tax, and none of that money reaches your account. Your payslip carries the exact figures for your salary, which is more reliable than any rate table, because contribution schedules and tax brackets change.",
      },
      {
        question: "How much of my salary should go to savings?",
        answer:
          "There is no single number that fits every household. Twenty percent of take home pay is a common starting point, and it is the savings share in the 50/30/20 rule. A month with a large rent or family support can start lower. Pick an amount you can hold for three months, then raise it once the habit is steady.",
      },
      {
        question: "What if I get paid twice a month?",
        answer:
          "Plan the whole month as one budget and split it by payday. Put the bills that fall before the 15th against the first pay, and the rest against the second, then divide the flexible money between the two. Zoption budgets by month rather than by payday, so the plan stays in one place.",
      },
    ],
  },
  {
    slug: "50-30-20-rule-pesos",
    title: "The 50/30/20 Rule in Pesos",
    seoTitle: "The 50/30/20 Rule in Pesos: Philippine Budget Examples",
    description:
      "What the 50/30/20 rule means for a Philippine salary, which expenses count as needs, three worked examples in pesos, and what to change when rent or debt breaks the split.",
    category: "budgeting",
    readTimeMinutes: 6,
    publishedDate: "2026-09-16",
    updatedDate: "2026-09-16",
    author: "Zoption Personal Finance Team",
    keywords: [
      "50 30 20 rule philippines",
      "50 30 20 budget pesos",
      "needs wants savings philippines",
      "budget percentages salary",
      "philippine budget example 30000",
      "how to split salary philippines",
    ],
    sections: [
      {
        id: "what-the-rule-splits",
        title: "What the 50/30/20 Rule Splits",
        content:
          "The rule divides take home pay into three buckets: 50 percent for needs, 30 percent for wants, and 20 percent for savings and extra debt payments. Needs keep the month running: rent or amortization, electricity, water, groceries, transport to work, medicine, and minimum debt payments. Wants are the parts you choose, such as dining out, streaming, travel, and upgrades. Savings covers the emergency fund, investments, and any amount you pay above a minimum on a debt.",
        keyTakeaways: [
          "Half to needs, a third to wants, a fifth to savings.",
          "The split is based on take home pay, not gross salary.",
        ],
      },
      {
        id: "what-counts-in-the-philippines",
        title: "What Counts in a Philippine Budget",
        content:
          "Some lines are easy to place and some are not. SSS, PhilHealth, and Pag-IBIG are usually already deducted from take home pay, so they do not appear again; if you pay them yourself, they belong in needs. Supporting family is a need when it is a standing commitment. A loan payment is a need up to the minimum, and anything above the minimum counts as savings. A subscription you forgot about is still a want, which is why the renewal calendar on the subscriptions page is worth a look once a month.",
        keyTakeaways: [
          "Standing family support and minimum loan payments sit in needs.",
          "Paying above a minimum turns the extra into savings.",
        ],
      },
      {
        id: "worked-examples-in-pesos",
        title: "Worked Examples in Pesos",
        content:
          "The split is simple arithmetic. On ₱18,000 take home: ₱9,000 needs, ₱5,400 wants, ₱3,600 savings. On ₱30,000: ₱15,000, ₱9,000, and ₱6,000. On ₱60,000: ₱30,000, ₱18,000, and ₱12,000. The 50/30/20 calculator on this site does the same split in exact centavos using the largest remainder method, so the three buckets always add up to the income you entered, with no lost centavo.",
        keyTakeaways: [
          "₱18,000 splits into ₱9,000, ₱5,400, and ₱3,600.",
          "₱30,000 splits into ₱15,000, ₱9,000, and ₱6,000.",
          "The calculator keeps the three buckets equal to the income, to the centavo.",
        ],
      },
      {
        id: "when-the-rule-does-not-fit",
        title: "When 50/30/20 Does Not Fit",
        content:
          "The rule is a starting point, not a law. Rent in Metro Manila can push needs past 50 percent, and a month with a hospital bill can push savings below 20. When that happens, change the percentages on purpose: 60/20/20 keeps savings in the plan while needs take the larger share, and 50/20/30 pays down debt faster. What matters is that the three numbers still add up and that the savings share is not the one that quietly disappears.",
        keyTakeaways: [
          "Adjust the percentages to fit real rent, debt, or family support.",
          "Keep the savings share visible instead of letting it absorb every surprise.",
        ],
      },
      {
        id: "turn-the-split-into-a-budget",
        title: "Turn the Split Into a Real Budget",
        content:
          "A percentage only becomes a budget once the money has categories. Create a category for each fixed bill and each regular spend, set a monthly limit so the buckets add up, then check the difference between the limit and what you really spent. Zoption shows budget progress per category, a six month trend, and a savings rate for the month, and it never asks for a bank login, so the plan stays yours.",
        keyTakeaways: [
          "Give every bucket real categories with monthly limits.",
          "Review the difference between the limit and actual spending each month.",
        ],
      },
    ],
    relatedLinks: [
      {
        to: "/tools/50-30-20-calculator",
        label: "50/30/20 Calculator for Philippine Pesos",
        description:
          "Split a take home amount into needs, wants, and savings in exact centavos, with the percentages adjustable and no sign up.",
      },
    ],
    faqs: [
      {
        question: "Is the 50/30/20 rule based on gross or take home pay?",
        answer:
          "Take home pay. The rule describes where your spendable income goes, and gross salary includes contributions and tax that never reach your account. Use the amount that lands in your bank or wallet, then split that.",
      },
      {
        question: "Can I follow 50/30/20 while paying off debt?",
        answer:
          "Yes. Minimum payments belong in needs, and anything you pay above the minimum counts as savings, because it improves your net position. If the debt is high interest, many people move the savings share to extra payments first and rebuild the emergency fund after.",
      },
      {
        question: "Does the calculator store the numbers I type?",
        answer:
          "No. The 50/30/20 calculator runs entirely in your browser with no account and no network call, and nothing you enter is sent anywhere.",
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
