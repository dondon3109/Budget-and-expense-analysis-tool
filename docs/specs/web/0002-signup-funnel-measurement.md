# 0002. Measure the signup funnel from a first page visit to a first import

**Date**: 2026-09-17
**Status**: Proposed

## Summary

Add a small set of cookieless conversion events so the signup to first import metric can be read at all. Six events cover a landing visit, a signup attempt, an app session, a first import, assistant consent, and a first assistant question. Nothing new is installed and no event carries financial or identity detail. The first import step is decided from the workspace's own transaction total, read with a request the app already makes, so no shared response contract changes.

## Context

The web scope names signup to first import as the metric that decides whether the growth slice worked, and nothing measures it today. The only analytics on the site is a cookieless `$pageview` for eligible public URLs, and the eligibility rule deliberately excludes the signup, login, and private app routes. The Worker has a PostHog path, but it only emits `$ai_generation` events and only behind the AI observability flag.

The privacy boundary is deliberate and worth keeping: PostHog runs cookieless, with memory persistence, no person profiles, no autocapture, and no session recording. So the funnel has to be readable inside that boundary rather than by widening it. Two consequences follow. First, every event must be anonymous metadata, with no email, name, amount, category, or account identifier, or the boundary breaks. Second, "the first import" cannot be guessed from a browser flag if it is going to mean anything, so the import commit response has to say how many transactions the workspace now holds.

The cost of not deciding is that the growth work ships blind: content pages land, and nobody can tell whether the people who arrive from search ever reach a first import.

## Requirements

**User stories**:

- As the product owner, I want to see how many people who start a signup reach a first import, so that I can tell whether content and onboarding actually convert.
- As a privacy conscious user, I want conversion measurement that carries no financial detail and no identity, so that using the product does not cost me privacy.

**Acceptance criteria**:

- **AC-1**: the six events in the table below fire on their named surfaces with the named properties and nothing else.
- **AC-2**: no event carries an email, name, amount, category, account, or tenant identifier, free text, or a persistent identifier, and no cookie is written. A session means one page load, so every once per session flag lives in memory only.
- **AC-3**: `first_import_committed` fires only when the workspace held no transactions before the commit, decided by reading the workspace transaction total through the existing transactions list request before the commit. When that total is unknown, still loading, or the request failed, no event fires, and the import commit response and its shared schema stay unchanged.
- **AC-4**: with `VITE_POSTHOG_KEY` unset, or when PostHog fails, every wired surface behaves exactly as before and no error reaches the user.
- **AC-5**: the cookie policy and the privacy policy name the conversion events in plain words, including the promise that they carry no financial detail.
- **AC-6**: focused tests cover the event module (fixed schema, gating, no identifiers) and each wired surface.

## Options considered

### Option 1: A narrow client event module plus one count field (chosen)

One small module owns the event names, the property schema, and the gating. The client surfaces call it. The first import step reads the workspace transaction total that the transactions list already returns.

**Pros**:

- The event set is fixed in one file, so a later change is visible in review and covered by one test.
- No new dependency, no new environment variable, and no server analytics pipeline.
- The first import step is accurate, because it reads the workspace's own transaction total, and no shipped client contract changes.

**Cons**:

- The first import step needs one extra lightweight read of the transaction total on the import surfaces.
- Cookieless identity rotates, so a funnel that spans days is approximate.

### Option 2: Server side events from the Worker

Emit the account and import steps from the Worker, where the workspace data already lives.

**Pros**:

- The strongest data, independent of the client and of ad blockers.

**Cons**:

- A second PostHog pipeline next to the AI observability one, with its own flag, its own failure handling, and its own privacy review.
- The visitor side of the funnel still needs client events, so both paths end up in the codebase.

### Option 3: Derive activation from workspace data only

Measure account creation and first import by querying D1, and capture no new events at all.

**Pros**:

- Nothing new leaves the browser, and the numbers are exact.

**Cons**:

- No readout without building an operator report, and the middle of the funnel, a signup attempt, stays invisible.

## Decision

**Chosen option**: Option 1: A narrow client event module plus one count field.

A single `apps/web/src/analytics/funnel.ts` module owns the event names, the property schema, and the gating, and the first import step is decided in the client from the workspace transaction total that the existing transactions list request already returns.

## Rationale

The existing PostHog client already runs cookieless with the strictest settings available, so a narrow event set reuses a reviewed boundary instead of opening a second one. Keeping the event names and the property schema in one module is what makes AC-2 checkable: a test can assert the union of names and that no property key from a banned list ever reaches the payload.

Reading the workspace transaction total answers the real question, which is whether this commit was the workspace's first transaction, without changing a contract that already shipped. An extra key on the import commit result was the obvious design and is wrong: that response is decoded with a strict schema, so a fourth key makes every commit fail on Android builds that are already installed. A browser flag would be wrong in the other direction, resetting with storage clearing and firing again for the same person. The read the app already makes is the only option that is both accurate and safe.

The accepted tradeoff is cookieless identity. PostHog rotates the anonymous identifier, so a funnel that spans several days cannot be joined per person. Within a session and a day it is exact, and the alternative, a persistent identifier, is exactly what this product promises not to keep.

## Feature design

**Data model sketch**: no database change and no API change. The only new state is in memory for the length of a page load: the funnel module flags that keep an event to once per session. The first import decision reads `TransactionListResponse.total` from the existing transactions list request, through one small hook (`apps/web/src/analytics/useWorkspaceTransactionTotal.ts`) shared by the import page and the migration wizard.

**API surface**: unchanged. Every value comes from an existing response or from the client surface named below.

**Event surface**:

| Event                       | Surface                                        | Properties                                                    | Fires when                                                                                                                 |
| --------------------------- | ---------------------------------------------- | ------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `signup_viewed`             | signup page                                    | none                                                          | the signup page mounts                                                                                                     |
| `signup_submitted`          | signup page                                    | `outcome`: `confirmation_required` \| `signed_in` \| `failed` | a submit attempt resolves                                                                                                  |
| `app_session_started`       | private app bootstrap                          | none                                                          | the first authenticated bootstrap in a page load                                                                           |
| `first_import_committed`    | import page and the dashboard first run wizard | none                                                          | a commit succeeds, the workspace transaction total was read as zero, and no first import event has fired in this page load |
| `assistant_consent_granted` | assistant provider consent                     | none                                                          | the assistant provider consent is accepted                                                                                 |
| `assistant_first_question`  | assistant composer                             | `surface`: `chat` \| `voice`                                  | the first question sent in a browser session                                                                               |

**Value sourcing**:

| Action             | Value produced / displayed   | Source                                                                                                                                              |
| ------------------ | ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Signup submit      | `outcome`                    | The signup call result: a session means signed in, a confirmation requirement means confirmation, an error means failed                             |
| App bootstrap      | session step                 | The authenticated session and resolved tenant in the private app startup gate                                                                       |
| Import commit      | first import decision        | The workspace transaction total from the existing transactions list request, read before the commit; zero means the commit is the workspace's first |
| Assistant consent  | consent granted              | The assistant consent accept handler                                                                                                                |
| Assistant question | first question and `surface` | The composer send handler, once per session                                                                                                         |

**Key invariants**:

- The event names are a closed union; an unknown name is a type error, not a runtime string.
- No property value is free text, and no property is a financial value, an identifier, or an email.
- `first_import_committed` fires at most once per page load, and only from a workspace whose transaction total was read as zero before the commit. An unknown total means no event, never a guess.
- The import commit response and its shared schema are unchanged, so installed Android builds keep working.
- Analytics never blocks or alters a user flow.

**Security model**: events are anonymous and cookieless, carry no financial or identity data, and are sent only from the surfaces named above. The transaction total read for the first import decision stays in the browser and is never sent as an event property.

**Configuration required**: none. `VITE_POSTHOG_KEY` and `VITE_POSTHOG_HOST` already exist.

**Critical test scenarios**:

- Happy path: a signup submit, an app bootstrap, and a commit into a workspace whose transaction total read as zero each capture their event with the exact schema, verifies AC-1.
- Privacy: the event module refuses or strips any banned property key, and no wired surface passes an email or an amount, verifies AC-2.
- Failure case: with no PostHog key, or with capture throwing, signup, bootstrap, import, and assistant flows behave identically, verifies AC-4.
- First import: a commit into a workspace that already holds transactions does not fire the first import event, an unreadable total fires nothing, and the import commit response shape is unchanged, verifies AC-3.

## Build plan

1. Add the funnel module with the closed event union, the property types, and the gating, satisfies **AC-1**, **AC-2**, **AC-4**
2. Wire `signup_viewed` and `signup_submitted` into the signup page, satisfies **AC-1**, **AC-6**
3. Wire `app_session_started` into the private app bootstrap, satisfies **AC-1**
4. Read the workspace transaction total on the import surfaces through the existing transactions list request and wire `first_import_committed` for both commit surfaces, satisfies **AC-3**
5. Wire `assistant_consent_granted` and `assistant_first_question`, satisfies **AC-1**
6. Update the cookie policy and privacy policy copy to name the events, satisfies **AC-5**
7. Add the focused tests for the module and each wired surface, satisfies **AC-6**

## Consequences

**Positive**:

- The metric the growth slice is judged by becomes readable, with the first import step anchored in workspace data.
- The event set and its privacy boundary are reviewable in one file.

**Negative / tradeoffs**:

- Cookieless identity rotates, so multi day funnels are approximate and should be read as session funnels.
- Each import surface makes one extra lightweight read of the transaction total.
- Policy copy now makes a promise that the code must keep, so every future event needs the same review.

**Neutral**:

- The signup page becomes a tracked surface for these two events only, while remaining ineligible for pageviews.

## Follow-up

- [ ] Build the PostHog insight or dashboard that draws the funnel from these events.
- [ ] If session level funnels prove too coarse, revisit a server side activation count rather than a persistent client identifier.
