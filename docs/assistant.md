# AI Financial Assistant

Zoption's AI Financial Assistant is a read-only budgeting and financial-wellness interface over the authenticated user's financial workspace. DeepSeek interprets questions and explains verified results; Zoption's Worker owns tenant scope, compliance classification, date resolution, financial calculations, data-quality checks, and final-answer validation.

## Data flow

1. The browser sends one user message and an idempotency UUID to `/api/app/assistant/*` with the normal Supabase bearer token.
2. Existing Worker middleware verifies the JWT and resolves the user's D1 tenant.
3. The Worker loads bounded tenant-owned chat history and creates a trusted turn policy. The policy classifies regulated topics, resolves dates in `Asia/Manila`, and identifies required tool groups.
4. Ambiguous dates and personalized regulated-topic recommendation requests receive deterministic server responses without a DeepSeek call or AI-question charge.
5. Provider-backed turns call `deepseek-v4-flash` with the trusted policy, bounded history, approved tool definitions, and no tenant or user identifier.
6. While required tool groups remain unsatisfied, the Worker requires tool use. It validates every argument against strict schemas and the server-resolved date range before running tenant-scoped reads or calculations.
7. The Worker validates the final answer against successful tool output. Unsupported money, percentages, dates, counts, internal identifiers, unsafe formats, named-filter substitutions, and disallowed regulated recommendations are rejected. One corrective retry is allowed; otherwise Zoption returns a deterministic safe fallback.
8. D1 stores the user message, final answer, structured response metadata, and a sanitized run/tool audit snapshot. Raw provider payloads, hidden reasoning, credentials, notes, secrets, tenant IDs, and user IDs are not stored in the audit trail.
9. When metadata-only PostHog AI Observability is enabled, each real DeepSeek call emits a deferred `$ai_generation` event containing only random trace/span IDs, provider/model, latency, token counts, call sequence, finish/error categories, tool-choice mode, and deployment environment. Questions, answers, history, financial records, tool definitions/names/arguments/results, credentials, and Zoption identifiers are excluded.
10. Threads, messages, runs, and tool snapshots share the thread's 90-day retention lifecycle and are deleted together. PostHog metadata is retained separately under the current 12-month event-retention plan. PostHog controls provider-side retention enforcement and deletion timing, so those events do not disappear when a chat is deleted and may remain through that provider retention period.

The browser cannot submit a tenant ID, model, system prompt, tool definition, assistant message, or tool result.

## Allowed tools

- `get_account_balances` — balances calculated from recorded transaction ledger entries, optionally filtered to a tenant-owned account.
- `get_period_summary` — income, expenses, net, savings rate, monthly averages, and bounded trends for the trusted date range.
- `get_spending_by_category` — category totals and an optional exact named-category filter.
- `get_budget_vs_actual` — monthly and category budget limits, actual spending, remaining amounts, utilization, and full/partial-month coverage.
- `detect_recurring_charges` — recurring expense patterns and backend-calculated price movement over a labeled trailing analysis window.
- `detect_spending_anomalies` — unusual transactions and category spikes compared with labeled prior windows; returns insufficient history rather than guessing.
- `calculate_debt_payoff` — deterministic avalanche or snowball projections from saved debts or validated hypothetical inputs.
- `calculate_savings_goal` — deterministic target-date contributions from a saved goal or validated hypothetical inputs.
- `list_transactions` — a bounded filtered page of transaction details without notes or internal IDs. It is detail-only and must not be totaled by the model.
- `list_categories` — active category names and kinds.

There is no SQL, D1, arbitrary HTTP, environment, credential, secret, import, create, update, or delete tool. Tenant identity is injected by the Worker and is never model-visible.

## Account balances

Account balances are sums of the user's recorded transaction ledger entries. They are not live bank balances and Zoption does not currently store an opening-balance snapshot.

- A balance can omit activity that occurred before the user began recording or importing transactions.
- An account with no recorded ledger entries appears as zero, which does not prove the real-world account has a zero balance.
- Imported and manually entered transactions affect the calculated ledger balance.
- The assistant always discloses the ledger/opening-balance limitation when reporting balances.

## Goals and debts

Users explicitly manage savings goals and debt records on the **Goals & debt** page. Chat never extracts, creates, edits, or deletes these records.

- Savings goals contain a target, current saved amount, target date, and status. Required monthly contributions use integer-centavo ceiling division and assume no investment return.
- Debt records contain a balance, fixed APR, minimum payment, balance-as-of date, and status. Avalanche and snowball projections apply monthly interest, pay minimums first, roll released payments forward, use stable tie-breakers, detect non-amortizing inputs, and stop at a 600-month safety cap.
- Projections are educational estimates based on the saved or hypothetical inputs; they are not lender statements or guaranteed outcomes.

## Compliance and disclaimers

Budgeting, cash-flow, savings, and debt-planning support are allowed. Investment, tax, retirement, insurance, estate, and legal topics are limited to general education. A request for a personalized regulated recommendation receives a deterministic jurisdiction-neutral redirect to an appropriately qualified professional.

The assistant surface always displays an educational-use notice. Topic-specific disclaimers come from structured backend metadata, not model-authored legal text.

## Data quality and provenance

Each financial tool returns structured source and data-quality metadata. Relevant signals include thin history, uncategorized or unassigned records, possible exact duplicates, legacy import provenance, possible merchant/category inconsistency, and possible coverage gaps. Heuristic findings are labeled as possible, not certain.

Assistant responses can display:

- the requested and comparison periods;
- canonical account, category, goal, or debt filters;
- record counts;
- data-quality status and limitations; and
- an expandable **Data used** view.

Historical messages without structured metadata continue to render normally.

## Consent, retention, and deletion

Assistant consent is versioned. Consent version 5 explains that the question and necessary tenant-scoped financial context may be sent to DeepSeek; that validated tool arguments plus compact sanitized results are retained with the chat for up to 90 days; that the assistant may keep a short-term memory of durable preferences and facts across chats; that PostHog receives metadata-only AI operational events without question, answer, financial, tool-payload, credential, or internal-identifier content; and that those PostHog events are subject to the current 12-month project retention plan. Existing users must accept version 5 before another assistant turn.

Users can delete one chat or all chats sooner. D1 foreign-key cascades remove messages, assistant runs, and tool-call snapshots with the thread. A daily Worker cron deletes expired threads in bounded batches, and thread listing also performs tenant-scoped lazy cleanup. PostHog metadata has a separate lifecycle under the current 12-month project event-retention plan. PostHog controls provider-side retention enforcement and deletion timing, and deleting a D1 chat does not delete its anonymous PostHog events.

## Assistant memory

The assistant keeps a tenant-scoped memory so users do not have to repeat durable facts in new chats:

- **Preferences** (for example the avalanche or snowball debt payoff strategy) can be set in the assistant Memory panel and are remembered across threads.
- **Facts** are extracted after each completed provider-backed turn by a deterministic server-side pass (goals, emergency-fund targets, debt strategy mentions). When a turn clearly contains deeper durable signals, a capped, bounded model-assisted pass enriches the facts; it is limited per tenant and never fails a completed turn.
- **Thread summaries** preserve older conversation context beyond the bounded history sent to the model.

Memories live in `assistant_memories` (kind `preference`, `fact`, or `summary`), are stored as sanitized untrusted text with the same 90-day lifecycle as chats, and are cleared when the user clears memory or deletes all chats. In the model prompt, memory is marked as data, never instructions: it may personalize context and tone but never satisfies a required tool group and never replaces a tool lookup (saved goals and debts are always read fresh through the approved tools).

## Assistant usage cycles

Free tenants receive 4 provider-backed assistant questions per 14-day cycle, and Pro tenants receive 100. A tenant's first provider-backed question establishes an immutable cycle anchor. Each later period is an exact 14×24-hour interval from that anchor; inactivity can skip elapsed periods but never shifts or restarts the cadence.

Deterministic clarifications, date-resolution prompts, and compliance redirects do not consume assistant usage. Provider-backed usage is consumed immediately before the provider call, so an upstream timeout or provider failure still counts. File imports remain on their separate Manila calendar-month allowance.

## Security controls

- Supabase credentials and sessions remain in Supabase and the browser's authenticated session flow.
- `DEEPSEEK_API_KEY` and `POSTHOG_PROJECT_TOKEN` are Worker secrets and never appear in browser configuration, D1, tool payloads, or logs.
- PostHog uses random telemetry-only IDs as `distinct_id`, sets `$process_person_profile` to `false`, disables GeoIP enrichment, replaces the capture source address with the non-routable `0.0.0.0` placeholder, sends no identify/group events, and has no stable user, tenant, thread, message, request, or D1 run identifier.
- PostHog capture is one bounded batch scheduled with Cloudflare `waitUntil()`, uses a short timeout, and is best-effort; capture failure cannot change an assistant result, error mapping, D1 cleanup, or readiness.
- Assistant-cycle usage is consumed only immediately before a provider-backed turn; deterministic clarifications and compliance redirects do not consume an AI-question allowance.
- One short lease prevents concurrent sends in the same thread.
- Client request UUIDs make completed turns idempotent.
- Tool names, JSON arguments, result size, history size, date ranges, page sizes, provider calls, and total tool calls are bounded.
- Stored names and transaction descriptions are untrusted data, not instructions.
- Assistant output and metadata are rendered as React text, not HTML.
- Operational logs contain status and diagnostic categories, not messages, tool payloads, account names, transaction descriptions, JWTs, or keys.

## Configuration

Non-secret Worker variables:

- `ASSISTANT_ENABLED=true`
- `DEEPSEEK_MODEL=deepseek-v4-flash`
- `ASSISTANT_TIME_ZONE=Asia/Manila`
- `ASSISTANT_PROVIDER_TIMEOUT_MS=12000`
- `ASSISTANT_OVERALL_TIMEOUT_MS=25000`
- `POSTHOG_AI_OBSERVABILITY_ENABLED=false` until the target environment is verified
- `POSTHOG_HOST=https://us.i.posthog.com`
- `POSTHOG_AI_ENVIRONMENT=preview` or `production`

Keep `DEEPSEEK_MODEL` on `deepseek-v4-flash`. The legacy `deepseek-chat` alias was retired by DeepSeek in July 2026. PostHog is server-side only: do not add `VITE_POSTHOG_*`, a browser SDK, or web CSP origins.

Set the provider secrets separately for preview and production:

```bash
pnpm --filter @zoption/api exec wrangler secret put DEEPSEEK_API_KEY \
  --config wrangler.deploy.jsonc \
  --env preview

pnpm --filter @zoption/api exec wrangler secret put DEEPSEEK_API_KEY \
  --config wrangler.deploy.jsonc \
  --env production

pnpm --filter @zoption/api exec wrangler secret put POSTHOG_PROJECT_TOKEN \
  --config wrangler.deploy.jsonc \
  --env preview

pnpm --filter @zoption/api exec wrangler secret put POSTHOG_PROJECT_TOKEN \
  --config wrangler.deploy.jsonc \
  --env production
```

For local development, put provider secrets in ignored `apps/api/.dev.vars`. Never use a `VITE_*` variable for either key. Keep local PostHog capture disabled unless explicitly testing it. Enable Preview first, inspect the raw event JSON for the metadata allow-list, confirm no person profile is created, verify and disclose the project's actual event-retention plan, require the matching consent version, and only then enable Production. The current rollout uses PostHog's 12-month event-retention plan and assistant consent version 5.

## Failure behavior

Provider timeouts, outages, invalid responses, and blocked responses are mapped to stable user-safe API errors. DeepSeek response bodies and authorization headers are not returned or logged. PostHog receives only stable error kind/reason categories and an HTTP status when known; capture errors and response bodies are ignored. `/health` checks D1 only and does not depend on DeepSeek or PostHog availability.

The assistant provides educational budgeting and financial-wellness information, not personalized financial, investment, tax, legal, retirement-allocation, or insurance advice.
