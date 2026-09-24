# Changelog

All notable product changes are documented here.

## Unreleased

### Added

- Three new Philippine budgeting guides: budgeting a semi-monthly salary paid on the 15th and 30th, building an emergency fund in pesos, and planning your 13th month pay.

### Fixed

- `llms.txt` and `llms-full.txt` now list every public page, including the budgeting guides, tutorials, and feature pages, and stay in step with the sitemap as pages are added. `robots.txt` now states that search engines and AI answers may use the site but model training may not.

## 2.44.0 — 2026-09-24

### Added

- Zoption Pro can be bought through Dodo Payments as well as PayPal. The upgrade dialog on the web and Plan and billing on mobile offer "Continue with Dodo Payments", which opens Dodo's hosted checkout for the chosen monthly or annual plan. Dodo Payments is the merchant of record for those purchases. Pro starts only after Zoption confirms the subscription with Dodo, renewal can be cancelled from Plan and billing, and a full refund or an opened dispute ends Pro access.
- Prepared Android Beta 0.2.35 (versionCode 20335) so the next signed build carries Dodo Payments checkout, Dodo subscriptions in Plan and billing, the app lock, offline opening, the new look, and income in the home-screen mic widget. Android Beta 0.2.33 and earlier cannot load Plan and billing for a Dodo subscriber.
- The mobile app has an optional app lock. Set an app password under More → Account, and Zoption asks for it when the app opens or comes back after more than a minute away. It works offline and applies to that device only. If you forget it, sign out from the lock screen and sign in again.

### Fixed

- The Android home-screen mic widget now records income. Saying "Received 20,000 salary to my GCash" or "Got paid 5k for freelance work" opens an income review with the matching account and category instead of failing or saving an expense. Amounts no longer need "pesos" after them, "5k" means 5,000, and a note about "yesterday" is dated yesterday. The review screen has an Expense and Income switch for a misheard note, and the widget label now reads "Speak transaction".
- The mobile app no longer asks you to sign in again when it opens offline. It used to show the sign-in screen once the saved session was more than about an hour old. Now your workspace opens, you can add transactions, and sync resumes by itself when you reconnect.

### Changed

- The web app has a new look: a cool mineral light theme with near-black primary actions and the Z mark's emerald and mint as accents, a deeper near-black dark theme, a refreshed Coffee theme, and new type (Bricolage Grotesque headings, Geist text, Geist Mono figures). The sidebar, balance card, sign-in panel, landing hero, and transaction table are restyled to match.
- The Android and iOS apps use the same palette in Light, Dark, and Coffee, with Bricolage Grotesque screen titles, near-black (mint in Dark) primary buttons, and a solid pill marking the current tab.

## 2.43.1 — 2026-09-23

### Fixed

- Editing a transaction in the browser, such as changing an expense to income, now saves the change to that transaction. The save could lose track of which transaction was being edited and add a new copy instead.

## 2.43.0 — 2026-09-23

### Added

- Admins can change a configuration's model from its Edit dialog on the AI & Voice Models page, with a live model list from the linked key and a warning when the provider no longer offers the current model, so a retired model is replaced without a release.

### Fixed

- Recording a debt payment now updates the debt it names. The linked debt's balance drops by the
  payment, and a balance that reaches zero marks the debt paid, so Goals & debt reflects the
  payment instead of the balance from before it. Editing the payment's amount or debt, or deleting
  it, restores the old balance in the same write. Payments recorded before this release are
  applied to their debts when it ships, so a balance that was already wrong reads correctly.
- The AI assistant now defaults to DeepSeek `deepseek-flash` (V4.1 Flash). DeepSeek retired `deepseek-v4-flash`, and existing configurations still on it move to the new model automatically.
- On the AI & Voice Models admin page, a failed save in the edit-configuration, add-credential, or edit-credential dialog now shows its reason inside the dialog. It used to appear behind the dialog's backdrop, so the save looked like it did nothing.

## 2.42.2 — 2026-09-23

### Fixed

- The chat assistant no longer renders a faint pulsing square around the avatar while checking records. The checking pulse animation now targets the message bubble directly instead of the outer message container.
- Adding an income transaction in the browser works again. The form sent the debt link an expense can carry for every kind of entry, and an income refuses that field, so a correctly filled income entry was rejected before it ever reached the API.

## 2.42.0 — 2026-09-22

### Added

- Paying a debt is now a transaction like any other. A "Debt payment" expense category ships with
  every workspace, and choosing it asks which debt the money went to, from the debts already in
  your workspace. The ledger and the CSV export name that debt beside the category, and the archive
  export carries the link. Deleting a debt keeps its payment history and drops the link, and a
  payment saved without a debt — including from the mobile app, which does not yet offer the
  picker — still records normally.

### Fixed

- The mobile app no longer leaves a screen loading forever when a request stalls. Most API calls had
  no time limit at all, so a poor connection left billing, support, receipt settings, account
  deletion and the assistant's own screens spinning with no error and no way out. They now give up
  after 30 seconds, while the operations that legitimately take longer keep their own limits: an
  assistant turn and support chat at two minutes, account deletion, the account archive and billing
  reconciliation at one minute.
- A read that stalls on a slow connection no longer fails outright. The API client waited 20 seconds
  for a response and then gave up, so a lossy connection surfaced as "The request took too long. Try
  again." even when the server was healthy and answered in milliseconds. A read now repeats once
  after a short pause before it reports a timeout, while writes still fail immediately so a request
  that may already have been applied is never sent twice.
- Remaining budget no longer turns negative for categories that have no limit. Clearing a category's
  limit leaves its upsert-only budget row behind with a limit of zero, and the dashboard and the
  assistant counted that category's spending against a plan the user never set. A zero limit now
  means unbudgeted everywhere. The spending stays visible as spending, while plan totals, remaining
  budget, and utilization stay at zero until a limit is set.
- The interest rate field in the debt form no longer draws a second focus ring across its "%"
  suffix. The wrapper already marks focus with its own border and halo, and the input inside it
  drew the global focus outline as well, which spilled outside the wrapper and sliced through the
  suffix.
- The debt form's interest rate, balance date, and status fields share one row again. The row asked
  for three columns, but the shared two-column rule outranked it, so status wrapped onto a row of
  its own.

### Changed

- The debt form asks for "Interest rate (APR)" and says in one line that it is the yearly interest
  the lender charges, with 0 for a debt that charges none. The field read "APR" alone before, and
  the payoff note under the form said "APR" too.

## 2.41.3 — 2026-09-20

### Fixed

- The startup loading screen no longer flashes the workspace and then covers it again. It played its
  exit fade the moment it mounted rather than at handover, and that fade stopped applying once it
  ended, so the splash went fully transparent early in startup and snapped back opaque a frame
  later. The exit now waits until the route and its data are ready and holds clear until the
  workspace takes over, so the private startup gate is one fade in, one hold, and one fade out.

## 2.41.2 — 2026-09-20

### Fixed

- Signing in with Google no longer ends on "Sign-in could not be completed" while the account is
  signed in. Signing in remounted the router, and the remounted callback page then read a URL the
  exchange had already cleaned, so a sign-in that succeeded was reported as a failure and only the
  "Return to sign in" link revealed the live session. The router now survives an identity change and
  the callback finishes against the live session, so a session that arrives after the failure was
  reported — or one that already existed when a reload or a restored tab landed on the code-stripped
  callback URL — opens the workspace instead of a dead end. One code is exchanged once per page
  load, so a remount cannot spend it twice or misreport a reset link it just used. A failure that
  really left no session, and a genuinely unusable password reset link, still report as before.
- A sign-in callback that re-ran while its exchange was still in flight no longer leaves the loading
  screen up forever; its outcome now reaches the page.

## 2.41.0 — 2026-09-20

### Performance

- Android cold start no longer paints three separate spinner screens. The native splash stays up
  until the stored session resolves and is released on the route that session selects, with a
  timeout so a stalled restore cannot strand it. Module evaluation is deferred to first use,
  and icons are preloaded, so the first frame no longer flashes the wrong theme or pops its
  icons in a moment later.
- The Home screen reads only the window its cards display instead of the whole transaction
  ledger, and recent activity is a separate three-row read. A long ledger no longer costs a
  full-table read, a per-row decode, and a full-ledger aggregation every time the dashboard
  loads.
- A synchronization pull no longer re-runs every open query once per applied row. All screens
  share one local change subscription and coalesce their refreshes, so a page of changes costs
  one refresh rather than one per row.
- The app bundles one icon font instead of sixteen. The unused families were 2.6 MB of assets.

### Added

- Prepared Android Beta 0.2.33 (versionCode 20333) mobile release and refreshed in-app patch notes.
- The web dashboard now answers what is safe to spend this week. It paces your remaining monthly
  budget across the days left, or your balance when the month holds no budget plan, then caps the
  figure so a renewal cannot push your projected balance below zero. This is the guidance the mobile
  app already shows on its home screen.
- The dashboard now carries a card for the cash-flow forecast and one for the remittance calculator, so
  both tools are one click from the home screen instead of buried on their own pages. The forecast card
  reads the lowest projected balance over the next 30 days and the renewals inside that window; the
  remittance card reads the stored mid-market US dollar benchmark rate.

### Changed

- The subscriptions cash-flow forecast draws the projected balance as a chart with a marked low point
  instead of a strip of bars, shows the 30, 60, and 90 day endings side by side, and takes a safety
  buffer amount from you instead of holding it at zero. The forecast view is now a link target
  (`/app/subscriptions?view=forecast`).

### Fixed

- Signing in no longer fails when the callback page runs a second time, such as after a reload, a
  restored tab, or a second tab during the handoff. The callback drops the single-use code from the
  address bar as soon as it is exchanged, and a session that is already live opens the workspace
  instead of a dead end. A password reset link that cannot be exchanged still reports an unusable link.

- The cashflow forecast on the subscriptions page stays reachable when the month has no
  subscriptions. Previously the empty state replaced it even after you selected the forecast view.
- The remittance calculator reads its amount and fee fields through the same two-decimal parser as
  the rest of Zoption. A third decimal place is now reported instead of being rounded away, and a
  negative amount is refused rather than quietly counted as zero.
- The remittance calculator no longer presents a confident result while an input is unusable: it shows
  what it is waiting for instead of ₱0 received and a Best Value badge, and the custom exchange rate
  rejects junk such as `12abc` rather than reading it as 12.
- The remittance calculator stays available on the planning page when your goals or debts fail to load;
  it needs none of that data.
- In-page links to a section now land on it. A hash target that only mounts after a lazy route or a
  hidden section renders, such as `/app/settings#plan-and-billing`, is scrolled to once it appears
  instead of falling back to the top of the page.

## 2.40.0 — 2026-09-20

### Changed

- The startup screen no longer holds you for a fixed three seconds. It leaves as soon as your session
  is restored and the workspace has loaded, and its rail reflects those real steps instead of an
  invented percentage. Its mark is a single rising rule that the Zoption monogram draws itself onto,
  replacing the previous shape-morphing animation.

### Fixed

- Signing in through a provider link, a magic link, or a password reset now ends on the loading screen
  while the handoff finishes, so the workspace no longer appears to jump straight from the provider. A
  sign-in that fails still reports the failure immediately.

## 2.39.0 — 2026-09-19

### Added

- Prepared Android Beta 0.2.32 (versionCode 20332) mobile release and refreshed in-app patch notes.
- The assistant Memory panel now edits response detail and coaching tone next to the debt payoff
  strategy. Both were previously shown there as read-only text and could only be changed from the
  planning page.

### Changed

- Assistant memory no longer expires. Remembered facts and your debt payoff preference are kept until
  you delete them, clear memory, or delete your account, while conversations and their sanitized
  audit snapshots still expire 90 days after the last message in that chat. Facts you state or edit
  are now exempt from the 50-fact storage cap, so a learned fact can no longer push them out. The
  assistant data-sharing consent is now version 6, so every existing user reviews and accepts the
  updated notice before their next assistant question, and the notice now states these retention
  terms plainly.
- Deleting every chat removes the conversations and their summaries only. Remembered facts and your
  payoff preference stay until you delete them individually or clear memory. Previously, deleting all
  chats also discarded remembered facts.

### Fixed

- The assistant Memory panel keeps its title, close control, and Clear memory/Close actions pinned
  while the memory list scrolls, so they stay reachable however many facts are remembered. It no
  longer shows "No preference" or "No remembered facts yet" while it is still loading, says so with a
  retry when that load fails, marks the chosen payoff strategy with a check as well as a colour, and
  keeps the three payoff cards' titles and descriptions aligned at every width, including a single
  stacked column on a phone.
- A question that needs several kinds of lookup (budget, categories, trends) is now answered from your
  own records even when the provider skips one of them, instead of returning a refusal that asks you to
  rephrase or narrow the date range.

## 2.38.0 — 2026-09-18

### Added

- Prepared Android Beta 0.2.31 (versionCode 20331) mobile release and refreshed in-app patch notes.

### Changed

- AI features now draw on one shared monthly pool instead of separate per-feature allowances. Free
  includes 500 AI actions per Manila calendar month and Pro 2,000, counted as one action per AI
  operation however many provider calls it makes. Receipt scanning, voice transcription, spoken replies, PDF statement entry and
  transaction voice entry were Pro-only; they are now available to Free tenants through the same pool,
  and the 14-day assistant question cycle is gone. Live streaming voice stays Pro: a live
  platform-funded socket has no per-request boundary to meter.

### Security

- A refund, chargeback or dispute now ends Pro for the period it reverses. Previously only a
  cancellation did, so a reversed payment left the subscription active.
- Signing out on Android now revokes the session on the server, not just on the device. It falls back
  to clearing the device when the phone is offline.

### Fixed

- Assistant answers can no longer state a peso amount that cannot be traced to your own data, in any
  formatting.
- An overdrawn savings account no longer earns interest; interest is only credited on a positive balance.
- Profile photo changes and removals now take effect within a minute instead of staying cached for a year.

## 2.37.0 — 2026-09-18

### Added

- A subscription whose renewal is being held back now says so in the list, beside its status: not enough balance, or the paying account was removed. Until now that was only visible in the reminder email.

## 2.36.0 — 2026-09-17

### Added

- Removing an account now names the active subscriptions paid from it, on web and mobile, so you can move a plan before its account leaves your list.

## 2.35.1 — 2026-09-17

### Changed

- A subscription paid from an account you removed no longer charges that account. Zoption skips the cycle, leaves the billing date due, and tells you once per missed cycle to pick a different account or restore the one you removed.

## 2.35.0 — 2026-09-17

### Added

- Subscriptions now renew themselves. Every billing date records a charge in the transaction dashboard and rolls the subscription to its next cycle, so a monthly or yearly plan keeps deducting from its account instead of charging only once when you add it.
- When the linked account cannot cover a renewal, Zoption leaves the billing date due, keeps retrying every day, and sends one email on the first failed day so you can top up the account or change the subscription. The reminder names the plan, the amount, the account, and the due date.

### Notes

- A plan billed on the 29th, 30th, or 31st renews on the last day of a shorter month and keeps that day from then on. A plan billed on the 31st therefore renews on the 28th from February onward. This is intended, not a defect: February has no 31st, and the schedule does not jump back later to reclaim a day a shorter month removed.

### Fixed

- Quick Paste from SMS / Alert now reads alerts that write the peso as a single letter P, such as "You have paid P64.33 GCash to PAYPAL \*GIT", and it reads timestamps in the 07-17-26 12:26:58 AM form. The amount, merchant, date, and reference number fill in on web and mobile instead of leaving the extracted details blank.
- The Transactions date presets (This month, Last 30 days, Year to date) stay inside the filter card on wide screens, where the last preset used to hang past the card's right edge.

## 2.34.1 — 2026-09-17

### Changed

- Refreshed web install page metadata and direct APK links to Android Beta 0.2.30 (versionCode 20330).

## 2.34.0 — 2026-09-17

### Added

- Added Tagalog (Filipino) voice input and AI Assistant language support on web and Android mobile Beta with bilingual Auto detection as the default mode, while keeping quick language toggles accessible across text chat voice control, hands-free voice conversation, and transaction voice entry.
- Added a Voice Language setting in Account Settings (web and mobile) and More tab (mobile) to configure the preferred voice language between Auto (bilingual), English, and Tagalog.
- Added two Philippine peso budgeting guides, "How to Budget a Monthly Salary in the Philippines" and "The 50/30/20 Rule in Pesos", and linked the 50/30/20 calculator to the guide.
- Added public explainer pages for receipt scanning and voice expense entry, linked from the landing page.
- Added anonymous, cookieless conversion measurement for the signup path (signup page view, signup outcome, first app load, first import into an empty workspace, assistant consent, and first assistant question). The steps carry no financial detail, no identifiers, and no page addresses or query parameters, and the Cookie Policy and Privacy Policy describe them in plain words.

### Changed

- Prepared Android Beta 0.2.30 (versionCode 20330) mobile release.
- In-app patch notes now describe the 0.2.30 release: Tagalog voice input and the Auto bilingual default, the two new peso guides and explainer pages, and the anonymous signup funnel measurement.
- The voice consent notice, the AI entry opt-in, and the Privacy Policy now name the browser's own speech service (Google on Chrome, Apple on Safari) beside Cloudflare Workers AI, and the assistant voice consent version moves to 4 so voice input asks again.

### Fixed

- The mobile voice language setting is read back from the device on launch instead of resetting to Auto, and the same read now happens for the assistant voice options and the microphone capture consent.
- Auto stays Auto everywhere: the Cloud Run bridge receives `auto` instead of being told English, and the browser's English-only speech recognizer no longer starts in Auto mode or pre-empts the server transcription that handles Tagalog. A server transcript now outranks a browser one on every voice surface.
- A voice language read at the API boundary (`auto`, `en`, `fil`, or the older `tl`) is validated once, and a direct transcript request no longer sends a language nothing reads.
- A first import is only recorded when the commit inserted at least one row, so an empty commit on an empty workspace no longer counts as the funnel's first import.
- The private page URL guard now runs in PostHog's `before_send` hook, replacing the deprecated `sanitize_properties`.

## 2.33.1 — 2026-09-16

### Changed

- Refreshed web install page metadata and direct APK links to Android Beta 0.2.29 (versionCode 20329).

## 2.33.0 — 2026-09-16

### Added

- The financial assistant now remembers budget caps, checking buffers, payday schedules, and recurring bills across chats, ranks saved memories by relevance to the current question, and lets you edit or delete individual remembered facts from the assistant Memory panel on web and mobile.

### Changed

- Prepared Android Beta 0.2.29 (versionCode 20329) mobile release and refreshed in-app patch notes.

### Fixed

- Assistant memory no longer stores questions such as "What did I spend on the 15th?" or "What is my biggest bill this month?" as durable facts, and "Don't forget my emergency fund" no longer deletes the saved target.
- Assistant memory keeps statements that sit beside a question, no longer mistakes a list of four-digit numbers (years, order IDs) for a card number, and only the Memory panel or an explicit "I prefer avalanche/snowball" statement can change the debt payoff preference.
- When the assistant's AI provider account runs out of credit, the assistant now says so instead of reporting an invalid response and suggesting a retry that cannot help. This covers every provider we can detect it from, including the ones that report it as a rejected request rather than a payment error.
- Assistant memory now keeps a fact the user explicitly asks it to remember even when the request is phrased as a question, and recognises American Express and Diners Club card groupings when deciding that a value is too sensitive to store.
- The Memory panel on web and mobile no longer offers leftover duplicate payoff rows from an earlier release as editable facts, and the web inline editor moves focus into the field and back to the row it belongs to.
- Renamed the mobile Transactions month figure from Balance to Net, with a question-mark explanation of how it is calculated, because it is the month's income minus expenses and not the account balance.
- Fixed mobile navigation traps: registered the missing `budget-conflict` route with modal presentation and safe-area insets, and added back navigation to the AI Assistant across loading, error, consent, and threads states.
- Restored conflict resolution navigation links in mobile debt, subscription, and goal editors when records are locked due to synchronization state conflicts.
- Fixed bug report review form in mobile Help & Support to scroll properly with the keyboard active instead of pushing submission controls off-screen.
- Constrained the bank statement import preview list so the import confirmation button remains visible on long statements.
- Replaced nested modal presentation with inline accordions when selection pickers are used inside bottom sheets to eliminate iOS modal stacking conflicts.
- Removed duplicate safe-area top padding and double headers across pushed screens with active native navigation headers.
- Corrected screen reader accessibility labels in debts, budgets, and subscriptions to announce formatted currency rather than raw minor unit integers.
- Styled net-neutral account transfers with neutral color tones instead of expense or income colors on the mobile dashboard and calendar.
- Auto-normalized date inputs across entity editors and aligned Android multiline text inputs to the top.
- Fixed mobile cookie consent banner on iOS Safari where action buttons stretched into oversized blocks with missing text and pushed preference controls off-screen.

## 2.32.5 — 2026-09-15

### Changed

- Refreshed web install page metadata and direct APK links to Android Beta 0.2.28 (versionCode 20328).

## 2.32.4 — 2026-09-15

### Changed

- Prepared Android Beta 0.2.28 (versionCode 20328) mobile release and refreshed in-app patch notes.

### Fixed

- Made the Quick Start Guide disappear completely on web and mobile when dismissed via the close (`x`) button instead of leaving a persistent reopen banner.
- Fixed the Renewals action button in the mobile Safe-to-Spend card overflowing outside the card container on narrower screens by constraining the title group with flex layout and preventing the button from extending out.

## 2.32.3 — 2026-09-15

### Changed

- Refreshed web install page metadata and direct APK links to Android Beta 0.2.27 (versionCode 20327).

## 2.32.2 — 2026-09-15

### Changed

- Prepared Android Beta 0.2.27 (versionCode 20327) mobile release and refreshed in-app patch notes.

### Fixed

- Fixed the web ledger reshuffling same-day transactions right after a save: the optimistic re-sort ranked rows by id, promoted edited rows, and compared signed amounts while the API orders by absolute amount and breaks same-date ties on creation time. Transaction lists now carry the server's `createdAt`, so a saved row lands exactly where the next page read puts it.
- Fixed mobile transactions appearing out of order within the same date: same-day entries were ranked by an internal id, so a transaction recorded later could land at the bottom of its day instead of the top. The ledger, the monthly list and the dashboard's Recent activity card now order same-day entries newest first.

## 2.32.1 — 2026-09-14

### Fixed

- Hardened avatar URL handling in `UserAvatar` with strict protocol verification against DOM XSS.
- Replaced insecure pseudo-random generation in transaction saved views with `crypto.randomUUID()`.
- Upgraded `sharp` to 0.35.4 to resolve upstream libheif vulnerabilities (GHSA-rgj7-g3m4-5g8c).
- Replaced unparsed domain substring matching with structured host URL validation in deployment smoke checks.

## 2.32.0 — 2026-09-13

### Added

- Added a platform admin console at `/app/admin` that gathers sponsored Pro seats, customer reviews, AI and voice models, and support report triage into one page, each area showing its live state and where it opens.
- Added an Admin entry to the private app sidebar that appears only for the platform administrator.
- Added a guided Spreadsheet Migration Onboarding Wizard with drag-and-drop file upload (CSV and Excel .xlsx/.xls), automatic bank preset recognition, visual column mapping with sample row preview, duplicate transaction detection, and one-click import into a new or existing account.
- Added a first-run "Fork in the Road" experience across web and mobile dashboards giving new users a clear choice between bringing existing bank/Excel data or starting clean with guided setup.
- Added full data portability export endpoint `GET /api/app/exports/account-archive.json` with web download and native mobile file share sheet under Account settings for unpaywalled, full JSON account backups (accounts, transactions, categories, budgets, subscriptions, goals, debts, and events).
- Added bulk actions to the transaction ledger: a header checkbox selects the visible rows so they can be re-categorised or deleted together, with a running selected count.
- Added a five-second Undo after deleting a transaction.
- Added ledger keyboard shortcuts (`/` to search, `n` for a new transaction, `Cmd/Ctrl+Enter` to save) and date-range presets (This month, Last 30 days, Year to date).
- Added categories and per-question anchors to the FAQ, so any answer can be linked directly and the page no longer lists every answer expanded at once.
- Added a screen-level error boundary so a failure in one screen shows a recovery panel, with the technical detail behind a disclosure, instead of leaving a blank page.
- Added a "Skip to content" link as the first focusable control on every shell, so keyboard users can jump past the navigation straight to the page.
- Added an "Unsaved changes" marker to the monthly plan editor and a browser confirmation before leaving with untyped budget amounts still unsaved.
- Added skeleton loading placeholders to the transaction ledger, the monthly plan editor and the dashboard refresh, so a loading screen shows the shape of the content that is arriving instead of bare "Loading…" text.
- Added a position indicator to the transaction ledger showing which entries are on screen and how many there are in total, per-row keyboard navigation with j and k, and saved filter views that can be named, re-applied and deleted.

### Changed

- Prepared Android Beta 0.2.26 (versionCode 20326) mobile release and refreshed in-app patch notes.
- Moved request-path rate limits onto a Durable Object, queued PayPal reconciliation, bug-report mail, and account-deletion follow-up, and stored profile pictures in R2 instead of Supabase Storage.
- Moved sponsored Pro seat management from Account settings > Billing into the admin console, leaving a pointer to the console behind so that page loses nothing. The workbench also lists all five seats now, so open capacity is visible instead of counted.
- Made the first-run theme chooser dismissible: Escape or the new close control keeps the Light default and remembers it, so no page is gated behind it any more.
- Turned the cookie-consent prompt into a non-modal bottom bar that leaves the page readable and scrollable while a choice is still pending.
- Routed every destructive confirmation through one dialog that names the record, states the consequence plainly, and disables itself while the action runs, replacing the browser's own confirm prompt for goals, debts and subscriptions.
- Moved transaction filters into the URL so a filtered ledger is bookmarkable, shareable and reload-safe.
- Replaced the separate headers on the landing, pricing, install, FAQ, guides, tutorials, legal, changelog, thank-you and not-found pages with one shared public header that carries a working mobile menu everywhere.
- Labelled the sidebar entry for the dashboard "Home" so it matches the mobile tab bar, instead of "Profile".
- Extended the unsaved-changes guard beyond closing the browser: switching pages, tapping a mobile tab or signing out with untyped budget amounts now asks first, and changing month no longer discards a draft silently.
- Budget edits now survive leaving the page at all: an in-progress monthly plan is kept for the browser session and restored when you return, so the Back button, a refresh or a crashed tab can no longer lose typed amounts. Confirming a discard still clears it.
- Promoted the AI Financial Assistant into the mobile tab bar, which is now Home, Transactions, Budgets, Assistant and More, so the assistant is one tap away instead of two. Calendar moved into the More drawer to keep the bar at five slots, so it is now two taps instead of one.
- Added breadcrumbs to the nested admin console and bug report pages, which previously gave no indication of where they sat inside the app.
- The customer review prompt is now a modal dialog. As a fixed side panel it covered primary content on most screens, including the ledger's Amount column, the budget inputs and the plan screen's spread column.

### Fixed

- Fixed Revoke, Delete, and Cancel actions rendering as plain text on every screen except the AI and voice models desk, which held the only copy of their button styling.
- Fixed the assistant chat history Select button on web, which only revealed per-chat trash icons: select mode now shows a checkbox on each chat, toggles chats instead of opening them, and deletes the selected chats together in one confirmed action.
- Fixed the assistant chat history Select button on mobile, which made conversation taps do nothing and only offered a per-chat Delete: select mode now shows a checkbox on each conversation, taps toggle the selection, and a Delete selected bar removes the chosen conversations together after confirmation.
- Fixed the dark and Coffee themes rendering near-white panels and borders: several stylesheets referenced colour variables that were never defined, so those declarations either fell back to hardcoded cold greys or were dropped entirely.
- Fixed secondary text failing WCAG AA contrast on 13 of the 14 public routes by darkening the muted and subtle text tokens.
- Fixed the 404 page, which shipped no header, no footer and a heading set at body-copy size; it now uses the public shell and the display type scale.
- Fixed the pricing and install headers wrapping "Sign in" and "Start free" onto two lines on a phone, and the missing mobile menu on those pages.
- Fixed five dialogs that disabled themselves: they took the application root lock without rendering outside the root, which made them unfocusable and invisible to assistive technology in a real browser.
- Fixed the transaction delete confirmation, which was two unstyled text buttons inside the row with no danger styling and no statement of consequence.
- Fixed the Add Transaction dialog letting Tab escape to the page behind it, and the low-contrast focus ring it overrode.
- Fixed the assistant page having no visible heading, and the loading screens pulsing their label text indefinitely.
- Fixed the goals and debt page nesting a second main landmark inside the application shell, which gave assistive technology two competing content regions.
- Fixed workspace links that were only mouse-sized on touch devices.
- Fixed the mobile navigation drawer letting Tab escape to the page behind it, and raised the drawer's back link to a 44px touch target.
- Fixed the dashboard refresh state rendering an unstyled placeholder element that had no CSS anywhere in the project, so it was invisible while it ran.
- Fixed the password strength meter on the sign-up form having no accessible name, so screen readers announced an unlabelled progress bar.
- Fixed the savings interest switch on the landing page being unreachable: it sat inside a container hidden from assistive technology, so keyboard and screen-reader users could not toggle it.
- Fixed the "Start from a file you already have" label on the landing page sitting below AA contrast against its own translucent pill background.
- Fixed the feature comparison table on the landing page scrolling sideways on phones with no way to reach it by keyboard; it can now be focused and scrolled from the keyboard.
- Fixed the "over budget" warning chip on the landing page rendering at 2.82:1 against its own fill, which made it hard to read.
- Fixed the changelog making every release a page landmark, which flooded a screen reader's landmark list with more than a dozen entries and produced duplicated names when two entries shared a version number.
- Fixed the share-budget and calendar-event dialogs letting Tab escape into the page behind them. They now hold focus while open and hand it back when closed, and every dialog in the app shares one focus-trap implementation instead of eleven hand-rolled copies.
- Fixed 32 table headers across the import preview, subscriptions, cash flow, remittance, spending and spreadsheet-migration tables missing a scope, so a screen reader can associate each cell with its header. Those tables also gained accessible names.
- Fixed touch targets below 44px centrally for compact icon buttons and small text buttons, rather than each screen patching its own.
- Removed 48 dead CSS fallback chains that still named long-deleted colour variables, so a future edit cannot silently resolve a wrong colour through them.
- Fixed the calendar month grid, whose grid role held the weekday headers and day cells as direct children with no row role, a structure assistive technology cannot navigate as a grid.
- Fixed the calendar income and expense indicators and the import screen's disabled cards, all of which failed WCAG AA contrast; the disabled cards were dimmed with a whole-card opacity that blended their text toward the page behind them.
- Fixed the dashboard charts, which exposed focusable pie sectors inside containers hidden from assistive technology.
- Fixed the provider comparison table on the plan screen being unreachable by keyboard at tablet widths.
- Fixed the next-month calendar toggle sitting inside a separator role, which ARIA defines as a leaf and so cannot contain a control.
- Fixed the assistant route's loading and error states rendering no heading.
- Fixed the support launcher covering the footer links on a phone, and the cookie banner covering the last stretch of every page.
- Fixed the renewal calendar on the subscriptions screen exposing the same invalid grid structure the main calendar had: its weekday headers and day cells now sit inside rows.
- Fixed the expanded next-month calendar having no tab stop of its own, which left its days unreachable by keyboard, and padded the last week of every month grid to seven cells.
- Fixed accounts that could not load any page after their email had previously been verified by a different account: the identity record clashed on the unique verified email, so every request failed with a server error.
- Fixed the shared public header painting its own navigation on top of itself on a 1280-1420px laptop: the landing page carries ten links beside the wordmark, the theme control, Sign in and Start free, and the row used to shrink below its own content, so "Voice & Scan" ran into "Zoption" and the theme pill sat over "FAQ". The row now keeps clear space at every width, holds all ten links from 1420px, keeps the primary six plus the menu trigger down to 1040px, and hands the rest to the drawer, which lists every link.
- Fixed the public header's drawer hiding its own "Sign in" link on phones and tablets, because the rule that removes the header-bar control also matched the drawer's copy.
- Fixed the pricing page plan comparison table being unreachable by keyboard on mobile screens.

## 2.31.0 — 2026-09-12

### Added

- Added safe-to-spend guidance hero to the mobile dashboard, projecting liquidity and remaining budget envelope into a neutral weekly spending figure.
- Added voice draft preview card with a 3-second countdown auto-save and fast cancel or edit options.

### Changed

- Replaced alarming over-budget warning colors and badge copy with calm, forward-looking plan guidance across web and mobile budgets.

## 2.30.2 — 2026-09-11

### Fixed

- Refreshed web install page metadata and direct APK links to Android Beta 0.2.24 (versionCode 20324).

## 2.30.1 — 2026-09-11

### Fixed

- Fixed the home-screen mic widget discarding a voice note when its tap opened Zoption cold: the signed-in area now waits for the stored session to finish restoring before routing, so the widget's transcript and payload survive to the review screen instead of being redirected away.
- Fixed the mic widget balance update booking the whole target balance as an adjustment when the account balance had not finished loading, by reading an unknown balance as unknown instead of zero and waiting for the dashboard read before enabling the update.
- Removed `android:noHistory` from the widget voice capture activity; the platform finished it as soon as it stopped, so devices whose speech UI covers the activity instead of floating over it dropped every transcript.
- Declared `android.speech.RecognitionService` package visibility so the widget's speech availability check works on Android 11 and later.
- Fixed mic widget voice expenses ignoring the account spoken in the note ("... for dinner today using cash"): the account is now resolved by matching the speaker's own account names against the transcript, since the native intent JSON only carries the amount and merchant.
- Fixed mic widget voice expenses always landing on Uncategorized: the category is now suggested from the transcript with the shared semantic matcher (so "dinner" selects Food & dining, "groceries" selects Groceries), instead of defaulting straight to Uncategorized.
- Prepared Android Beta 0.2.24 (versionCode 20324) mobile release and refreshed in-app patch notes.

## 2.30.0 — 2026-09-09

### Added

- Added dedicated Tutorials & Guides page across web (`/app/tutorials`, `/tutorials`) and mobile (`/(app)/tutorials`) with step-by-step guides, search, and action shortcuts.
- Added interactive Quick Start onboarding cards on web and mobile dashboards covering balance setup, envelope budgeting, transaction entry, and tutorials.
- Added prominent "Adjust balance" actions across dashboard account breakdowns, individual account rows, and mobile balance cards with live delta calculation and one-click undo.

### Fixed

- Refactored mobile Budgets screen action buttons ("Share Envelopes" and "Add budget") to wrap responsively on compact screen widths without overflowing.
- Supported public prerendering for the tutorials page without throwing on unauthenticated contexts.
- Overrode `js-yaml` dependencies to patched versions (3.15.2 and 4.3.2) resolving high-severity advisory GHSA-2883-xcg3-v3hh.
- Prepared Android Beta 0.2.23 (versionCode 20323) mobile release and refreshed in-app patch notes.

## 2.29.2 — 2026-09-08

### Fixed

- Refreshed web install page metadata and direct APK links to Android Beta 0.2.22 (versionCode 20322).
- Hardened the `babysit-release` watcher with local zero-network repo resolution, canonical 40-character SHA expansion, and mobile version code awareness.

## 2.29.1 — 2026-09-08

### Fixed

- Resolved the Android native prebuild error in the mic widget config plugin by reading `platformProjectRoot` from `modRequest`.
- Removed dormant Expo OTA update dependencies and workflows to avoid confusion in favor of the verified native APK updater.

## 2.29.0 — 2026-09-07

### Changed

- Optimized transaction voice input responsiveness, speed, and reliability across web and mobile:
  - Added fast-path transaction draft extraction directly from live streaming transcripts, bypassing multi-megabyte audio file uploads and Cloudflare Whisper re-transcription when live speech-to-text is available.
  - Added voice activity detection (VAD) with automatic silence stop (1.4s) on web transaction voice entry, matching mobile and assistant voice behaviors.
  - Kept spoken transcript captions visible during the draft creation phase on web and mobile.
  - Added a cancel button during recording on web and mobile to discard voice clips cleanly without drafting.
  - Improved amount and date extraction in the AI entry service to parse metric scale suffixes (e.g., "2k" for 2,000 pesos) without amount mismatches and isolated hyphenated ISO dates from currency parsing.
  - Added user-category-aware voice extraction: the AI entry endpoint now receives active user category names to choose matching categories directly during inference.
  - Added `@zoption/shared` category matching (`matchCategory`) with multi-tier fuzzy, token-subset, morphological stem, and semantic alias matching so spoken terms like "groceries", "grab", "gas", "meralco", or "rent" correctly map to standard and custom user categories on web and mobile.
- Optimized SMS notification parsing, auto-detection, and quick-paste transaction logging across web and mobile:
  - Unified SMS transaction parsing under `@zoption/shared` (`parseSmsNotification`), replacing legacy ad-hoc regular expressions.
  - Added timezone-safe local date evaluation (`getLocalTodayIso`), eliminating UTC rollover bugs during late-evening transactions in Asia/Manila (UTC+8).
  - Added support for yearless dates (e.g., `08/25`, `25 Aug`) and 2-digit years with lookaheads to avoid mistaking timestamps as years, plus multi-currency detection (PHP and USD).
  - Added extraction of card and account ending digits (`*1234`), approval/trace reference numbers, salary deposits, and card charge patterns.
  - Added automatic category matching using fuzzy/alias-aware `@zoption/shared` matcher and account matching based on channel and card numbers.
  - Added real-time duplicate transaction detection warnings against existing records matching date, amount, and merchant or reference numbers.
  - Web: Updated Quick-Paste modal to route parsed drafts through the `TransactionForm` drawer with category pre-selection for user review before saving.
  - Mobile: Connected Quick-Paste modal to auto-parse on clipboard paste, alert on duplicates, and prefill `TransactionEditorScreen` via route parameters.
- Added mobile day-1 CSV/sheet import flow and offline privacy voice mode:
  - Added 3-step first-run CSV/sheet import flow on mobile to populate workspaces immediately.
  - Added separate mic-capture consent gating and optional in-flight no-store audio streaming headers.
  - Added offline voice draft queue caching on-device transcripts when disconnected and auto-draining on reconnect.
- Bumped mobile version to 0.2.22-beta (versionCode 20322).

## 2.28.0 — 2026-09-07

### Added

- Native Android home-screen mic widget with voice capture, balance reconciliation, and one-click balance adjustment on mobile:
  - Added native RemoteViews mic AppWidget for tap-to-talk voice capture without opening the app, emitting intent deep-links.
  - Added widget-intent screen with intent confirmation, validation, and submission through the voice/transaction pipeline.
  - Added one-click balance adjustments with before/after previews and undo support in account details.

## 2.27.1 — 2026-09-06

### Fixed

- Refreshed Android install snapshot metadata to 0.2.20-beta (versionCode 20320) and updated production release notes with mobile voice transcription performance optimizations and voice chat routing fixes (`apps/web/src/releases/androidRelease.json`, `apps/web/src/releases/currentRelease.ts`).

## 2.27.0 — 2026-09-06

### Changed

- Optimized mobile voice transcription responsiveness and accuracy:
  - Eliminated initial speech truncation by starting native audio capture immediately upon recording start and buffering early audio frames until the WebSocket handshake resolves.
  - Reduced voice activity detection silence duration from 3.0s to 1.4s and lowered the silence RMS threshold floor from 600 to 150-250 RMS, preventing mid-sentence cutoff on normal speaking volumes while responding promptly when speaking stops.
  - Added explicit `{ type: "stop" }` finalization signaling to the streaming WebSocket so Gemini Live immediately commits and emits the final verbatim transcript upon auto-stop or tap-to-stop.
  - Added robust automatic batch transcription fallback if real-time streaming produces an empty transcript, preventing speech loss.
  - Mapped `gemini-3.5-transcribe-live` to `gemini-2.0-flash` on the REST batch STT endpoint and wired active STT providers to the AI entry service.

### Fixed

- Routed existing voice conversations back into the full-screen voice chat interface when opened from conversation history or home screen widgets, preserving live captions and audio playback mode (`apps/mobile/src/features/assistant/AssistantScreen.tsx`).

## 2.26.6 — 2026-09-05

### Fixed

- Refreshed Android install fallback snapshot metadata (`apps/web/src/releases/androidRelease.json`).

## 2.26.5 — 2026-09-05

### Fixed

- Refreshed Android install fallback snapshot metadata (`apps/web/src/releases/androidRelease.json`).

## 2.26.4 — 2026-09-05

### Fixed

- Added auto-listening on voice chat launch with mic warm-up status indication (`apps/mobile/src/features/assistant/VoiceChatScreen.tsx`).
- Fixed assistant handling for bare "answer this" follow-up questions to retry and answer the preceding inquiry (`apps/api/src/assistant/`).
- Prioritized verified total-spend calculations before validation fallback in assistant responses.

## 2.26.3 — 2026-09-05

### Fixed

- Updated the Android install fallback metadata to 0.2.18-beta (versionCode 20318), including the release-build dummy-session sign-in fix notes (`apps/web/src/releases/androidRelease.json`).

## 2.26.2 — 2026-09-05

### Fixed

- Fixed mobile sync failing on release builds with "Dummy sessions are not available in this Zoption build" (`apps/mobile/src/auth/session-state.tsx`): authenticated Supabase sessions are now tracked via explicit session origin state rather than subject UUID matching, preventing legitimate user accounts from colliding with the development dummy subject.
- Purged stale development dummy session storage keys on non-development mobile builds (`apps/mobile/src/auth/session-state.tsx`) and reset local development token fallbacks to the canonical dummy UUID (`apps/api/src/auth.ts`).
- Refreshed the production release notes: the "What's new" list now advertises Android Beta 0.2.18 with the release-build sign-in fix instead of the stale 0.2.12 entry (`apps/web/src/releases/currentRelease.ts`).

## 2.26.0 — 2026-09-05

### Added

- Mobile development mode now connects directly to the local D1 user workspace
  and API Worker matching the web app, allowing testing against real financial
  records and live assistant threads instead of isolated dummy accounts.
- Added pull-to-refresh gestures across mobile screens (Dashboard, Transactions,
  Budgets, Subscriptions, Goals, Debts, and Assistant threads) for immediate data
  synchronization and refresh.
- Automated ADB port reverse forwarding (`tcp:8081` and `tcp:8787`) on mobile dev
  server startup for physical Android USB testing.

- Mobile voice input now shows live partial transcripts on dummy dev
  sessions (the local dev Worker accepts the dummy token, so the Dev build
  streams against the active STT model) and stops automatically after ~3s
  of silence using a mic-calibrated voice activity detector, transcribing
  the take without a tap.
- Voice-chat replies now type out letter by letter in sync with the spoken
  audio (mobile and web) instead of the full text appearing before the voice
  starts, with a caret while typing and a snap to full text when speech ends.
  Typing holds at the caret until audio is actually audible and never outruns
  the voice; mic audio is resampled to 16kHz client-side so non-16kHz hardware
  no longer transcribes as slowed-down speech.
- Voice-chat captions now support markdown bolding (`**bold**`) across web and
  mobile, cleanly rendering during both typewriter streaming and completed
  turns without exposing stray markdown delimiters.
- Enhanced Voice Chat UI and UX across web and mobile: moved the return button
  to the top left and centered the Voice Chat title on mobile, removed the "Text chat"
  label in favor of a clean accessible icon button, improved the "Checking your records…"
  animation across web and mobile with a rhythmic 4-bar equalizer scanner, breathing text,
  and card pulse, added real-time reactive waveform visualizers, tap-to-interrupt spoken playback,
  starter prompt suggestion chips for common financial questions, and a "New session" reset action.
- Refined the "You" indicator on chat bubbles into a structured micro-pill badge across
  Voice Chat and Text Chat on mobile and web, featuring subtle contrast borders, icon alignment,
  and a live pulsing status indicator (`You · Live`) during live speech recognition.
- Upgraded the Sphere (mic button) loading animation when checking records across mobile
  and web: added radiating concentric radar scan waves, an active breathing rhythm, and an
  inner dual-orbital gyro scanner with counter-rotating dashed/dotted rings around a pulsing
  sparkles core.
- Web voice conversation now supports live speech transcription and automatic
  stopping upon silence detection using adaptive audio calibration and browser
  speech recognition.
- Fixed a mobile render crash when leaving voice chat mid-recording: reading
  the native recorder after release threw a synchronous error that escaped as
  a red error screen. Recorder cleanup can no longer surface any error.
- Split the AI Financial Assistant into two conversation types: text chat
  (mic-in / text-out, with transcription filling the composer draft) and a new
  full-screen voice conversation started from "Voice chat" next to "New chat",
  featuring a talking orb with live captions and Bright Female spoken replies.
  Voice threads are marked with a Voice badge in history (thread kind
  `text | voice`, migration `0049`). The text composer no longer offers voice
  settings or spoken replies.
- Added multi-provider AI Assistant models: admins can now add API keys and
  activate configurations for OpenAI, Anthropic, Gemini, Meta, and Muse Spark
  in addition to DeepSeek at `/app/admin/provider-configs`, so a new model can
  be tested by switching the active assistant configuration.
- Added live model fetching to the Add configuration dialog: entering a key (or
  picking a saved credential) lists the models that key can access, and
  assistant configurations accept any model from a known provider instead of
  only the curated allowlist.
- Fixed the Add configuration dialog cutting off its Cancel/Add buttons on
  short screens (the popup now scrolls), paged through multi-page vendor model
  lists, and added manual model-ID entry so a model missing from a listing can
  still be saved.
- Fixed saving API keys for new providers failing with "The request could not
  be completed.": the credentials table had a database-level provider allowlist
  that only contained the legacy providers (migration `0048`), and credential
  creation now rejects unknown providers with a readable error instead of a
  blank 500.
- Fixed Muse Spark chat failing with "The assistant returned an invalid
  response.": Meta's endpoint only supports the default auto tool behavior, so
  forced `tool_choice` values are now omitted for that provider instead of
  being rejected by the vendor.

- Added shared budget payload and token helpers in `@zoption/shared` for envelope summaries, expiry-aware share tokens, and sanitized public snapshots.
- Added an interactive 50/30/20 budget calculator for Philippine pesos at `/tools/50-30-20-calculator` (`apps/web/src/pages/tools/`). It runs entirely client-side with no account, supports adjustable percentages, and allocates income in integer centavos using the largest-remainder method, so the three buckets always sum to exactly the amount entered instead of losing a centavo to independent rounding. Includes worked examples for ₱18,000, ₱30,000, and ₱50,000 take-home pay, and guidance on budgeting from take-home pay after SSS, Pag-IBIG, PhilHealth, and withholding tax.
- Added a public bank statement import cluster: an `/import` hub plus dedicated guides for BDO, BPI, MariBank, Bank of America, and Chase/JPMorgan (`apps/web/src/pages/import/`). Guide copy is driven by `importGuides.ts`, and the column headings each page advertises are read from the real `importPresets` in `packages/shared`, so a page cannot claim detection the importer does not perform. `importGuides.test.ts` fails if a guide references a preset that does not exist.
- Added a dedicated, contextual Thank You page (`/thank-you`, [`ThankYouPage.tsx`](file:///Users/dondon/Projects/Budget-and-expense-analysis-tool/apps/web/src/pages/ThankYouPage.tsx:1)) with tailored confirmation messaging, action triggers, and notes for account signup (`?flow=signup`), Pro plan upgrades (`?flow=pro`), bug report submissions (`?flow=report`), and customer reviews (`?flow=review`).
- Added an accessible Breadcrumbs navigation component ([`Breadcrumbs.tsx`](file:///Users/dondon/Projects/Budget-and-expense-analysis-tool/apps/web/src/components/navigation/Breadcrumbs.tsx:1)) with semantic `<nav>` and `<ol>` hierarchy, separator icons, and active page indicators, integrated across legal layouts, pricing, Android install, bug reports, and confirmation surfaces.
- Added explicit customer support response time promises across the platform: `<24 hours` for Pro priority support, `24–48 hours` for bug report reviews, and 24/7 instant AI guidance, documented on [`PricingPage.tsx`](file:///Users/dondon/Projects/Budget-and-expense-analysis-tool/apps/web/src/pages/pricing/PricingPage.tsx:53), [`SupportChat.tsx`](file:///Users/dondon/Projects/Budget-and-expense-analysis-tool/apps/web/src/components/support/SupportChat.tsx:444), and [`SupportReportsPage.tsx`](file:///Users/dondon/Projects/Budget-and-expense-analysis-tool/apps/web/src/pages/SupportReportsPage.tsx:126).
- Added a floating sticky mobile call-to-action bar on the landing page ([`LandingPage.tsx`](file:///Users/dondon/Projects/Budget-and-expense-analysis-tool/apps/web/src/pages/LandingPage.tsx:1888), [`LandingPage.css`](file:///Users/dondon/Projects/Budget-and-expense-analysis-tool/apps/web/src/pages/LandingPage.css:3168)) with solid styling, safe-area inset padding, and seamless offset for the mobile support launcher.
- Added a dedicated, pre-rendered public Pricing & Plans page (`/pricing`) featuring transparent Free Plan (₱0) vs. Pro Plan (₱149/mo, ₱1,299/yr) comparisons, detailed feature matrix, billing FAQs, and structured `WebPage` metadata to improve organic search discovery and eliminate the closed-app indexing barrier.
- Expanded AI search indexing with `public/llms-full.txt` and updated `public/llms.txt`, providing comprehensive product specifications, exact centavo arithmetic details, statement format support, and security boundaries for AI crawlers (Google-Extended, GPTBot, ClaudeBot, PerplexityBot, Applebot-Extended).
- Added `public/pricing` to the public route manifest, static prerender build pipeline, sitemap generator (priority `0.9`), trailing-slash redirects, and navigation menus.
- Separated AI/voice provider configuration from credentials: new `provider_credentials` table (`apps/api/src/db/provider-credentials.ts:1`) with `AES-256-GCM` encryption (`apps/api/src/provider-credentials/crypto.ts:1`, master key `PROVIDER_CREDENTIAL_ENCRYPTION_KEY`), reusable named credentials (`Name` + `••••last4`), per-provider reuse, manual global `Activate` with immediate `providerRegistry.invalidate()` (`apps/api/src/provider-registry.ts:303`) and provider-match validation (`apps/api/src/routes/admin-provider-configs.ts:27`).
- Added admin UI for credentials at `/app/admin/provider-configs` (`apps/web/src/pages/AdminProviderConfigsPage.tsx:1`): create/rotate/test/delete with `••••last4` only, `Used by` chips, `Display name` + `Credential` on configs, `Credential/Secret` terminology, `STT Bridge` health via `STT_BRIDGE_URL` for `google/chirp_3` (`packages/shared/src/types.ts:616`).
- Added Google Gemini 3.5 Transcribe STT models (`gemini-3.5-transcribe`, `gemini-3.5-transcribe-live`) to provider allowlist (`packages/shared/src/types.ts:618`) and adapter support for Google AI API keys (`AIza...`) with verbatim speech transcription (`apps/api/src/assistant/google-stt.ts:1`).
- Added dual-mode (tap to toggle or hold to talk) interaction to the microphone button (`apps/web/src/components/assistant/AssistantVoiceControl.tsx:544`) with immediate recording response on press, push-to-talk release handling, and accessible keyboard activation.
- Fixed WebSocket stream URL resolution (`apps/web/src/lib/api.ts:1060`) to use `VITE_API_URL` so real-time voice streaming connects to the Cloudflare Worker API on Cloudflare Pages preview deployments rather than the static Pages host.
- Unlocked the "Send automatically" voice submission option in preview environments (`apps/web/vite.config.ts:91`).
- Added direct API key input in Add Configuration and Edit Configuration dialogs at `/app/admin/provider-configs` (`apps/web/src/pages/AdminProviderConfigsPage.tsx:1`), allowing admins to directly name, enter, and toggle visibility for new provider credentials without navigating to a separate section.
- Added real-time live voice streaming on mobile (`apps/mobile/src/api/voice-stream.ts:1`) connecting native 16kHz PCM audio buffers to `/api/app/assistant/voice/stream` over WebSocket, displaying partial word transcripts live in assistant composer draft (`apps/mobile/src/features/assistant/AssistantScreen.tsx:333`) and transaction voice entry (`apps/mobile/src/features/transactions/TransactionVoiceEntry.tsx:77`) with automatic local recorder fallback.
- Added provider configuration deletion (`DELETE /api/app/admin/provider-configs/:id`) in backend repository (`apps/api/src/db/provider-configs.ts:86`) and admin routes (`apps/api/src/routes/admin-provider-configs.ts:176`) with confirmation dialogs, cache invalidation, audit logging, and protection against deleting active configurations.
- Redesigned `/app/admin/provider-configs` UI/UX with modern service tabs navigation (STT, LLM, TTS, Credentials, All Services), solid surface styling without gradients, active model badges, and responsive action controls (`apps/web/src/pages/AdminProviderConfigsPage.css:509`).
- Completed provider configuration admin UI at `/app/admin/provider-configs` (`apps/web/src/pages/AdminProviderConfigsPage.tsx:1`): added Edit Configuration modal to dynamically link/unlink credentials and update display names, enabled named Google API key selection when adding STT configs (with optional Cloud Run ADC bridge fallback), and fixed DB credential health tracking for Google STT.
- Added Google Chirp 3 STT provider (`stt.google chirp_3`) dedicated to `Speech-to-Text V2` (`apps/api/src/assistant/google-stt.ts:1`); REST kept only as health-check, not realtime.
- Added Cloud Run bridge spike for realtime STT (`apps/stt-bridge/server.js:1`, `ws` + `@google-cloud/speech@7.1.0` excluded from workspace `pnpm-workspace.yaml:3`) — `WebSocket` → `gRPC` `StreamingRecognize` `isFinal:false` partials with latency instrumentation (`t_mic_start`→`t_stream_open`→`t_first_partial`→`t_final`), auth stays in Cloud Run via `ADC` (`docs/realtime-stt-bridge.md:1`), no secret forwarded to browser/logs/PostHog/audit/D1. Worker proxy `GET /api/app/assistant/voice/stream` (`apps/api/src/routes/voice-stream.ts:1`).
- Added `STT_BRIDGE_URL` var (`apps/api/src/types.ts:40`, `wrangler.deploy.example.jsonc:40`) and `PROVIDER_CREDENTIAL_ENCRYPTION_KEY` dev var (`apps/api/.dev.vars.example:3`).

### Fixed

- Fixed mobile chat view not folding when typing, preventing the chat composer from being pushed off-screen or covered by the virtual keyboard (`apps/mobile/src/features/assistant/AssistantScreen.tsx`, `apps/mobile/src/features/support/SupportScreen.tsx`). Wrapped the chat container in `KeyboardAvoidingView`, configured list dismiss and tap persistence, and scrolled to the bottom on keyboard appearance.
- Updated assistant and support chat message sending UI to show outgoing messages as sent immediately without waiting spinners or sending status (`apps/mobile/src/features/assistant/AssistantScreen.tsx`, `apps/web/src/components/assistant/AssistantConversation.tsx`).

- Fixed mobile live transcription never producing partials on a physical Zoption Dev device (`apps/mobile/src/config/public-config.ts`). The dev API URL defaulted to `http://localhost:8787`, which is the phone's own loopback, so the voice-stream WebSocket never connected and every take silently fell back to batch. Zoption Dev now derives `http://<expo-host>:8787` from the Expo dev-server host, and the local API dev script listens on `0.0.0.0` so phones on the same WiFi can reach it.
- Fixed live voice input with `gemini-3.5-transcribe-live` failing after talking to the mic with "WebSocket connection to voice stream failed." (`apps/api/src/routes/voice-stream.ts`). The Worker waited for the outbound Gemini `fetch()` before returning the 101 upgrade, so a slow or hanging Google handshake left the browser socket in CONNECTING until it timed out. The client 101 is now returned immediately, Gemini is connected in the background, outbound upgrades use `https://` (Workers `fetch()` rejects `wss://`), header-mutating middleware is skipped for WebSocket upgrades, and Gemini JSON frames that arrive as `Blob` are decoded instead of dropped.
- Accepted Google AI Studio Auth API keys (`AQ....`) for Gemini Live. The stream route previously required the retired `AIza...` prefix, so a linked, decryptable Auth key was rejected as `gemini_missing_key`.
- Made the crawler policy a single source of truth. `dist/robots.txt` is generated by `prerender.mjs` on every build, so `apps/web/public/robots.txt` was overwritten before it ever shipped and the two files could disagree silently. The static file is deleted and the policy now lives in `apps/web/scripts/robots.mjs`, guarded by `apps/web/tests/robots.test.ts`. The generated file no longer repeats `Allow` rules for agents the Cloudflare managed block already `Disallow`s: two equally specific groups with conflicting directives have no defined winner, and crawlers resolve that tie restrictively, so the duplicate group could never help. One wildcard group allows those agents as soon as the edge stops blocking them.
- Made `prerender.mjs` fail with an actionable message instead of a bare `Expected exactly one SEO head marker, found 0`. It now prefers whichever of `dist/index.html` / `dist/spa.html` still holds the marker and snapshots `spa.html` from the resolved template instead of copying an already-rendered `index.html`. The client build's handoff manifest also moved from `dist/.zoption-deployment.json` to `apps/web/.zoption-build/deployment.json`, outside the deployed `dist/`, so prerender no longer has to delete its own input.
- Fixed the Add Configuration dialog at `/app/admin/provider-configs` silently doing nothing when the save failed (`apps/web/src/pages/AdminProviderConfigsPage.tsx:272`). Failures were reported through the page-level `errorMsg`, which renders in the page body underneath the dialog's full-viewport scrim, so a rejected save left the dialog open and the submit button re-enabled with no visible reason. The add dialog now surfaces the failure inside itself. This is what concealed the missing `PROVIDER_CREDENTIAL_ENCRYPTION_KEY` Worker secret: without it every API key save fails with HTTP 500 `encryption_not_configured`, and the admin saw only a dead click.
- Corrected stale `lastmod` / `dateModified` values for public routes in `apps/web/src/seo/siteMetadata.ts`. Dates were maintained in shared constants, so `/`, `/faq`, `/terms-of-service`, `/privacy-policy`, and `/cookie-policy` had drifted from their real content-change dates by up to 19 days, and `/faq` claimed a date four days _later_ than its content actually changed. Each route now has its own constant, and a test rejects dates set in the future.
- Fixed web live transcription silently producing no transcript with `gemini-3.5-transcribe-live` (`apps/api/src/routes/voice-stream.ts:121`). Worker-side sockets now set `binaryType = "arraybuffer"` before `accept()`; with `compatibility_date >= 2026-03-17` the runtime defaults to `"blob"`, and `new Uint8Array(blob)` reads 0 bytes, so every audio chunk was forwarded to Gemini as an empty payload with no error surfaced. The binary branch now also reads `Blob` frames explicitly as a safety net.
- Fixed "Voice processing returned an invalid response" on Google STT batch transcriptions by sanitizing the audio MIME type (stripping browser codec parameters like `;codecs=opus` which Google Generative Language `inlineData` rejected with HTTP 400), mapping Live-only model configurations (`gemini-3.5-transcribe-live`) to `gemini-2.0-flash` for batch REST fallback, classifying Google `API_KEY_INVALID` errors as configuration errors with actionable UI guidance, and upgrading the Gemini Multimodal Live WebSocket endpoint to `v1beta` (`apps/api/src/assistant/google-stt.ts:88`, `apps/api/src/routes/voice-stream.ts:114`).
- Billing now clears a `PayPal` `APPROVAL_PENDING` checkout immediately when the buyer cancels via `?checkout=cancelled` instead of remaining stuck on `Confirming your payment` until the 15-minute expiry. `POST /api/app/billing/reconcile` accepts `abortPendingCheckout` and supersedes the pending checkout without granting Pro.
- Pro checkout now loads all required PayPal JS v6 components (`paypal-payments`, `paypal-subscriptions`, `paypal-guest-payments`, `card-fields` per https://docs.paypal.ai/developer/how-to/sdk/js/v6/configuration) so the Debit or credit card guest option correctly appears inside the PayPal window when the buyer/merchant is eligible (previously only `paypal-subscriptions` was loaded, hiding card).

## 2.18.0 — 2026-08-26

### Added

- Added a Zoption-hosted Pro checkout with monthly and annual plan selection, PayPal-secured card or wallet authorization, and a hosted PayPal fallback when the embedded payment session is unavailable.
- Added a Visual Renewal Calendar Interface on the Subscriptions page (`/app/subscriptions`) featuring a Table vs. Renewal Calendar view switcher, cash-flow impact summary metrics (total outflow, paid to date, remaining to be paid), an interactive month-by-month grid with daily outflow pills and renewal badges, and a chronological payment schedule and upcoming billing cycles timeline.
- Added a dedicated, prerendered public Changelog and Release Notes page (`/changelog`) with full version history, feature highlights, and structured Schema.org metadata so automated crawlers and AI search engines can index shipped capabilities without client-side authentication.
- Added a direct Google Preferred Source link and FAQ guidance enabling users to prioritize Zoption with Google's Preferred trust badge in Google Search, Top Stories, and AI Overviews.
- Expanded `llms.txt` and `robots.txt` with explicit AI crawler permissions (Google-Extended, GPTBot, PerplexityBot, ClaudeBot, Applebot-Extended) and direct routes for FAQ, Android APK install, and product release notes.

### Changed

- Polished the web Plan pop-up dialog with comfortable width and typography, generous spacing, dynamic pricing hero headers, distinct tier badges, refined feature checklist indicators with excluded feature contrast, an annual discount badge (Save 27%), enhanced payment trust callouts, and clean solid token-based styling without gradients.
- Made routine financial edits feel immediate on web with optimistic transactions, accounts, categories, budgets, goals, debts, subscriptions, and calendar updates, including safe rollback and background reconciliation; mobile keeps its existing encrypted local-first writes and background sync behavior.
- Improved mobile account and category rows with clearer separation between icons, titles, and supporting descriptions.
- Replaced the category editor's code-first color field with named color choices and an optional custom-code input.

### Fixed

- Prevented Android category editing from resizing the entire screen when the keyboard opens.
- Clarified mobile transaction sync states and replaced the oversized sync-paused error with a compact retry banner that confirms local changes are safe.
- Prevented the mobile Budget tab's Add budget action from reopening and editing an existing category budget.
- Refreshed the public Android install metadata snapshot for the signed `0.2.16-beta` APK.

## 2.17.0 — 2026-08-25

### Added

- Added prominent header and floating add buttons, status filter chips, category emojis, payment account badges, and enhanced monthly cost metrics to the mobile Subscriptions tab.

### Changed

- Updated the mobile light theme to a crisp pure white palette instead of warm paper, and cleaned up theme labels in the mobile theme picker.
- Updated the mobile Budget tab month selector UI to match the Transactions tab design.
- Streamlined mobile tab header layouts and typography scales for compact screens.

## 2.16.1 — 2026-08-25

### Fixed

- Refreshed the public Android install metadata snapshot for the signed `0.2.15-beta` APK.

## 2.16.0 — 2026-08-25

### Added

- Added an interactive zero-budget state with 1-tap category quick-start limits on mobile.
- Added live assistant status indicators (Online/Available vs Offline/Unavailable) across the mobile More tab and Assistant screens with offline fallback navigation.
- Added explanatory debt payoff cards, response style summary, and rich fact source indicators to the web AI Assistant Memory panel.

### Changed

- Increased Free plan limits to 10 AI assistant questions per 14-day cycle (was 4) and 4 active custom categories (was 1), with Pro unchanged at 100 questions and unlimited categories.
- Renamed the mobile Transactions tab cash flow header label from `Net` to `Balance`.
- Redesigned the mobile Budgets screen with interactive month navigation, a comprehensive summary card, category spending progress bars, and emoji avatar badges.
- Redesigned the mobile update notification dialog with a scrollable changelog container and formatted bullet points for release notes.
- Redesigned the web AI Assistant Memory panel with clearer privacy messaging, strategy cards with interest vs momentum badges, and a safe clear-memory confirmation flow.

## 2.15.1 — 2026-08-24

### Fixed

- Refreshed the public Android install metadata snapshot for the signed `0.2.14-beta` APK.

## 2.15.0 — 2026-08-24

### Added

- Added a quick action bar to the mobile home dashboard for 1-tap transaction entry, receipt scanning, category budget reviews, and AI assistant queries.
- Added a recent activity card to the mobile home screen displaying the latest transactions with quick editor navigation.
- Added a structured 3-step onboarding guide to the mobile home screen for new workspaces.
- Added capability badges, interactive workspace preview, and value pillars to the mobile welcome landing screen.

### Changed

- Redesigned the mobile home balance card with a monthly net momentum indicator and per-account breakdown.
- Updated the mobile home month summary to a 2x2 grid layout with semantic icon badges and high-contrast tone styling.

## 2.14.0 — 2026-08-24

### Added

- Released Android Beta `0.2.13-beta` (`versionCode` 20313) to guarantee built-in starter categories display their default emoji icons across all mobile screens.

### Changed

- Made the mobile transaction-type filters collapse while scrolling and kept each daily date header visible until the next date group arrives.
- Limited dummy account sign-in and demo-data seeding to Zoption Dev, removing both capabilities from Zoption Beta and Preview builds.

### Fixed

- Prevented the mobile transaction-type filters from becoming stuck as a partially clipped strip during scrolling.
- Added default emoji icon fallback resolution and local SQLite migration 12 for mobile starter categories so default emojis appear reliably across all mobile views and existing databases.
- Added D1 migration 0045 to backfill starter category emojis and increment sync revisions for connected mobile clients.
- Formatted mobile in-app update patch notes as a bullet list and displayed release highlights in the web install page and release dialogs.

## 2.13.1 — 2026-08-24

### Fixed

- Refreshed the public Android install metadata snapshot for the signed `0.2.12-beta` APK.

## 2.13.0 — 2026-08-24

### Added

- Released Android Beta `0.2.12-beta` (`versionCode` 20312) with custom category emoji icons, redesigned Transactions ledger, native outline iconography, and cashflow chart polish.
- Added optional emoji icons for custom categories across the web and mobile apps, including default emojis for starter categories and a dedicated mobile categories management screen.

### Changed

- Refined mobile navigation and setup lists with flatter native-style outline icons, clean borderless list layouts, and quieter row spacing.
- Rebuilt the mobile Transactions tab around month navigation, daily date groups, monthly totals, streamlined tab views (Daily, Monthly, Summary), and actionable empty states for empty months and the home dashboard.

### Fixed

- Excluded spending in categories without a monthly limit from budget totals and over-budget amounts.
- Kept dashboard cards compact with a scrollable category list and rendered overlapping mobile cashflow series as unfilled solid and dashed lines.
- Restored the mobile month calendar and fixed cramped icon alignment in More, account, and category lists.
- Prevented Android transaction row text from collapsing into undersized columns and corrected the bottom spacing and circular add action.

## 2.12.1 — 2026-08-24

### Fixed

- Refreshed the public Android install metadata snapshot for the signed `0.2.11-beta` APK.

## 2.12.0 — 2026-08-24

### Added

- Released Android Beta `0.2.11-beta` (`versionCode` 20311) with a redesigned home dashboard and More hub, Material 3-inspired interaction polish, and refreshed in-app and launcher icons.
- Added a development workflow and demo workspace path for faster native UI iteration without affecting production account data.

### Changed

- Refined Android navigation, cards, forms, transaction rows, empty states, and theme controls for clearer hierarchy and touch feedback.

### Fixed

- Enforced valid PostHog crash telemetry configuration in signed APK and production OTA workflows, while preserving explicit local and remote kill switches and sanitized crash-only reporting.
- Hardened React Native Screens Fabric initialization when its UI manager is unavailable, and fixed merged icon imports and tab icon sizing so the Android release passes strict type and lint checks.
- Kept the admin customer-review selection stable when filtered results change.

## 2.11.2 — 2026-08-24

### Fixed

- Restored production PostHog web analytics by wiring the public project token into release builds, failing closed when it is missing, and verifying the ingestion origin during production smoke checks.

## 2.11.1 — 2026-08-24

### Fixed

- Refreshed the public Android install metadata snapshot for the 0.2.10 beta APK.

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
