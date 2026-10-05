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
  releasedOn: "October 5, 2026",
  changes: [
    {
      title: "Ask the assistant to manage categories, budgets, and transactions",
      description:
        "Ask the AI Assistant to add, rename, or archive a category, set a monthly category budget, or edit or delete a transaction you already recorded. Each change shows on a card and happens only after you tap Confirm.",
    },
    {
      title: "Ask the assistant how to do something",
      description:
        "Ask how to import a statement or set a budget, and the assistant answers with the page and control to use, the same guidance as Help & contact.",
    },
    {
      title: "A Calendar tab on Android and iOS",
      description:
        "Transactions has a Calendar tab with a compact month grid of each day's income and expenses. Tap a day to see its transactions below.",
    },
    {
      title: "A Home view dropdown with Remittance on mobile",
      description:
        "The Home title is now a dropdown. Pick Remittance to open the remittance calculator on its own. The Overview / Analytics switch sits centered at the top, and Safe to spend shows below Total Balance.",
    },
    {
      title: "A cleaner Goals page on mobile",
      description:
        "Goals has a proper title, a single add button, a saved-so-far summary, and the amount left on each goal. Spacing is tighter across the app, so more fits on each screen, and the new transaction voice card is simpler.",
    },
    {
      title: "Fixes",
      description:
        'A new account with no balance or budget no longer says "You\'ve used up what\'s safe to spend"; it asks you to add a balance or first transaction. The web dashboard no longer shows the Safe to spend tile twice.',
    },
    {
      title: "Android Beta 0.2.46",
      description:
        "The official Android Beta carries the Calendar tab, the Home view dropdown, the refreshed Goals page, and the assistant's new abilities.",
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
    version: "3.4.0",
    releasedOn: "October 3, 2026",
    changes: [
      {
        title: "More currencies",
        description:
          "Track money in 47 common currencies instead of only Philippine Peso and US Dollar, including EUR, GBP, JPY, CNY, KRW, SGD, AUD, CAD, INR, AED, SAR, and KWD. Pick one as your workspace currency and give each account its own. Balances, income, expenses, transfer fees, and subscription totals list every currency you use, and the cashflow chart converts them into your workspace currency with daily exchange rates. Imports, voice entries, and receipt scans use your workspace currency, and budgets count only spending in it.",
      },
      {
        title: "More account types, free for everyone",
        description:
          "Add General, Cash, Bank / debit card, Savings, Credit card, Virtual account, Investment, Owes me / Receivables, and I owe / Payables accounts. Adding, renaming, and removing accounts is now free on every plan with no limit; automatic interest on savings accounts is still Pro.",
      },
      {
        title: "Pay a debt from an account",
        description:
          "A transfer into a credit card or I owe / Payables account counts as a debt payment and can be linked to a debt in Goals & debt, whose balance drops by the amount that reached the account. On mobile, choosing the Debt payment category or such a transfer asks which debt it pays. Editing or deleting the transfer gives the amount back.",
      },
      {
        title: "The assistant can make changes for you",
        description:
          "Ask the AI Assistant to add, edit, cancel, or delete a subscription, savings goal, or debt, or to add, rename, or archive an account or set its balance. It shows what it will do on a card and changes nothing until you tap Confirm.",
      },
      {
        title: "A pet companion on mobile",
        description:
          "Signed-in users on Android and iOS can pick one of six eggs and open Zoption seven days in a row to hatch it. It earns points when you use the app, on the web too, and grows from Baby to Monster. Left alone it gets sick and eventually passes away, and notifications warn you first, never between 10 PM and 7 AM. Turn it off under More → Preferences → Pet companion.",
      },
      {
        title: "Pick several goals and be thanked for answering",
        description:
          "The setup goal question lets you pick every goal that applies, with the first as your main focus, and thanks you once you answer. On mobile it also asks for your currency and cash on hand the first time you open the app. You can change goals in Account Settings.",
      },
      {
        title: "Thank-you cards",
        description:
          "A thank-you card appears when you create your account and when your Zoption Pro purchase is confirmed, on the web and in the Android and iOS app.",
      },
      {
        title: "Unlock with biometrics on mobile",
        description:
          'After you set a PIN, turn on "Unlock with biometrics" under More → Account to unlock with your fingerprint, face, or iris. Your PIN still works, and Zoption never receives your biometric data.',
      },
      {
        title: "Fixes",
        description:
          "Starting cash you enter during mobile setup no longer counts as income in Transactions totals. The goal choices in Account Settings are compact rows again, and settings row titles on mobile no longer wrap beside long values.",
      },
      {
        title: "Android Beta 0.2.45",
        description:
          "The official Android Beta carries the pet companion, more currencies and account types, debt payments from accounts, assistant changes with confirmation, biometric unlock, and the new setup questions.",
      },
    ],
  },
  {
    version: "3.3.0",
    releasedOn: "October 3, 2026",
    changes: [
      {
        title: "Use Zoption on mobile without an account",
        description:
          'On the Android and iOS welcome screen, choose "Continue without an account" to track transactions, budgets, goals, debts, subscriptions, and your calendar on your phone. The AI Assistant, receipt scanning, voice entry, bank-file import, and Plan and billing need an account, and tapping one shows what an account adds, including backup and sync and a 7-day Pro trial. Data you enter without an account stays on this device and does not move into an account when you sign in.',
      },
      {
        title: "Tell us what brings you to Zoption",
        description:
          "Setup on the web and in the Android and iOS app now asks what you want from Zoption, such as tracking spending, budgeting, saving, or paying off debt. You can skip it and change it later in Account Settings on the web or under More → Preferences → Your goal on mobile. Your answer sets the first action on an empty dashboard or Home screen, a short getting-started checklist on the web, and the assistant's first suggested question. Existing web accounts are not asked during setup.",
      },
      {
        title: "Alerts when you overspend",
        description:
          'The Safe to spend card on the web dashboard and the Android and iOS Home screen warns you when nothing is left to spend safely this week, or when the 30-day forecast shows your balance going below zero, with the date. On Android and iOS it also arrives as a notification, once per week and once per deficit date, if you have allowed notifications. Over-limit categories on Budgets and on shared budget links turn red and say "Over by".',
      },
      {
        title: "Safe to spend on the web dashboard",
        description:
          'The dashboard\'s Cash flow forecast card is now Safe to spend, showing what is safe to spend this week as on mobile, and it still opens the forecast. On mobile, the "days left · bills counted" line under the amount is gone.',
      },
      {
        title: "A cleaner Home screen on Android and iOS",
        description:
          "Home now shows only your Total Balance. Tap it to open Account Management, also under More → Accounts & categories. A switch at the top splits Home into Overview (balances, recent activity) and Analytics (this month, the cash flow chart, spending by category, budget, and the forecast).",
      },
      {
        title: "Select and delete several at once on mobile",
        description:
          "Press and hold a transaction or an assistant conversation to start select mode, pick several, and delete them in one step. Holding a conversation no longer opens a single-delete prompt.",
      },
      {
        title: "Sound effects on mobile",
        description:
          "Short sounds play for taps, saved transactions, and errors. Turn them off under More → Preferences → Sound effects.",
      },
      {
        title: "Clearer plan limit pop-ups",
        description:
          'Hitting a free plan limit on the web (custom categories, or Pro-only actions such as exporting transactions or managing accounts) or on mobile (the assistant, imports, or a custom category or account change refused during sync) opens a "Plan limit reached" pop-up with a link to Plan and billing.',
      },
      {
        title: "Add a transaction without leaving the dashboard",
        description:
          "On the web dashboard, Add transaction opens the form over the page instead of switching to Transactions, so you can add one and keep watching your balances.",
      },
      {
        title: "A calmer, easier-to-read web app",
        description:
          "No text is smaller than 11px, cards sit flat instead of floating with heavy shadows, and the glass blur and glow effects are gone. The current page in the sidebar and tab bar uses one clear brand highlight. Category emojis sit on a soft tile tinted with the category colour. Sign-in, sign-up, password, and setup screens use a flat panel with larger labels, fill the screen on phones, and no longer make iOS zoom in when you tap a field.",
      },
      {
        title: "Smaller fixes on the web",
        description:
          "Arrow keys on the setup goal step only move the selection, and you confirm with the button. Back and Confirm share the setup row. The calendar no longer draws a double line on its left edge, and its phone day markers use readable colours. The assistant's Memory button stays on screen on phones.",
      },
      {
        title: "New budgeting guides",
        description:
          "zoption.site has three new guides: how to budget for beginners, how to budget an allowance, and how to save money in the Philippines.",
      },
      {
        title: "Android Beta 0.2.44",
        description:
          "The official Android Beta carries use without an account, the goal question, overspending notifications, the new Home screen, select mode, sound effects, and plan limit pop-ups.",
      },
    ],
  },
  {
    version: "3.1.0",
    releasedOn: "October 1, 2026",
    changes: [
      {
        title: "Log a transaction by chatting with the assistant",
        description:
          'Tell the assistant what you spent or where you went ("I spent 250 at Jollibee", "300 na lang natira sa GCash ko") and it drafts the transaction with a suggested category, account, and usual amount. If you only know what is left in an account, it works out the amount. Nothing is saved until you tap Save transaction. Because the assistant can now prepare drafts, you are asked to accept the updated assistant consent once before your next chat.',
      },
      {
        title: "Log several entries from the Android mic widget",
        description:
          'Say "I spent 250 on Jollibee for lunch and 2,000 on groceries" and Zoption AI saves each as its own entry, up to 10 per note, without opening the app. A notification tells you how many were logged. Entries sync the next time Zoption opens.',
      },
      {
        title: "A new look for the Android mic widget",
        description:
          'The mic widget is now a bordered card with a brand mic circle that follows your phone\'s light or dark theme. Stretch it wider to see the Zoption title and a "Tap and say what you spent" hint.',
      },
      {
        title: "A clearer Home screen on Android and iOS",
        description:
          "Home leads with a large safe-to-spend card and makes Add the main shortcut. Empty budget, category, and cash-flow cards fold away, categories show their emoji on a tinted badge everywhere, and the welcome screen is a single-screen landing.",
      },
      {
        title: "Start a fresh assistant conversation",
        description:
          "Opening the AI assistant on mobile starts a new conversation. Past conversations are one tap away with the back arrow.",
      },
      {
        title: "Money in and out opens monthly for Pro",
        description:
          "The web dashboard's money in and out chart now opens on the monthly view for Pro, and the monthly view shows the past 30 days ending today, so it is never empty on the 1st of the month.",
      },
      {
        title: "Daily reminder on by default on Android and iOS",
        description:
          "Zoption now reminds you at 12:00 PM and 9:00 PM. One switch under More → Preferences → Daily reminder turns it off.",
      },
      {
        title: "Assistant answers keep to your workspace currency",
        description:
          'Totals, category spending, budgets, and recurring charges count only your workspace currency and say when entries in the other currency were left out. "Show my recent transactions" works without a date range, and the biggest category is listed first.',
      },
      {
        title: "Smoother sign-in links and a steadier PIN pad",
        description:
          "Sign in and Start free on zoption.site open the app in a new tab. PIN digits you type are no longer lost when the screen refreshes.",
      },
      {
        title: "Android Beta 0.2.43",
        description:
          "The official Android Beta carries the redesigned mic widget with multi-entry logging, the new Home screen, a fresh assistant conversation on open, the default daily reminder, and the PIN fix.",
      },
    ],
  },
  {
    version: "3.0.0",
    releasedOn: "September 30, 2026",
    changes: [
      {
        title: "Your workspace moved to app.zoption.site",
        description:
          "The signed-in web app now lives at app.zoption.site, and zoption.site is the public site. Old links, bookmarks, and sign-in emails still work and forward to the app. Because the address changed, sign in once more on the web.",
      },
      {
        title: "Faster public pages",
        description:
          "Guides, pricing, the FAQ, the calculator, and the legal pages on zoption.site now load as plain pages without the full app, so they open noticeably faster on mobile data.",
      },
      {
        title: "A short setup for new workspaces",
        description:
          "A new account on the web now chooses its currency and enters the cash on hand before the dashboard opens. That amount becomes the Cash account's opening balance and is not counted as income on the web dashboard, cashflow trend, or calendar. Existing accounts are not asked.",
      },
      {
        title: "Checkout leads with Dodo Payments",
        description:
          "Pro checkout on the web and in the Android and iOS app offers Dodo Payments (card, Apple Pay, or Google Pay) first, with PayPal below it.",
      },
      {
        title: "Currency moved to Preferences on Android and iOS",
        description:
          "The Currency setting now sits under More → Preferences, beside Theme and Voice language, instead of inside the Account screen.",
      },
      {
        title: "Tidier account rows and settings menus",
        description:
          "Account rows on the web keep their icons lined up from row to row, and the settings dropdowns have a padded arrow.",
      },
      {
        title: "Android Beta 0.2.42",
        description:
          "The official Android Beta carries the Currency setting under Preferences and the Dodo Payments checkout, and budget share links created in the app open on app.zoption.site.",
      },
    ],
  },
  {
    version: "2.49.0",
    releasedOn: "September 29, 2026",
    changes: [
      {
        title: "Choose your workspace currency",
        description:
          "Account Settings has a Currency option (Philippine Peso or US Dollar) on the web, and the Android and iOS app follow it. Budgets, goals, debts, plans, and dashboard totals show in the chosen currency, and new accounts, transactions, and subscriptions start in it. Switching relabels amounts; it does not convert them. The remittance calculator follows it too.",
      },
      {
        title: "Subscriptions bill in their own currency",
        description:
          "Each subscription has its own currency, chosen in the subscription form. Its charges and renewals are recorded and checked against the account balance in that currency. Subscription totals, the cashflow forecast, and safe-to-spend count only plans in the workspace currency and say when a plan in the other currency is left out.",
      },
      {
        title: "Dollar accounts and renewal emails use the right currency",
        description:
          "Automatic interest on a US dollar savings account accrues and is credited in dollars, and subscription renewal emails show the subscription's own currency, kept as it was when the renewal was missed.",
      },
      {
        title: "Currency stays separate per person and per chart",
        description:
          "The Android and iOS cashflow chart counts only entries in the workspace currency instead of adding pesos and dollars together, and the app picks up a currency changed on the web. On a shared browser, one person's currency no longer carries over to the next person.",
      },
      {
        title: "Android Beta 0.2.40",
        description:
          "The official Android Beta carries the workspace currency setting, per-subscription currencies, and the currency fixes above.",
      },
    ],
  },
  {
    version: "2.48.0",
    releasedOn: "September 29, 2026",
    changes: [
      {
        title: "New transactions start on Uncategorized",
        description:
          "On the web and in the Android and iOS app, a new expense, income, or transfer starts on the Uncategorized category for its type instead of the first category in the list or Salary. Switching the type, or an AI voice draft whose category does not match, also falls back to Uncategorized.",
      },
      {
        title: "The default-account star stays on the card",
        description:
          "On Android, the star beside the default account on Home's balance card no longer gets pushed past the card's right edge.",
      },
      {
        title: "Android Beta 0.2.39",
        description:
          "The official Android Beta carries the Uncategorized default for new transactions and the balance card star fix.",
      },
    ],
  },
  {
    version: "2.47.0",
    releasedOn: "September 28, 2026",
    changes: [
      {
        title: "A daily reminder on Android and iOS",
        description:
          "Choose a time under More, then Preferences, then Daily reminder, and the app reminds you once a day to record that day's expenses and income. It is off until you pick a time, tapping it opens a new transaction, and signing out turns it off.",
      },
      {
        title: "A new Zoption logo",
        description:
          "A rounded Z on near-black whose last stroke ends in a mint budget bar now marks the web app, its browser and home-screen icons, and the Android and iOS app icon.",
      },
      {
        title: "Balances keep their minus sign",
        description:
          "Adjusting an overdrawn or credit account in the Android app now previews and notes the balance with its minus sign, and the mic widget accepts a negative target balance. Adjustments are dated on your local day, even just after midnight.",
      },
      {
        title: "Exact amounts in more places",
        description:
          "The debt payoff planner says when it cannot read an extra payment instead of guessing, the budget plan no longer flags an amount typed with commas as an unsaved change, and SMS Quick Paste passes on the amount exactly as shown.",
      },
      {
        title: "Imports update balances right away",
        description:
          "Account balances refresh as soon as an import finishes, and the spreadsheet import refreshes archived categories too, so nothing shows stale numbers until a reload.",
      },
      {
        title: "Budgets for removed categories",
        description:
          "In the Android and iOS app, a category whose budget you removed shows up again in Add budget, so you can give it a new limit. Home's balance card on Android also keeps each account's icon beside its name.",
      },
      {
        title: "Android Beta 0.2.38",
        description:
          "The official Android Beta carries the daily reminder, the new app icon, the budget and balance card fixes, and the balance adjustment and debt planner fixes.",
      },
    ],
  },
  {
    version: "2.46.0",
    releasedOn: "September 26, 2026",
    changes: [
      {
        title: "Try Zoption Pro free for 7 days",
        description:
          "Every workspace gets a 7-day Pro trial with no card or payment setup. New sign-ups start theirs right away and existing Free accounts get one now. Zoption emails you when it starts, the day before it ends, and when it has ended, then moves you to the Free plan without charging anything.",
      },
      {
        title: "Create a category while adding a transaction",
        description:
          "Choose + New category in the category picker on the web or in the app, enter a name and an optional emoji, and it is selected for the transaction without losing what you already typed.",
      },
      {
        title: "A 6-digit PIN for the Android app lock",
        description:
          "The app lock now uses a 6-digit PIN on a number pad instead of a password. If you set an app password before, enter it once after updating and then choose a PIN.",
      },
      {
        title: "Transactions grouped by day on the web",
        description:
          "Each day has a pinned header with its date and that day's income and expenses, and more transactions load as you scroll instead of on numbered pages.",
      },
      {
        title: "Itemized receipts, discounts included",
        description:
          "Receipt scanning lists each item it reads so you can correct, remove, or add items, and each becomes its own transaction. Discounts, including senior citizen and PWD discounts, are shared across the items so they still add up to the receipt total.",
      },
      {
        title: "A clearer Home screen on Android",
        description:
          "Home leads with Total Balance split across your accounts, then quick actions, safe to spend, this month, cash flow, spending, budgets, and recent activity. Theme and Voice language now fold under Preferences on the More tab.",
      },
      {
        title: "Quick Paste reads more SMS alerts",
        description:
          "GCash withdrawals, cash ins, and payment messages are recognised, and unfamiliar alerts take the merchant from the message instead of showing Unknown Merchant.",
      },
      {
        title: "A new loading animation",
        description:
          "Three ledger rows fill in turn while Zoption loads on the web and in the app. With reduced motion on, they stay still.",
      },
      {
        title: "Android Beta 0.2.37",
        description:
          "The official Android Beta carries the free Pro trial, the 6-digit PIN app lock, the new Home screen, itemized receipts, and creating categories from the picker.",
      },
    ],
  },
  {
    version: "2.45.0",
    releasedOn: "September 25, 2026",
    changes: [
      {
        title: "Choose a default spending account",
        description:
          "Tap the star beside an account on Home, or pick one under Account Settings on the web or More, then Account on Android, and new transactions start on it instead of Cash. It is picked first when you add a transaction, import an SMS, scan a receipt, or use the mic widget, and each browser and device keeps its own choice.",
      },
      {
        title: "Reactivating a subscription charges only what is due",
        description:
          "Turning a canceled subscription back on now charges the billing date already due, not every cycle missed while it was canceled. A subscription that could not renew names the billing date it missed instead of this month's date.",
      },
      {
        title: "Steadier Android help and budgets",
        description:
          "My reports under Help & support loads again, and a report you just sent no longer shows an error. Adding a budget asks you to choose its category instead of quietly starting on Debt payment, and a bug report draft now fills the whole panel so it is easier to review.",
      },
      {
        title: "A Sync delayed notice you can close",
        description:
          "The Sync delayed notice on Home and Transactions in the Android app has a close button. Your changes keep retrying in the background, and a different sync problem still shows a new notice.",
      },
      {
        title: "Two clear ways to pay for Pro on the web",
        description:
          "The upgrade dialog now offers two plain choices: continue with PayPal, or pay by card, Apple Pay, or Google Pay through Dodo Payments.",
      },
      {
        title: "New Philippine budgeting guides",
        description:
          "Three new guides cover budgeting a semi-monthly salary paid on the 15th and 30th, building an emergency fund in pesos, and planning your 13th month pay.",
      },
      {
        title: "Android Beta 0.2.36",
        description:
          "The official Android Beta carries the default spending account, the dismissible Sync delayed notice, the working My reports list, and the Add budget category choice.",
      },
    ],
  },
  {
    version: "2.44.0",
    releasedOn: "September 24, 2026",
    changes: [
      {
        title: "Pay for Zoption Pro with Dodo Payments",
        description:
          "The upgrade dialog on the web and Plan and billing on Android now offer Continue with Dodo Payments beside PayPal. It opens Dodo's secure checkout for the monthly or annual plan, Dodo Payments is the merchant of record for that purchase, and Pro starts once Zoption confirms the subscription. You can cancel renewal from Plan and billing and keep Pro until the end of the paid period.",
      },
      {
        title: "An optional app lock on Android",
        description:
          "Set an app password under More, then Account, and Zoption asks for it when the app opens or returns after more than a minute away. It works offline and applies only to that device; if you forget it, sign out from the lock screen and sign in again.",
      },
      {
        title: "Open offline without signing in again",
        description:
          "The Android app no longer shows the sign-in screen when it opens offline with a session older than about an hour. Your workspace opens, you can add transactions, and sync resumes by itself when you reconnect.",
      },
      {
        title: "Speak your income into the Android mic widget",
        description:
          'The home-screen mic widget now records money coming in as well as going out. Say something like "Received 20,000 salary to my GCash" or "Got paid 5k for freelance work" and Zoption opens an income review with the account and category you named. Amounts no longer need "pesos" after them, a note about yesterday is dated yesterday, and an Expense and Income switch fixes a misheard note before you save.',
      },
      {
        title: "A new look on the web and in the app",
        description:
          "Zoption has a cooler, calmer palette in Light, Dark, and Coffee, with near-black primary buttons, the Z mark's emerald and mint as accents, and new type for headings, text, and figures. The sidebar, balance card, sign-in panel, and transaction table are restyled to match, and the Android app marks the current tab with a solid pill.",
      },
      {
        title: "Android Beta 0.2.35",
        description:
          "The official Android Beta can subscribe to Pro through Dodo Payments and shows Dodo subscriptions in Plan and billing, and it carries the app lock, offline opening, the new look, and income in the mic widget. Android Beta 0.2.33 and earlier cannot load Plan and billing for a Dodo subscriber.",
      },
    ],
  },
  {
    version: "2.43.1",
    releasedOn: "September 23, 2026",
    changes: [
      {
        title: "Debt payments that pay down the debt",
        description:
          'A "Debt payment" expense category now ships with every workspace. Choosing it asks which debt the money went to, and recording the payment lowers that debt\'s balance, marking it paid when the balance reaches zero, so Goals & debt shows the balance after the payment. Editing or deleting the payment restores the old balance, and the ledger and CSV export name the debt beside the category.',
      },
      {
        title: "Edits that stay edits",
        description:
          "Saving a changed transaction in the browser, such as switching an expense to income, now updates that transaction instead of sometimes adding a second copy beside it. Adding an income entry works again too; the form had been sending a debt link that only expenses can carry.",
      },
      {
        title: "Categories without a limit stay out of your budget",
        description:
          "Clearing a category's limit used to leave a zero limit behind, and the dashboard and the assistant counted that spending against a plan you never set, so remaining budget could turn negative. A category without a limit now reads as unbudgeted everywhere: its spending stays visible, and your plan totals leave it out.",
      },
      {
        title: "Steadier loading on a slow connection",
        description:
          'A page that stalls while loading on a lossy connection now asks once more before reporting a timeout, so a brief drop no longer shows "The request took too long" when the server answered fine. Saving still fails immediately, so a change that may already have been applied is never sent twice.',
      },
      {
        title: "A clearer debt form",
        description:
          'The rate field now reads "Interest rate (APR)" and explains in one line that it is the yearly interest your lender charges. The rate, balance date, and status fields share one row again, and the rate field no longer draws a second focus ring across its % sign.',
      },
    ],
  },
  {
    version: "2.41.3",
    releasedOn: "September 21, 2026",
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
  },
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
