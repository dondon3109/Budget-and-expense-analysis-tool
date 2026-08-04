# Changelog

All notable product changes are documented here.

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
