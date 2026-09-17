# Review, main, 2026-09-17

**Reviewed by**: deepseek/deepseek-v4.1-flash (author on deepseek/deepseek-v4.1-flash)
**Independence limitation**: this runtime cannot select a reviewer model, so this is **not** an independent review. I am a fresh agent on the same model that wrote the code. I did not write it and have no memory of it, but I share its blind spots. Only a read by a different provider closes that gap.
**Scope**: 109 files, main vs origin/main (merge base 9acfef1, 21 commits, about 6498 insertions)
**Contract read**: AGENTS.md, docs/specs/web/0001-search-demand-pages.md, docs/specs/web/0002-signup-funnel-measurement.md, docs/scope/web/scope.md
**Suites run**: none. Every claim below comes from reading the diff, the surrounding files, and the installed dependencies.

**Verdict**: 🔴 Blocked

## Summary

This range ships four things: Tagalog voice and assistant language support across the API, web, and Android Beta; a six event cookieless signup funnel with rewritten policy copy; two peso guides and two feature explainer pages through the existing manifest pipeline; and a git history content freshness guard. The analytics work is the strongest part. The event module is a real boundary, the URL reduction genuinely holds (I confirmed against the installed posthog-js 1.418.10 that the hook still runs inside the SDK's own property calculation), and the consent and first import decisions match their spec. The content pipeline is also sound: the new routes ride the manifest into metadata, prerender, sitemap, and the guard rails. The language work is where the harm is. The mobile setting the Android commit is named after is persisted and then never loaded, so it resets on every launch. On web, Auto is English on the browser speech engine and on the Cloud Run bridge, and the browser engine now pre-empts the server transcription this same range taught to speak Tagalog, on two surfaces where the recording notice still names Cloudflare only.

## Blockers

### 🔴 The mobile voice language choice is written and never read, so it resets on every launch, `apps/mobile/src/stores/voice-language-store.ts:89`

**Problem**: the new store sets `skipHydration: true` and nothing in `apps/mobile` ever calls `useVoiceLanguageStore.persist.rehydrate()`. I checked the installed zustand 5.0.15: `apps/mobile/node_modules/zustand/middleware.js:472` calls `hydrate()` at creation only when `skipHydration` is not set, and the only public trigger otherwise is the `rehydrate` handle it returns. Grepping `apps/mobile`, the sole rehydrate call in the app is `useThemeStore.persist.rehydrate()` at `apps/mobile/src/ui/theme-provider.tsx:14`. So `merge` and `parsePersistedVoiceLanguage` are dead code on this path, and the store the pickers write to (`apps/mobile/src/ui/voice-language-picker.tsx:27`) and the hooks read from (`apps/mobile/src/features/assistant/assistant-voice-hooks.ts:90`, `apps/mobile/src/features/transactions/TransactionVoiceEntry.tsx:35`) always starts at the `"auto"` default. The store test is named "voice language store and persistence" (`apps/mobile/src/stores/voice-language-store.test.ts:7`) but only exercises the pure parser, never a hydration round trip.

**Why it matters**: commit `67a40af` is "add voice language selection, preferences, and bump version to 0.2.30". The preference half does not work on device. A user who picks Tagalog or English gets Auto again after every cold start, and every request then sends `lang=auto` (`apps/mobile/src/api/voice-stream.ts:105`, `apps/mobile/src/api/ai-entry.ts:56`, `apps/mobile/src/api/assistant-voice.ts:294`). The version bump also means this ships.

**Concrete scenario**: a Tagalog speaker opens More, picks Tagalog, records a transaction, closes the app, and reopens it. The picker reads Auto again and their transaction voice input is sent as Auto. Nothing they can do makes the setting stick, and the green suite never notices.

**Suggested fix**: mirror the theme store and call `void useVoiceLanguageStore.persist.rehydrate()` once per launch from a provider or the root layout, or drop `skipHydration` if reading SecureStore at import time is acceptable. Then add the round trip to the store test: persist a value, rehydrate, assert the language.

## Major

### 🟠 Auto mode reaches the Cloud Run bridge as English, `apps/api/src/routes/voice-stream.ts:536`

**Problem**: the route computes `isTagalog = requestedLang === "fil" || requestedLang === "tl"` and `isEnglishOnly = requestedLang === "en"` (`voice-stream.ts:197-199`), then sends `"x-language": isTagalog ? "fil" : "en"`. Every client now always sends `lang`, and always defaults it to `auto` (`apps/web/src/lib/api.ts:1146-1147`, `apps/mobile/src/api/voice-stream.ts:100-106`), so the bridge path is told `en` for every Auto user. The Gemini Live path in the same file treats Auto correctly (`["en-US", "fil-PH"]` at `voice-stream.ts:216-220` plus a bilingual system instruction at `voice-stream.ts:244-247`), so one setting behaves two ways depending on which backend a deployment has configured. The new tests pin the wrong default: `apps/api/tests/voice-stream.test.ts:531` asserts `x-language: "en"` when no query is present, and no test covers Auto.

**Why it matters**: Auto is the advertised default (`apps/web/src/lib/voiceLanguage.ts:20`, `apps/mobile/src/stores/voice-language-store.ts:23`), so on a bridge backed deployment the default setting is English streaming for people who never opened the setting.

**Concrete scenario**: a deployment with `STT_BRIDGE_URL` set and `chirp_3` active. A user on Auto says "magkano ang nagastos ko kahapon". The bridge receives `x-language: en` and returns English or nothing, while the same sentence on a Gemini Live deployment resolves correctly.

**Suggested fix**: pass the requested language through as three values (`auto`, `en`, `fil`) and let the bridge decide, or at minimum do not collapse Auto into `en`. Add the Auto case to the bridge test so the mapping is pinned by something.

### 🟠 The browser recognizer is English in Auto mode and now pre-empts the server transcription on two more surfaces, `apps/web/src/lib/voiceLanguage.ts:66-76`

**Problem**: `speechRecognitionLang("auto")` returns `fil-PH` only when `navigator.language` already starts with `fil` or `tl`; every other locale gets `en-US`, which is an English recognizer and does not "detect either language". That was survivable while only the hands free conversation used it. This range adds browser recognition to `AssistantVoiceControl.tsx:457-500` and `TransactionVoiceEntry.tsx:428-470`, and on both, a non empty `liveTranscriptRef` wins: `TransactionVoiceEntry.tsx:377-402` sends the browser text to `extractVoiceTransaction({ transcript })` and returns before the audio upload, and `AssistantVoiceControl.tsx:396-406` calls `onTranscript(liveText)` and returns before the batch fallback at `AssistantVoiceControl.tsx:430-434`. The skipped path is the Cloudflare Whisper and Google STT work this same range taught Tagalog (per language `initial_prompt` in `cloudflare-whisper.ts:60-66`, `fil-PH` codes in `google-stt.ts:200-205`). The browser callback and the WebSocket callback also write the same ref (`AssistantVoiceControl.tsx:465-481` against `AssistantVoiceControl.tsx:508-525`), so which engine owns the final text is decided by whichever fired last.

**Why it matters**: the shipped copy promises the opposite in three places: "Auto mode automatically detects English and Tagalog" (`apps/web/src/pages/SettingsPage.tsx` voice section, `apps/web/src/lib/voiceLanguage.ts:20`, `apps/mobile/src/stores/voice-language-store.ts:23`), "Auto, which detects either language" (`apps/web/src/pages/features/featurePages.ts:118`), and the changelog's "bilingual Auto detection". On a typical en-US Chrome the lowest quality engine wins and the Tagalog capable one is never asked.

**Concrete scenario**: a Manila user on an en-US Chrome leaves Auto on, opens the assistant, and says "gumastos ako ng dalawang daang piso sa tanghalian kanina". Chrome returns a phonetic English mangling, that text is used, and the recording is never sent for the Whisper transcription that would have produced the correct sentence.

**Suggested fix**: decide what Auto means on the browser path once, in one place. Keep browser recognition only for the explicit `en` and `fil` choices and let Auto use the server path, or run it as a partial preview and let the awaited live or batch result own the final text. Either way, stop returning before the batch fallback on an interim browser hypothesis, and fix the copy if Auto stays English there.

### 🟠 Microphone audio now reaches the browser vendor while the notice still names Cloudflare only, `apps/web/src/components/assistant/AssistantVoiceControl.tsx:781`

**Problem**: `SpeechRecognition` on Chrome streams microphone audio to Google, and on Safari to Apple. This range adds that engine to `AssistantVoiceControl.tsx:457-500` and `TransactionVoiceEntry.tsx:428-470` (the hands free conversation already had it at base). The notice the user accepts in `AssistantVoiceControl.tsx:781` still says "Your recording is sent to Cloudflare Workers AI for transcription" and names nothing else, and `CURRENT_ASSISTANT_VOICE_CONSENT_VERSION` is unchanged at 3 (`packages/shared/src/types.ts:540`), so no existing user is re-asked. The privacy policy's voice paragraph still names one destination: "sends the recording through Zoption's authenticated server to Cloudflare Workers AI's Whisper Large v3 Turbo model" (`apps/web/src/pages/legal/PrivacyPolicyPage.tsx:301-309`).

**Why it matters**: on a finance app the audio of a user describing a purchase reaches a processor the consent text does not name, and on the two surfaces added here the recording often never reaches Cloudflare at all, which makes the notice wrong rather than merely incomplete. This repo treats provider changes as consent relevant; the versioned voice consent exists for exactly that.

**Concrete scenario**: a user reads "sent to Cloudflare Workers AI", accepts, speaks a transaction in Chrome, and Google's speech service receives the audio while the Cloudflare request is skipped.

**Suggested fix**: name the browser speech service wherever the recording is disclosed, and decide deliberately whether that is a new consent version. If Cloudflare should stay the only processor, make browser recognition an explicit choice instead of silent behaviour.

### 🟠 The 0.2.30 bump ships without refreshed in app patch notes, `apps/web/src/releases/currentRelease.ts:37`

**Problem**: `67a40af` raises `apps/mobile/package.json` to `0.2.30-beta` and `app.config.ts` `versionCode` to 20330 and records "Prepared Android Beta 0.2.30 (versionCode 20330) mobile release" in CHANGELOG.md, but `currentRelease` still ends with an "Android Beta 0.2.29" entry and mentions nothing about voice language. AGENTS.md says: "Check for stale patch list notes on production when releasing. Make sure to update the patch list as needed before releasing." Every previous bump did exactly this in its own commit (`5ed7e18` 0.2.29, `db7d332` 0.2.28, `14a6d50` 0.2.27, all titled "bump version and refresh in-app patch notes").

**Why it matters**: the "What's new" panel and its one time acknowledgement read this file, so the 0.2.30 build credits 0.2.29 and never tells a tester that voice language exists. The release checklist is broken in the one place the checklist names.

**Suggested fix**: refresh `currentRelease` and its test with the Tagalog entries and the 0.2.30 marker before the release commit.

## Minor

### 🟡 Two copies of the "is this Tagalog" rule, `apps/api/src/assistant/date-range.ts:65` and `apps/api/src/assistant/compliance-policy.ts:10`

**Problem**: `isTagalogMessage` and `isTagalogComplianceMessage` are two long word lists of the same shape with nearly the same vocabulary, each deciding independently whether to answer in Tagalog. They already differ (compliance adds money and legal words, date range does not).

**Why it matters**: this is a domain rule used in two places, which is the case where extraction is warranted rather than a single use wrapper. A Tagalog financial term added to one list silently leaves the other answering English.

**Suggested fix**: keep one shared helper and let topic specific words stay with their topic patterns.

### 🟡 `lang` is not validated at the boundary and is silently dropped on both transcript paths, `apps/api/src/routes/ai-entry.ts:78`

**Problem**: the multipart branch reads `const lang = (form.get("lang") as string | null) || context.req.query("lang") || "auto"`, which accepts any value and lies about the type when a multipart part is a File. `assistant-voice.ts:47` does the same. Meanwhile the JSON transcript branch never reads the field at all (`ai-entry.ts:50-73`), and the multipart transcript branch parses `lang` and then discards it (`ai-entry.ts:79-95`), while both clients send it (`apps/web/src/lib/api.ts:1475`, `apps/mobile/src/api/ai-entry.ts:123`).

**Why it matters**: AGENTS.md asks for validation at I/O, and a value that selects provider prompts should be the `VoiceLanguage` union that already exists in `packages/shared/src/types.ts:606`. Today the damage is limited to falling into the auto branch, but the parameter is threaded and unread, which hides whether that path was considered.

**Suggested fix**: parse once at the route into `"auto" | "en" | "fil"`, default anything else, type the service parameter as `VoiceLanguage`, and either use `lang` on the transcript path or stop sending it.

### 🟡 The browser speech recognition shim is copy pasted into three components, `apps/web/src/components/transactions/TransactionVoiceEntry.tsx:23-69`

**Problem**: about forty lines of `SpeechRecognition` interfaces plus roughly forty five lines of identical setup, result accumulation, and silence stop logic now exist in `TransactionVoiceEntry.tsx:23-69` and `AssistantVoiceControl.tsx:26-72`, with a third variant in `AssistantVoiceConversation.tsx`. The four copy pasted `zoption-voice-lang-change` listeners are the same story. Nothing shares any of it.

**Why it matters**: the logic is reused rather than single use, so the usual "no wrapper" rule does not apply, and the copies have already diverged (Auto is handled differently per surface). The next language or permission change has to be made in three places.

**Suggested fix**: one small helper or hook (start, accumulate, stop, report a partial) that all three surfaces call.

### 🟡 `first_import_committed` can fire for a commit that inserted nothing, `apps/web/src/pages/ImportPage.tsx:280`

**Problem**: the decision is `transactionTotal === data.importedCount`. On an empty workspace a successful commit that inserted zero rows gives `0 === 0` and fires the event, although the workspace still holds nothing. The same comparison is duplicated at `apps/web/src/components/onboarding/SpreadsheetMigrationWizard.tsx:305`.

**Why it matters**: this is the activation metric the slice exists to produce, and the spec wording is "the workspace held no transactions before the commit", which a zero row commit does not satisfy.

**Suggested fix**: require `data.importedCount > 0` as well, and cover it in the import page test.

### 🟡 The e2e skip comment contradicts the CI order it was written for, `e2e/public-content-routes.spec.ts:63-67`

**Problem**: the comment says "the CI e2e job currently runs before the web build, so there may be nothing to read", but the same commit (`6aae018`) moved both web builds ahead of `pnpm test:e2e` in `.github/workflows/ci.yml:36-59`, and the production build that runs last writes `apps/web/dist/sitemap.xml`, which is exactly the fallback this test reads. I confirmed the suite still runs against the Vite dev server (`playwright.config.ts:36`), so the fallback file is the only sitemap in CI.

**Why it matters**: the skip is the only signal this test gives when it does nothing, and a stale comment sends the next person debugging a skip to the wrong place.

**Suggested fix**: rewrite the comment to match the workflow (the dev server has no sitemap, the CI build output does).

### 🟡 The URL guarantee now rests on a hook PostHog marks deprecated, with no real payload test, `apps/web/src/analytics/PostHogAnalytics.tsx:65`

**Problem**: `sanitize_properties` is still applied in posthog-js 1.418.10 (I read the call in `_calculate_event_properties` inside the installed `apps/web/node_modules/posthog-js/dist/module.no-external.js`), so the leak is genuinely closed. But the same bundle carries `"sanitize_properties is deprecated. Use before_send instead"` and logs it through its error logger every time the hook runs. The test calls the exported sanitizer directly (`apps/web/tests/posthog-analytics.test.tsx`) rather than capturing through the SDK and inspecting the whole payload.

**Why it matters**: the privacy promise in the cookie and privacy policies depends on a hook the SDK has announced it will remove, and a future upgrade that stops calling it fails no test. `before_send` is also the stronger tool, since it can drop an event instead of rewriting one.

**Suggested fix**: move to `before_send`, or leave a comment naming the deprecation and the upgrade work. Add one capture through the real SDK asserting the complete payload has no query string or fragment.

### 🟡 AC-3's claim audit covers the explainer pages only, `apps/web/tests/feature-pages.test.tsx:94-100`

**Problem**: the banned claim blocklist (`PDF`, `iOS`, `App Store`, `Play Store`, `aggregateRating`) runs over `FEATURE_PAGES` alone. Two of the four new pages are guides, and `packages/shared/tests/finance-guides.test.ts` checks structure, counts, and slugs but asserts nothing about claims.

**Why it matters**: the spec's critical test scenario is a claim audit for the four new pages, and the guide copy is the half with statements about the product ("On the web app a file can be CSV, XLSX, or XLS, and the Android app also reads PDF statements"). Today that sentence is accurate, which is exactly the property the guard exists to keep.

**Suggested fix**: run the claim audit over the new guide entries too, allowing the Android only PDF wording deliberately, or state in the test why guides are excluded.

### 🟡 AC-3's "unreadable total" branch has no test, `apps/web/src/analytics/workspaceTransactionTotal.ts:37-39`

**Problem**: the spec names three first import scenarios, and two are covered (`apps/web/tests/import-page.test.tsx:812` and `:836`). Nothing exercises the third: a rejected `getTransactions` must fire no event. The catch that returns `undefined` is the only thing standing between a failed read and a false activation count.

**Why it matters**: the failure branch is the one that protects the metric, and a reused cache key (`[...allTransactions(workspace), "total"]`) is a plausible way for it to be hit in the field.

**Suggested fix**: add a case with `getTransactions` rejecting and assert no `first_import_committed`.

## Nits

- ⚪ `apps/api/src/assistant/cloudflare-whisper.ts:80-106`, the re indent stops halfway through the method, so the body is now indented two levels deeper than the code it contains. `pnpm lint` does not check formatting and CI does not run `format:check`, so this is style only, but `pnpm format` would rewrite it.
- ⚪ `apps/web/src/lib/voiceLanguage.ts:19`, the `auto` option declares `speechRecognitionLang: "en-US"` while `speechRecognitionLang("auto")` can return `fil-PH`; the field has no readers, so it is dead metadata that already contradicts the function beside it.
- ⚪ `apps/web/src/components/assistant/AssistantVoiceConversation.tsx:137`, `VOICE_SUGGESTED_PROMPTS_ENGLISH` is an alias with no readers.
- ⚪ `apps/web/src/components/assistant/AssistantVoiceControl.tsx:26` and `apps/web/src/components/transactions/TransactionVoiceEntry.tsx:23`, imports placed after constant declarations; TypeScript hoists them, but the rest of the repo keeps imports at the top.
- ⚪ `docs/voice-live.md:89` still says bridge forwarding adds only the tenant hash and `x-t-mic-start`; this range adds `x-language` to that list (and `x-zoption-user` predates it).
- ⚪ `docs/assistant.md` was not touched by the Tagalog work, so the new prompt rule in `prompt.ts`, the Tagalog compliance redirects and disclaimer, and the Tagalog period clarifications are undocumented there while CHANGELOG.md carries them.
- ⚪ The voice language copy reads like an account preference ("Choose your default voice language") while the web value lives in localStorage and the mobile value in SecureStore, so the choice does not follow the user across browsers or devices. A word about the device would close it.
- ⚪ `apps/mobile/src/api/voice-stream.ts:106` logs the full WebSocket URL, access token included. This line predates the change, but the change edits the line above it, so it is cheap to fix now.

## Strengths

- The funnel module is the right shape for a privacy sensitive feature: a closed event union, a capture time allow list keyed to the same union, a per page load guard held in memory, and a try/catch that keeps analytics out of every user flow. The tests attack it at the boundary that matters (an `email`, `amount_minor`, and `tenant_id` payload is stripped, and the no key path stays silent).
- The URL reduction is genuinely complete rather than patched at call sites. I verified in the installed SDK that the hook runs inside `_calculate_event_properties` after the page view properties are merged, and that `cookieless_mode: "always"` means the session props manager is never constructed, so no `$session_entry_*` property can carry a query string either. Excluding `$referrer` as well as `$current_url` was not asked for and is correct.
- The first import decision follows the spec's reasoning rather than the obvious design: reading the workspace total after the commit through a query with `staleTime: 0`, and failing closed to no event, is what makes the step accurate without touching a shipped Android contract.
- The Tagalog STT plumbing is careful where it counts: per language `initial_prompt` for Whisper, explicit `fil-PH` and `en-US` ordering per Google API shape, `inputAudioTranscription.languageCodes` plus a bilingual instruction on the Gemini path, and `relativePeriod` deliberately evaluated before `namedMonth` so the Tagalog month names cannot hijack "ngayong buwan". The new bridge and Gemini tests cover `fil` and `tl` end to end.
- The content pipeline was extended, not reinvented: `FeaturePagePath` is a closed union derived from the data module and spread into `PUBLIC_ROUTE_PATHS`, so a page that is not registered fails typecheck in the router and the metadata record, and the freshness guard's own self tests (every route mapped, every mapping real) keep the new family honest.

## Test coverage

Test signal is **configured** (root vitest, Playwright, and a CI job that runs lint, typecheck, tests, both web builds, e2e, and Lighthouse). I did not run any suite, so this is a reading assessment.

Well covered: the funnel union, property stripping, once per page load behaviour and the no key path; each wired funnel surface at least once; the first import decision for both the fires and the does not fire case; the web voice language helpers including cross tab events; the API language routing for Gemini, Google STT, and the bridge; the feature pages, their manifest registration, and their cross links; the mobile picker and hooks.

Gaps that matter, in order:

- Nothing exercises hydration for the mobile store. That is why the blocker above is invisible to a green suite, and why a test named after persistence passes without testing it.
- Nothing asserts what Auto means on the browser recognition path or on the Cloud Run bridge. Both behaviours contradict the copy, and the bridge test asserts the wrong default as if it were intended.
- Nothing tests the browser recognition blocks themselves, including the case where the browser transcript skips the batch upload, which is the regression this range introduced.
- The unreadable total branch from AC-3 and the zero row commit edge are untested.
- The policy claim audit covers two of the four new pages.
- The posthog guarantee is asserted at the module boundary, not through a capture.

## Relation to the earlier review of this range

The prior review (`docs/reviews/2026-09-17-main-all-changes.md`) reached the same headline conclusions. I formed the mobile hydration blocker and the bridge `x-language` major from the diff before reading it, and independently confirmed both (zustand 5.0.15 `middleware.js:472`, and the bridge header at `voice-stream.ts:536` with the client default at `api.ts:1146`). Findings of its that I checked and that stand: the Auto English behaviour on the browser path including the pre-emption, the undisclosed browser speech processor and unchanged consent version, the 0.2.30 patch notes gap, the duplicated Tagalog heuristic, the unvalidated `lang` boundary value, the dropped `lang` on the transcript path, the copy pasted recognition shim, the deprecated posthog hook, the stale e2e comment, the zero row first import, and the per device wording gap. Its "fixed" list also holds up: I re verified the URL sanitizer in the installed SDK, the consent capture in the success path (`AssistantConsent.tsx:12-20` behind `mutateAsync`), and the post commit total read.

Where I differ, or add something it did not carry:

- It did not run the suites either, but it did not flag two coverage gaps that AC-3 names directly as critical test scenarios: the unreadable total branch, and the claim audit stopping at the explainer pages while two of the four new pages are guides.
- Its note that the freshness guard "relied on the earlier slice review" for the guide claim audit is the same gap seen from the other side, and it is worth a guard rather than a re read.
- It did not mention the mixed indentation left in `cloudflare-whisper.ts`, the stale `docs/voice-live.md` header list, or that the browser recognizer races the WebSocket callback for the same ref in `AssistantVoiceControl.tsx`. The race matters because it makes the final transcript nondeterministic on a surface that now runs two engines at once.
- Its read of the CI reorder is correct. What it left implicit is worth stating plainly: the suite still runs against the Vite dev server (`playwright.config.ts:36`), so the reorder makes the test read the production build output on disk rather than a served sitemap, and the skip still fires on a fresh checkout with no build.
