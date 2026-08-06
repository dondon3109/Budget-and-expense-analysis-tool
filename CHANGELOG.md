# Changelog

All notable product changes are documented here.

## 1.2.0 — 2026-08-06

### Added

- Savings accounts can now earn interest automatically. Turn it on for a savings account, enter the annual rate, and choose how often it pays out — daily, monthly, or once a year. Zoption adds the earned interest to the account's balance on the set pay day, computing it from the balance so the Interest income entry appears in your transactions automatically. Available on Zoption Pro.
- The built-in Bank account now has an edit button, so you can switch it to Savings and turn on automatic interest on the balance you already track.

## 1.1.7 — 2026-08-06

### Added

- You can now choose the account a subscription is paid from. Adding a subscription automatically records its next charge as an expense in the transaction dashboard, reducing that account's balance right away.
- Existing active subscriptions are automatically assigned to your Bank account with their charge created, so subscriptions added before this update now show up in your balance too.
- Editing a subscription keeps its linked charge in sync, canceling it removes the charge, and deleting the subscription removes the charge with it.

## 1.1.6 — 2026-08-06

### Added

- Monthly subscriptions now support editing: open the pencil on a subscription to update its name, amount, billing cycle, next billing date, or category.
- You can now delete a recurring subscription you no longer pay for, with a confirmation before it's removed.
- The transfer form now shows the exact amount the receiving account will get after a transfer fee is deducted.

## 1.1.5 — 2026-08-06

### Added

- Transfers can now include a fee. The fee is deducted from the amount you move, so the receiving account gets a little less while your sending account pays the full amount.
- Transfer descriptions are now optional, so quick money moves need fewer details.
- The profile dashboard now shows your all-time transfer fees total and how many fee-charged transfers it covers, and starting a new AI assistant conversation shares how much you've spent on transfer fees and educational tips to reduce fees, with a disclaimer note.

### Changed

- The transfer fees card on the profile dashboard keeps things simple: it shows the all-time total and the fee-charged transfers behind it without the weekly transfers-per-week pace hint.

## 1.1.4 — 2026-08-05

### Added

- Transactions can now be recorded in US dollars as well as Philippine pesos, with a currency selector on the transaction form.
- The profile dashboard now shows overall balance, income, and expenses separately in Philippine pesos and US dollars.
- Account balances on the dashboard show their PHP and USD amounts side by side.

### Changed

- What’s new starts with the latest update and lets you show or hide previous version notes.

## 1.1.3 — 2026-08-04

### Changed

- The AI assistant now spans the whole screen on phones instead of a floating card, so the full conversation and message box use the available space.
- The assistant’s privacy and memory setup points are rebalanced so the short-term memory card sits centered on its own row.
- “What’s new” now lists the three most recent releases so you can review prior patch notes from the footer version link.

## 1.1.2 — 2026-08-04

### Added

- PayPal as the live Pro subscription provider, with durable payment confirmation and recovery for delayed webhooks.
- PayPal is now the primary payment gateway for Zoption Pro, with monthly or annual billing.
- Payment confirmation is durable: your billing status stays accurate while PayPal confirms, survives page refreshes, and offers a manual Check payment status option.
- Expanded Financial Assistant planning support for financial goals and debts, with stronger answer validation and data-quality context.
- Assistant allowance tracking that renews on a 14-day billing cycle.
- The app version is shown in the footer and is clickable to review the latest changes anytime.

### Changed

- Refined the assistant conversation workspace for a clearer, more focused experience.
- Updated the dashboard and settings experience with recent usability improvements.
- Mobile theme picker polish: theme options are now more compact and easier to scan on small screens.
- Free and Zoption Pro can now be compared side by side on mobile by swiping between the two plans.
- The AI assistant now fills the mobile screen so the full conversation and message box stay visible.
- Free-plan assistant questions now reset on a rolling 14-day cycle.
- The AI assistant now remembers durable preferences and facts across chats, such as your debt payoff strategy or savings targets, with a Memory panel to review and clear them.

## 1.0.0 — 2026-07-29

### Added

- A remembered transaction sort preference for date, description, and amount.
- An in-app “What’s new” dialog that appears once for each released version.

### Changed

- Transactions sharing a date now put newer-created records first, with deterministic fallback ordering.
