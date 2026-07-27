# AI Financial Assistant

Zoption's AI Financial Assistant is a read-only interface over the authenticated user's financial workspace. DeepSeek interprets questions and explains results; Zoption's Worker queries D1 and calculates every amount.

## Data flow

1. The browser sends one user message and an idempotency UUID to `/api/app/assistant/*` with the normal Supabase bearer token.
2. Existing Worker middleware verifies the JWT and resolves the user's D1 tenant.
3. The Worker loads a bounded tenant-owned chat history and calls `deepseek-v4-flash`.
4. DeepSeek may request one of the fixed financial tools below.
5. The Worker validates the arguments and runs a tenant-scoped repository/calculation.
6. DeepSeek explains the compact verified result.
7. D1 stores the user message and final answer for 90 days. Tool calls, tool results, reasoning content, credentials, and provider payloads are not stored.

The browser cannot submit a tenant ID, model, system prompt, tool definition, assistant message, or tool result.

## Allowed tools

- `get_account_balances` — manually entered balance snapshots and server-calculated net position.
- `get_period_summary` — income, expenses, net, categories, savings rate, and trends for a bounded date range.
- `get_budget_status` — one month's category limits and verified spending.
- `list_transactions` — a bounded filtered page of transactions without notes or internal IDs.
- `list_categories` — active category names and kinds.

There is no SQL, D1, arbitrary HTTP, environment, credential, secret, import, create, update, or delete tool. Tenant identity is injected by the Worker and is never model-visible.

## Account balances

Balances are manual snapshots with an “as of” date. Transactions and imports do not automatically update them.

- Cash/checking/savings/other balances contribute directly to net position.
- A positive credit-account balance represents debt and reduces net position.
- Missing snapshots are excluded from totals and disclosed in answers.
- Existing accounts migrate with an unknown balance, not a zero balance.

Users maintain snapshots on the Accounts page. The assistant can read them but cannot change them.

## Consent, retention, and deletion

The first DeepSeek request requires a one-time acknowledgment that the question and only the necessary financial data are sent to DeepSeek. Chats expire after 90 days. Users can delete one chat or all chats sooner; deletion removes active D1 rows and cascades to their messages. Cloudflare infrastructure recovery copies follow Cloudflare's own lifecycle.

A daily Worker cron deletes expired threads in bounded batches. Thread listing also performs tenant-scoped lazy cleanup.

## Security controls

- Supabase credentials and sessions remain in Supabase and the browser's authenticated session flow.
- `DEEPSEEK_API_KEY` is a Worker secret and never appears in browser configuration, D1, tool payloads, or logs.
- Assistant generation is limited per tenant by minute and day before a provider call is made.
- One short lease prevents concurrent sends in the same thread.
- Client request UUIDs make completed turns idempotent.
- Tool names, JSON arguments, result size, history size, date ranges, page sizes, provider calls, and total tool calls are bounded.
- Transaction descriptions and account/category names are treated as untrusted data, not instructions.
- Assistant output is rendered as plain text.
- Logs must contain operational counts/status only, never messages, tool payloads, account names, transaction descriptions, JWTs, or keys.

## Configuration

Non-secret Worker variables:

- `ASSISTANT_ENABLED=true`
- `DEEPSEEK_MODEL=deepseek-v4-flash`
- `ASSISTANT_TIME_ZONE=Asia/Manila`
- `ASSISTANT_PROVIDER_TIMEOUT_MS=12000`
- `ASSISTANT_OVERALL_TIMEOUT_MS=25000`

Set the secret separately for preview and production:

```bash
pnpm --filter @zoption/api exec wrangler secret put DEEPSEEK_API_KEY \
  --config wrangler.deploy.jsonc \
  --env preview

pnpm --filter @zoption/api exec wrangler secret put DEEPSEEK_API_KEY \
  --config wrangler.deploy.jsonc \
  --env production
```

For local development, put `DEEPSEEK_API_KEY=...` in ignored `apps/api/.dev.vars`. Never use a `VITE_*` variable for this key.

## Failure behavior

Provider timeouts, outages, invalid responses, and blocked responses are mapped to stable user-safe API errors. DeepSeek response bodies and authorization headers are not returned or logged. `/health` checks D1 only and does not depend on DeepSeek availability.

The assistant provides descriptive financial observations, not financial, investment, tax, legal, lending, or insurance advice.
