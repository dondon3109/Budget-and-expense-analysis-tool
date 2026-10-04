/**
 * What Zoption does and what its pages are called, shared by Zoption Support and the AI
 * Assistant so both answer "how do I" questions from one source.
 */
export const PRODUCT_HELP = `How Zoption works:
- Zoption is a private budget and expense tracker. It starts empty and does not connect directly to a bank.
- A person can record transactions manually or import CSV, XLSX, and XLS files. Import is preview-first: map columns, review validation issues and possible duplicates, then commit approved rows.
- Built-in import presets can help with exports from BPI, BDO, MariBank, Bank of America, and JPMorgan/Chase. These are format suggestions; Zoption is not affiliated with those institutions.
- The Profile dashboard summarizes a selected month: money in, money out, net, budgets, spending categories, trends, recent transactions, subscriptions, goals, debts, and recorded-account balances where applicable.
- Account balances are calculated from the recorded transaction ledger. They are not live bank balances and may omit activity from before tracking began.
- Transactions supports manual income, expense, and transfer records, filtering, editing, deletion, categories, accounts, and eligible CSV export.
- Budgets sets monthly category limits and compares recorded spending with those limits.
- Subscriptions tracks recurring charges and keeps their next recorded charge in sync when a subscription is edited, cancelled, or deleted.
- Calendar combines transaction activity, subscriptions, and user-created events by month.
- Goals & debt stores savings goals and debt-planning records. These can be changed in the page itself, or through AI Assistant, which only applies a change after the user taps Confirm. This support chat never changes them.
- AI Assistant is a separate signed-in, consent-gated financial assistant. The configured AI provider interprets questions, while Zoption's server calculates verified financial results through fixed read-only tools. It can help log an income or expense by drafting it from the user's own history (including working out the amount from what is left in an account), but only the user's Save tap adds it. It can also prepare a change to a subscription, savings goal, debt, account (including setting its balance), category, monthly budget, or an existing transaction (add, edit, cancel, delete, or archive), applied only when the user taps Confirm. It cannot change workspace settings such as the currency. Users can manage its conversations, names, preferences, and memory from the Assistant area.
- Account Settings manages profile details, sign-in/security settings, theme, plan and billing, Help & contact, assistant data controls, and permanent account deletion.
- Supabase manages sign-in and identity. A verified Google identity with the same email can preserve the existing Zoption workspace.
- Zoption has a free plan and an optional Pro plan. Current limits and checkout details are shown inside Account Settings; direct people there rather than guessing when plan details may have changed.
- The Android app is a signed APK downloaded from zoption.site/install and is not distributed through Google Play. It is online-first and opens the same private web workspace.
- Help & contact in Account Settings provides the FAQ, Zoption Support chat, and email contact options. The support email is support@zoption.site.
- Public help and policy pages are available at /faq, /terms-of-service, /privacy-policy, and /cookie-policy.

Navigation language:
- Before sign-in: use Start free, Sign in, FAQ, or Android APK.
- After sign-in: use Profile dashboard, AI Assistant, Calendar, Transactions, Import, Budgets, Goals & debt, Subscriptions, Account settings, Help, Contact, or Help & contact.
- When naming one of those destinations, use its exact label. The interface turns supported destination labels into safe clickable links. Never write raw URLs or Markdown links.
`;
