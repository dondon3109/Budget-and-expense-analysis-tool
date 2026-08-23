# Changelog

All notable product changes are documented here.

## Unreleased

## 2.11.0 — 2026-08-24

### Added

- Consolidated web and mobile telemetry into PostHog with cookieless, memory-only public page tracking and Core Web Vitals (LCP, CLS, INP) autocapture on public routes.
- Added developer crash telemetry diagnostics on Android to safely test sanitized crash dispatch without crashing the app.
- Added marketing trust pillars, interactive budget planner, and feature spotlight to landing page.

### Removed

- Removed legacy Google Analytics (GA4) and Cloudflare Web Analytics beacons from the web application.

### Fixed

- Fixed mobile theme popover positioning within sticky navigation.
- Fixed scroll-to-top behavior on route transitions.

## 2.2.1 — 2026-08-17

### Added

- Mobile cash flow chart: the weekly, monthly, and six-month Money in and out views now render as a touch-first SVG chart on phone screens (tap to inspect values, drag to scrub, tap again to dismiss), while desktop keeps the existing charting stack.
- Distinct voice recording states: the microphone button now shows a pulsing red recording state with a running timer, and a separate spinner while the recording is transcribed, so recording and loading are visually unambiguous.

## 2.2.0 — 2026-08-14

### Added

- Added photo receipt entry to the Import page, with quick links from Dashboard and Transactions: snap or upload a receipt, review the AI-drafted merchant, date, amount, type, and category, then confirm the entry on the same import preview screen with the existing duplicate detection and commit path.
- Receipt scanning requires its own one-time consent and processes photos in-flight only — images are never stored, retained, or used for anything else.

### Fixed

- Centered the remaining Google sign-in button after Facebook sign-in was removed.

## 2.1.0 — 2026-08-12

### Added

- Added separately consented voice mode to the Financial Assistant, with Cloudflare Workers AI transcription and optional Fish Audio spoken replies for completed, tenant-owned assistant messages.
- Added per-user voice preferences for review-first or automatic transcript submission and for spoken-and-text or text-only assistant replies.
- Added Google and Facebook authentication, contextual product support, AI-assisted bug reporting, and customer review moderation.

### Changed

- Facebook sign-in is temporarily unavailable while its external app publishing requirements remain incomplete; email/password and Google sign-in are unchanged.
- Voice recordings now stop automatically after speech is followed by silence. Recordings with no detected speech end locally without being sent for transcription.
- Automatic voice submission now waits for the transcription provider to return a completed transcript. Production defaults push-to-talk to automatic submission with spoken-and-text replies, while review-first can still be enforced by environment configuration.
- Spoken assistant replies now remove markdown formatting, table separators, and raw URLs for more natural playback. Text and audio are revealed together, with the audio control inside its assistant message and a visible preparation state while synthesis is still running.
- Improved signed-in mobile navigation, assistant space usage, Free-plan messaging, profile navigation, and remaining-budget calculations.

### Fixed

- Voice recording resources are released safely when the assistant route closes, and text-only voice turns no longer request speech generation.
- Voice playback preserves authenticated cross-origin responses and reports provider failures without exposing credentials or provider response bodies.
- Transcript guidance no longer overlaps the spoken-reply preparation state after a reviewed transcript is sent.
- Voice consent now requests microphone access directly from the acceptance action, shows progress while enabling, and keeps retryable failures visible inside the notice.
- Local development now enables the voice routes and remote Workers AI transcription binding instead of showing an unavailable-mode error.

## 2.0.0 — 2026-08-10

### Added

- Added the installable browser foundation, including the manifest, conservative service-worker caching, offline connection guidance, and safe update registration.

### Changed

- Reworked the calendar, billing settings, Pro checkout, plan chooser, and Financial Assistant layouts to fit narrow Android and mobile browser viewports without clipped cards or overlapping controls.
- Moved the free-plan continuation action below the plan comparison so users can review the plans before continuing.

### Fixed

- Assistant chat history now closes from an explicit close control, a tap outside the drawer, or Escape, with focus returned to the History button.
- The Assistant toolbar no longer reserves a second mobile row for the usage meter, leaving more vertical room for messages while retaining usage details on larger screens.
- Fixed a first-launch scroll-lock race between the workspace loader and release notes that could leave the Profile dashboard unable to scroll on narrow screens.

## 1.2.4 — 2026-08-10

### Added

- Introduced a premium animated loading experience that prepares the authenticated workspace while private route code and dashboard data load in the background.
- Added consent-aware product and AI observability, with assistant analytics limited to operational metadata rather than prompts, responses, or financial content.
- Added a new Zoption brand mark across the landing page, authentication, legal pages, app navigation, browser tabs, and saved shortcuts.

### Fixed

- Post-sign-in loading now runs exactly once per authenticated session instead of restarting during lazy route loading or showing the retired dashboard loading screen afterward.
- Calendar interactions no longer leave the screen frozen, and calendar amounts now support US dollar transactions correctly.

## 1.2.3 — 2026-08-09

### Added

- Replaced the dashboard's savings and recurring-cost panel with active savings goals and the combined monthly cost of every active subscription.

### Fixed

- The dashboard subscription total now adds together all active plans instead of showing a single or stale summary amount.
- Overlapping sign-in, setup, release-notes, billing, account, assistant, and transaction dialogs now share one interaction lock, preventing the app from remaining unclickable or unscrollable after the dialogs close.

## 1.2.2 — 2026-08-09

### Changed

- Redesigned the calendar, dashboard, import, and assistant flows with the open design reference, including self-hosted fonts and a refreshed visual system.
- Removed the theme toggle from the calendar header.

## 1.2.1 — 2026-08-08

### Added

- Model-assisted memory enrichment for the financial assistant, with a dedicated usage table and a limit of eight passes per rolling 14-day cycle.
- API readiness checks for required bindings and D1 connectivity on the health endpoint and scheduled tasks.
- Deployment validation and smoke checks that verify environment isolation, exact API and Supabase origins, and a wildcard-free Content Security Policy.

### Changed

- PayPal subscription handling now verifies canonical provider state before applying webhook updates, defers pending checkouts, and treats failed payments as past due.
- Excel and CSV imports now apply stricter archive, worksheet, row, column, cell, compression, and file-size limits before processing.
- Google Analytics now loads only after Analytics consent on eligible public pages and removes its cookies when consent is withdrawn.

### Fixed

- PayPal webhook validation now rejects malformed or oversized requests, and access-token refresh is deduplicated with a retry after rejected credentials.
- Transaction and billing reconciliation paths now preserve subscription ownership and financial-record consistency under concurrent or repeated requests.

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
