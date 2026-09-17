# Review, main, 2026-09-17

**Reviewed by**: DeepSeek (this runtime cannot select a reviewer model)
**Mode limitation**: this agent cannot pick a reviewer model, so this is **not** a cross model review. I am a fresh agent on the same model family as the author (deepseek-v4.1-flash): I did not write this code and have no memory of it, but I share its blind spots. An independent read from another provider is the only way to close that gap.
**Scope**: 108 files, ~6311 insertions, 20 commits, `git diff origin/main..HEAD` (everything unpushed on main)
**Contract read**: `AGENTS.md`, `docs/specs/web/0001-search-demand-pages.md`, `docs/specs/web/0002-signup-funnel-measurement.md`, `docs/scope/web/scope.md`, `docs/reviews/2026-09-17-main.md` (the earlier slice review)
**Verdict**: 🔴 Blocked

## Summary

The change set ships the Tagalog voice and assistant language work, a six event cookieless signup funnel with rewritten privacy copy, two peso guides and two feature explainers, a git-history content freshness guard, and a mobile voice language setting. The two analytics blockers from the earlier slice review are genuinely addressed: the full private URL no longer leaves the browser (I re-verified `sanitize_properties` against the installed posthog-js 1.418.10, which applies it in `_calculate_event_properties` after the page-view properties are merged), and the consent question is now answered in copy rather than code, consistently with `cookieless_mode: "always"` and `person_profiles: "never"`. The language work is where the harm is. The mobile preference the whole feature rests on is never loaded from storage, so the setting resets on every launch; on web, "Auto" is silently English-only on the browser speech path and on the Cloud Run bridge, and the browser's recognizer now pre-empts the server's Tagalog-capable transcription without any update to the voice consent notice or its version.

## Blockers

### 🔴 The mobile voice language preference is written but never read, so it resets on every app launch, `apps/mobile/src/stores/voice-language-store.ts:89`

**Problem**: the new store sets `skipHydration: true` and nothing in the mobile app ever calls `useVoiceLanguageStore.persist.rehydrate()`. I grepped the whole app: the only hydration call in the repository is `useThemeStore.persist.rehydrate()` at `apps/mobile/src/ui/theme-provider.tsx:14`, and I confirmed against the installed zustand that `skipHydration: true` means `hydrate()` is never invoked at creation (`apps/mobile/node_modules/zustand/middleware.js:472`). The store's `merge` and `parsePersistedVoiceLanguage` fail-closed logic is therefore dead code, and the test that claims to cover persistence (`apps/mobile/src/stores/voice-language-store.test.ts:7`, "voice language store and persistence") only exercises the pure parser, never a hydration round trip.

**Why it matters**: this commit's headline feature is "choose your default voice language". On Android Beta 0.2.30 the choice is persisted to SecureStore but ignored: every cold start shows Auto selected and every request sends `lang=auto`, so the user's explicit Tagalog or English selection is silently discarded. It is also a write-over hazard: the first `setLanguage` call of a session persists the in-memory default over the value the user saved last time.

**Concrete scenario**: a Tagalog speaker opens More → Voice language, picks Tagalog, records a transaction successfully. They close the app, reopen it, and the picker reads Auto again. Nothing they do makes the setting stick, and no test notices because the suite never hydrates.

**Suggested fix**: mirror the theme store: call `void useVoiceLanguageStore.persist.rehydrate()` from one provider (or the root layout) mounted once per launch, or drop `skipHydration` if the SecureStore read is safe at import time. Add the round trip to the store test: write a value, rehydrate, assert the language.

## Major

### 🟠 "Auto" is English-only on the browser speech path, and the browser transcript pre-empts the server's Tagalog-capable transcription, `apps/web/src/lib/voiceLanguage.ts:66-76`

**Problem**: `speechRecognitionLang("auto")` returns `fil-PH` only when `navigator.language` already starts with `fil` or `tl`; every other locale gets `en-US`. Browser `SpeechRecognition` with `lang="en-US"` is an English model, so on an en-US Chrome the recognizer does not "detect either language". Worse, the recognizer's output is treated as the final transcript and short-circuits the server path: in `AssistantVoiceControl.tsx:397-406` (new in this change set) and `TransactionVoiceEntry.tsx:377-405`, a non-empty `liveTranscriptRef` is handed to `onTranscript`/`extractVoiceTransaction` and the code returns before the batch fallback at `AssistantVoiceControl.tsx:430-434`. That fallback is the Cloudflare Whisper / Google STT path that this same change set taught to transcribe Tagalog (per-language `initial_prompt`, `fil-PH` language codes). Net effect: on the two surfaces that gained browser recognition, any user whose browser locale is not Filipino loses the server transcription whenever the browser returns any text at all.

**Why it matters**: the shipped copy promises the opposite in three places: "Auto mode automatically detects English and Tagalog" (`apps/web/src/pages/SettingsPage.tsx` voice section, `apps/mobile/src/ui/voice-language-picker.tsx` description), "Auto, which detects either language" (`apps/web/src/pages/features/featurePages.ts:118`), and the changelog's "bilingual Auto detection as the default mode". The one non-English default the feature claims is the one it does not deliver on the majority of browsers, and it degrades to a lower-quality transcription rather than falling back to the good one.

**Concrete scenario**: a Manila user on an en-US Chrome opens the assistant, leaves the language on Auto, and says "gumastos ako ng dalawang daang piso sa tanghalian kanina". Chrome's en-US recognizer returns a phonetic English mangling; the recording is never sent for Cloudflare Whisper transcription, which would have produced the correct Tagalog text with the new prompt. The composer holds the mangled sentence and the amount may be lost.

**Suggested fix**: decide what Auto means on the browser path and encode it in one place. Cheapest honest options: keep browser recognition only when the chosen language is `en` or `fil` and let Auto use the server path; or run browser recognition as a partial-transcript preview only, and let the awaited live/batch result own the final text. Either way, stop returning before the batch fallback when the browser result is an interim hypothesis, and change the copy if Auto stays en-US on that path.

### 🟠 Auto mode is sent to the Cloud Run bridge as English, `apps/api/src/routes/voice-stream.ts:536`

**Problem**: the worker derives `isTagalog = lang === "fil" || lang === "tl"` and `isEnglishOnly = lang === "en"` (`voice-stream.ts:197-199`) and then sends `"x-language": isTagalog ? "fil" : "en"`. Both clients now always send `lang`, defaulting to `auto` (`apps/web/src/lib/api.ts:1146-1147`, `apps/mobile/src/api/voice-stream.ts:100-106`), so the bridge path receives `x-language: en` for every Auto user. The Gemini Live path in the same file handles Auto correctly (`["en-US", "fil-PH"]` plus a bilingual system instruction), so the same setting behaves differently depending on which backend the deployment has configured. The new bridge tests lock in the wrong default: `apps/api/tests/voice-stream.test.ts:531` asserts `x-language: "en"` when no query is present, and there is no Auto case.

**Why it matters**: Auto is the default the settings screen advertises, and on a bridge-backed deployment it is English-only streaming. Tagalog speech is then transcribed by an English model for the users who never touched the setting.

**Concrete scenario**: a deployment with `STT_BRIDGE_URL` set and a non-live Google model active. A user on Auto says "magkano ang nagastos ko kahapon". The bridge is told `en` and returns English or an empty transcript, while the same sentence on a Gemini-live deployment resolves correctly.

**Suggested fix**: send the requested language through unsanitized as a three valued signal (`auto` | `en` | `fil`) and let the bridge decide, or at minimum send `fil` only for `fil`/`tl` and omit/keep `auto` for the rest rather than collapsing Auto into `en`. Add the Auto case to the bridge test so the mapping is pinned.

### 🟠 Browser speech recognition sends microphone audio to the browser vendor with no update to the voice notice or the consent version, `apps/web/src/components/assistant/AssistantVoiceControl.tsx:781`

**Problem**: this change set adds `webkitSpeechRecognition`/`SpeechRecognition` to `AssistantVoiceControl.tsx:450-500` and `TransactionVoiceEntry.tsx:421-470` (the hands-free conversation surface already had it at base). On Chrome that audio is streamed to Google, on Safari to Apple. The consent copy the user accepts still names one processor and one destination: "Your recording is sent to Cloudflare Workers AI for transcription" (`AssistantVoiceControl.tsx:781`, `AssistantVoiceConversation.tsx:923`), the AI entry consent says "sends only the photo, PDF, or recording you choose to AI during that request" without naming the browser service (`apps/web/src/components/receipts/ReceiptConsent.tsx:18`), and the privacy policy's voice subprocessor list names only "Cloudflare Workers AI and Fish Audio" (`apps/web/src/pages/legal/PrivacyPolicyPage.tsx:192-193`). `CURRENT_ASSISTANT_VOICE_CONSENT_VERSION` is still 3 (`packages/shared/src/types.ts:540`), so no existing user is re-asked.

**Why it matters**: on a finance app, the audio of a user describing what they bought now reaches a processor the consent text does not name, and in the case where the browser recognizer supplies the text the recording never reaches Cloudflare at all, which makes the notice factually wrong rather than merely incomplete. The repo already treats this class of change as consent-relevant (the versioned voice consent exists precisely for provider changes), which is why this is a Major and not a copy nit.

**Concrete scenario**: a user accepts voice input after reading "your recording is sent to Cloudflare Workers AI", speaks a transaction in Chrome, and Google's speech service receives the recording instead; the Cloudflare request may never be made. An auditor comparing the policy's subprocessor list with network traffic finds a processor nobody disclosed.

**Suggested fix**: disclose the browser speech service wherever the recording is disclosed (the two voice notices and the consent copy), and decide deliberately whether that is a new consent version. If the intent is to keep Cloudflare as the only processor, gate the browser recognizer behind an explicit setting instead of enabling it silently.

### 🟠 The Android 0.2.30 bump ships without refreshing the in-app patch notes, `apps/web/src/releases/currentRelease.ts:37`

**Problem**: `67a40af` raises `apps/mobile/package.json` to `0.2.30-beta` and `app.config.ts` `versionCode` to 20330 and records "Prepared Android Beta 0.2.30 (versionCode 20330) mobile release" in `CHANGELOG.md`, but `currentRelease` still lists `version: __APP_VERSION__` with an "Android Beta 0.2.29" change and `releasedOn: "September 16, 2026"`, and no entry for voice language. Every previous bump in this repo refreshed that file and its test in the same commit (`5ed7e18`, `db7d332`, `14a6d50`), and `AGENTS.md` says explicitly: "Check for stale patch list notes on production when releasing. Make sure to update the patch list as needed before releasing."

**Why it matters**: the "What's new" panel and the one-time acknowledgement are driven by this file and keyed to the shipped version, so the 0.2.30 build tells users about 0.2.29 features and never mentions the language setting they are being asked to try. It also breaks the repo's own release checklist in the one place the checklist names.

**Concrete scenario**: a tester installs 0.2.30, opens What's new, and sees the 0.2.29 notes with no mention of voice language; the release note and the app disagree on what shipped.

**Suggested fix**: refresh `currentRelease` (and `apps/web/tests/current-release.test.ts`) with the Tagalog voice entries and the 0.2.30 marker before the release commit, as the previous bumps did.

## Minor

### 🟡 The language is dropped on the transcript extraction path, `apps/api/src/routes/ai-entry.ts:50-95`

**Problem**: the clients send `lang` on the JSON transcript request (`apps/web/src/lib/api.ts:1475`, `apps/mobile/src/api/ai-entry.ts:123`) and the form branch reads it into `lang` at line 78, but both transcript branches call `service.extractVoiceTranscript(env, tenantId, transcript[, categories])`, which takes no language. The value is parsed and discarded.

**Why it matters**: either the reply language is meant to influence extraction (then Tagalog input on this path silently runs the generic bilingual prompt), or the parameter should not be sent at all. Threading a parameter that nothing reads is the kind of drift AGENTS.md's "smallest change" rule exists to prevent, and it hides whether the path was considered.

**Suggested fix**: either pass the language into `extractVoiceTranscript` and use it, or stop sending `lang` on that request. One line either way.

### 🟡 The language parameter is not validated at the HTTP boundary, `apps/api/src/routes/assistant-voice.ts:47`

**Problem**: `const lang = (form.get("lang") as string | null) || context.req.query("lang") || "auto"` casts without checking: a multipart part named `lang` that is a `File` is truthy and is passed down as if it were a string, and any arbitrary query value is accepted. `AssistantVoiceService.transcribe` types it as `language?: string` and the providers compare it to literals, so today the damage is limited to falling into the auto branch, but the boundary now feeds a value that selects provider prompts without validating it against the `VoiceLanguage` union that exists in `packages/shared/src/types.ts:606`.

**Why it matters**: it is the I/O boundary rule from `AGENTS.md` ("validate at I/O"), and the same value is echoed into provider request prompts. A File part also produces a confusing type lie that a future consumer could dereference.

**Suggested fix**: parse it once at the route into `"auto" | "en" | "fil"` (rejecting or defaulting anything else) and type the service parameter as `VoiceLanguage`.

### 🟡 The browser speech-recognition shim is copy-pasted across three components, `apps/web/src/components/transactions/TransactionVoiceEntry.tsx:23-69`

**Problem**: about forty lines of `SpeechRecognition` interfaces plus roughly forty-five lines of identical setup, accumulation, and silence-stop logic now appear in `TransactionVoiceEntry.tsx:23-69` and `AssistantVoiceControl.tsx:33-69`, with a third variant already in `AssistantVoiceConversation.tsx`. Nothing shares them, and `apps/web/src/lib/voiceLanguage.ts` is already the natural home for the language-dependent part.

**Why it matters**: this is reused logic, so the "no single-use wrapper" rule does not apply; three copies of a third-party integration shim will drift, and the divergence is already visible (the `auto` handling differs by surface). The next language or permission change has to be made in three places.

**Suggested fix**: extract one small hook or helper (start, accumulate, stop, on partial) and have all three surfaces call it.

### 🟡 The funnel URL fix uses a deprecated posthog hook and is not tested against a real payload, `apps/web/src/analytics/PostHogAnalytics.tsx:65`

**Problem**: `sanitize_properties` is deprecated in posthog-js 1.418.10 and the SDK logs `"sanitize_properties is deprecated. Use before_send instead"` through its error logger on every capture (visible in the installed `dist/main.js`). The new test calls the exported sanitizer directly with a hand-built object (`apps/web/tests/posthog-analytics.test.tsx:127-151`) rather than running a real capture and inspecting the whole payload, which is exactly the gap the earlier review identified. `apps/web/tests/funnel.test.ts:47-49` still says out loud that it only asserts the arguments handed to `posthog.capture`.

**Why it matters**: the protection now depends on a hook the SDK has announced it will remove, and on that hook being invoked for every event type. The suite would not fail if a future posthog-js release stopped calling it, which is the failure mode the original blocker had.

**Suggested fix**: switch to `before_send` (which can drop an event outright) or add a comment naming the deprecation and the upgrade work. Add one test that captures through the real SDK and asserts the complete payload, including system properties, carries no query string or fragment.

### 🟡 The e2e sitemap comment contradicts the CI order it was written for, `e2e/public-content-routes.spec.ts:63-67`

**Problem**: the comment says "the CI e2e job currently runs before the web build, so there may be nothing to read", but the same commit (`6aae018`) moved both web builds ahead of `pnpm test:e2e` (`.github/workflows/ci.yml:36-59`) with a comment saying the reorder exists so this spec stops skipping. The spec's own fallback now reads `apps/web/dist/sitemap.xml`, which the preceding production build writes.

**Why it matters**: stale comments mislead the next person debugging a skip, which is the only signal this test gives when it silently does nothing.

**Suggested fix**: rewrite the comment to match the workflow (dev server has no sitemap; the CI build output does).

### 🟡 Two different "is this Tagalog" heuristics now encode the same domain rule, `apps/api/src/assistant/compliance-policy.ts:10`

**Problem**: `isTagalogComplianceMessage` (`compliance-policy.ts:10`) and `isTagalogMessage` (`apps/api/src/assistant/date-range.ts:67`) are two word lists with the same shape and largely the same vocabulary, differing only in topic words. Each module decides independently whether to answer in Tagalog.

**Why it matters**: the two will drift, and a phrase added to one (for example a new Tagalog financial term) silently leaves the other answering English. This is a domain rule, which is the case where `AGENTS.md` says extraction is warranted.

**Suggested fix**: move one helper into a shared assistant module and let topic-specific words stay with their topic pattern.

### 🟡 The first-import event can fire for a commit that inserted nothing, `apps/web/src/pages/ImportPage.tsx:280-283`

**Problem**: the decision is `transactionTotal === data.importedCount`. On an empty workspace a commit that inserts zero rows satisfies `0 === 0` and fires `first_import_committed`, even though the workspace is still empty. The UI disables commit when `acceptedCount === 0` (`ImportPage.tsx:1303`), but rows accepted in the preview can still be rejected or skipped server-side, so a zero-row success is reachable. The same check is duplicated in `SpreadsheetMigrationWizard.tsx:305-307`.

**Why it matters**: the one activation metric the slice exists to produce can count an import that never happened, and the spec's own wording ("the workspace held no transactions before the commit") is not what the code tests in that case.

**Suggested fix**: require `data.importedCount > 0` alongside the equality, and cover it in the existing import-page test.

### 🟡 Stored voice language is per-browser on web and per-device on mobile with no copy saying so, `apps/web/src/pages/SettingsPage.tsx:107-146`

**Problem**: the web setting lives in `localStorage` (`apps/web/src/lib/voiceLanguage.ts:42-60`) and the mobile setting in SecureStore; neither is attached to the account, and the settings copy ("Choose your default voice language...") implies a preference that follows the user. A user who sets Tagalog on their phone still gets Auto on a laptop and in a different browser.

**Why it matters**: this is a small honesty gap in user-facing copy rather than a defect, but it is the same class of claim-vs-code mismatch the review is asked to check, and it is cheap to fix in words.

**Suggested fix**: say the choice applies to this device or browser, as the cookie policy already does for consent.

## Nits

- ⚪ `apps/web/src/lib/voiceLanguage.ts:19`, the `auto` option declares `speechRecognitionLang: "en-US"` while `speechRecognitionLang("auto")` (line 66) can return `fil-PH`; the field is never read anywhere, so it is dead metadata that already contradicts the function.
- ⚪ `apps/web/src/components/assistant/AssistantVoiceConversation.tsx:137`, `VOICE_SUGGESTED_PROMPTS_ENGLISH` is an alias with no readers (not even the tests).
- ⚪ `apps/web/src/components/assistant/AssistantVoiceControl.tsx:26` and `apps/web/src/components/transactions/TransactionVoiceEntry.tsx:23`, imports placed after constant declarations; TypeScript hoists them, but every other file in the repo keeps imports at the top.
- ⚪ `docs/assistant.md` was not touched by the Tagalog work: the new prompt rule, Tagalog compliance redirects and disclaimer, and Tagalog period clarifications are undocumented there while the changelog carries them.
- ⚪ `CHANGELOG.md:18`, "Prepared Android Beta 0.2.30 (versionCode 20330) mobile release" sits in a `feat(mobile)` commit; the repo's history keeps the version bump in its own release commit, and `AGENTS.md` asks that version numbers not move as a side effect of feature work.
- ⚪ `apps/web/tests/feature-pages.test.tsx:94-100`, the claim audit is still a five-string blocklist; worth the comment the earlier review asked for, that it is a floor and not the review.

## Earlier findings: fixed and still open

**Fixed**

- 🔴 _Funnel events ship the private page URL._ Fixed. `sanitizeAnalyticsProperties` is registered as `sanitize_properties` (`apps/web/src/analytics/PostHogAnalytics.tsx:65`) and rewrites `$current_url` and `$referrer` to origin + path. I verified the hook is applied in `_calculate_event_properties` after the page-view properties are merged, so it does cover what the earlier review proved was leaking. Residual gap: no real-payload test (see Minor above).
- 🔴 _Funnel capture ignores the cookie consent gate._ Resolved by the other fix the earlier review allowed: the policy now states that this cookieless, non-identifying measurement runs without an Analytics choice and that the Analytics and Marketing categories gate future providers (`apps/web/src/pages/legal/CookiePolicyPage.tsx:34-52`, `apps/web/src/pages/legal/PrivacyPolicyPage.tsx:82-95`). The code is unchanged by design, and the copy matches the initialisation options (`cookieless_mode: "always"`, `persistence: "memory"`, `person_profiles: "never"`). This is a product decision now on the record, which is what the earlier review asked for.
- 🟠 _Assistant consent counted before the grant resolves._ Fixed: the capture moved into the success path of `AssistantConsent.accept()` (`apps/web/src/components/assistant/AssistantConsent.tsx:12-20`) with `mutateAsync` behind it. The spec line it contradicted now holds.
- 🟠 _First import decided on a cached total._ Fixed along the suggested lines: `readWorkspaceTransactionTotal` reads through `queryClient.fetchQuery` with `staleTime: 0` inside the commit success path and fails closed (`apps/web/src/analytics/workspaceTransactionTotal.ts:20-38`), and the old hook is gone rather than wrapped.
- 🟡 _Feature explainers carry two hand-kept dates._ Fixed: `apps/web/tests/feature-pages.test.tsx:63-74` derives the long form from the ISO constant and asserts equality.
- 🟡 _Cookie policy says PostHog does not track authenticated activity._ Fixed: section 5 now names the six conversion steps and what they never carry (`CookiePolicyPage.tsx:95-106`), and `docs/deployment.md` was updated to match.
- 🟡 _Freshness guard direction and FAQ exclusion._ The guard is documented in `docs/seo.md` with the route-to-source map. The FAQ copy exclusion is **not** fixed (below).

**Still open (unchanged by this change set)**

- 🟡 `apps/web/src/seo/contentSources.ts:50`, `/faq` still maps to `FaqPage.tsx` only, while the visible FAQ copy remains in `siteMetadata.ts`.
- 🟡 `apps/web/src/pages/features/featurePages.ts:40-41` and `contentSources.ts:29-32`, the shared-source limitation of the freshness guard stands: several routes share one source file and are checked against the newest declared date among them, so a page-specific stale date still passes.
- 🟡 `apps/web/src/pages/SignupPage.tsx:87-91`, the social sign-in path still produces no `signup_submitted`, so Google signups enter the funnel at step one and reappear at step three.
- 🟡 `apps/web/src/pages/LandingPage.tsx:586-613`, the receipt spotlight still promises "merchant name, date, subtotal, sales tax, and line items", and this change set adds the link from that panel to the explainer that claims only merchant, date, total and category.
- ⚪ `signup_viewed` remains outside the once-per-page-load set, so remounting the signup page counts the first step again. That matches the spec's wording, so it stays the author's call.
- ⚪ `packages/shared/src/financeGuides.ts`, `relatedLinks.to` is still a plain `string`.

## Strengths

- The URL fix is the right shape and, as far as I can verify statically, complete: the sanitizer runs inside the SDK's own property calculation rather than at the call sites, so every event (not just the funnel module) loses the query string and fragment, and the earlier review's exact leak can no longer occur. Excluding `$referrer` as well was not asked for and is correct.
- The Tagalog STT work is careful where it counts: Google STT gets explicit `fil-PH`/`en-US` ordering per mode and per API shape, Cloudflare Whisper gets a language-appropriate `initial_prompt`, the Gemini path gets `inputAudioTranscription.languageCodes` plus a bilingual system instruction, and the date-range parser deliberately orders `relativePeriod` before `namedMonth` so that the English word "may" and the Tagalog "may" do not hijack "ngayong buwan". The 394 new lines of `voice-stream.test.ts` cover `fil` and `tl` end to end including the header the bridge receives.
- The receipt and import claims on the new feature pages are actually backed: a scanned receipt is turned into a one-row CSV and committed through the same import pipeline (`apps/web/src/pages/ImportPage.tsx:186-207`), which is where `import_fingerprint` duplicate detection lives, so "the same check it uses for imported statement files" is true rather than marketing.
- The mobile store's persisted-state parsing fails closed to `auto` on malformed or unknown values, and the picker/badge share one store, so there is one source of truth for the selected language on that platform once hydration is fixed.
- The funnel module remains a good boundary: a closed event union, a capture-time allow list, and a per-page-load guard, with the dangerous part (what the SDK adds) now handled in one place.

## Test coverage

Test signal: **configured** (vitest from the root; Playwright for `e2e/`; CI runs lint, typecheck, pnpm test, both web builds, e2e and Lighthouse). I did not run the suites for this review; the assessment below is from reading the tests and the wiring.

Covered and genuinely useful: the funnel union and its stripping of `email`/`amount_minor`/`tenant_id`, the once-per-page-load guard, the silent no-op without a key, each wired surface at least once, the URL/referrer sanitizer as a unit, the language store's parser and the web `voiceLanguage` helpers including cross-tab events, the API language routing for Gemini and the bridge (`fil` and `tl`), and the feature-page/sitemap/metadata registration.

Not covered, and these are the gaps that matter:

- Nothing exercises hydration for the new mobile voice-language store, which is why the blocker above is invisible to a green suite.
- Nothing asserts what "Auto" means on either the browser recognition path or the Cloud Run bridge, so the two behaviours that contradict the copy pass review.
- Nothing tests the browser speech-recognition code paths themselves (the three copied blocks), including the case where the browser transcript pre-empts the batch fallback.
- The posthog integration is still asserted at the module boundary: the sanitizer is tested directly rather than through a real capture, so the deprecated-hook dependency is untested.
- The transcript extraction path's dropped `lang` has no test on either client, which is consistent with nothing reading it.

## Coverage notes (what I did not read line by line)

Area 1 (Tagalog/language) is where I went deepest: the API provider, route, policy and date-range diffs in full, the web voice libs and the three voice surfaces in full or in the relevant regions, the mobile store, picker, hooks and API plumbing in full, and the new tests by inspection. Area 2 I verified against the installed posthog-js source and both policy documents. Area 3 I checked the page data, manifest, sitemap wiring, receipt/import duplicate path and the e2e/accessibility additions; I relied on the earlier slice review for the guide copy audit, which I did not repeat. Area 4 I read the guard and the CI diff, not every guard test case. Area 5 I did not read the 332-line mobile `AssistantVoiceConversation` rewrite in full, nor the CSS files in any area, nor `apps/web/scripts/prerender.mjs`, nor the Lighthouse configuration. The mobile UI copy and accessibility roles in the new picker were read but not exercised.
