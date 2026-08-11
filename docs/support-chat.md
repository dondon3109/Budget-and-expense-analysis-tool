# Product support chat

Zoption Support is a public, product-help chat available from the landing page and the authenticated app shell. It uses the existing server-side DeepSeek provider configuration but is intentionally separate from the financial AI Assistant.

## Data flow

1. The browser keeps up to 12 support messages in tab-scoped `sessionStorage` so the conversation survives client-side navigation.
2. A submitted message, bounded support history, and a fixed page-context label are sent to `POST /api/support/chat`.
3. The Worker applies origin checks, a 24 KiB request-body limit, per-IP minute and daily rate limits, and strict Zod validation.
4. The Worker prepends a fixed product-support prompt and calls the configured DeepSeek model with no tools.
5. The browser displays the plain-text response. The Worker does not write support messages or responses to D1.

The chat disclosure explains that messages go to DeepSeek and do not enter the financial Assistant history. Closing the browser session normally clears the browser copy. DeepSeek may independently process or retain submitted content under its current provider practices.

## Security boundary

Product support has no authentication, tenant resolution, D1 financial reader, assistant memory, financial tools, or mutation tools. It must never claim that it inspected an account or completed an action. The system prompt tells users not to send credentials or sensitive financial details and redirects personalized financial analysis to the consent-gated AI Assistant.

The public endpoint uses the existing `ASSISTANT_ENABLED`, `DEEPSEEK_MODEL`, `DEEPSEEK_API_KEY`, and provider timeout configuration. No model credential is sent to the browser.

## Product knowledge

The bounded support prompt in `apps/api/src/support/service.ts` documents the current public entry points, authenticated navigation, import flow, ledger-derived balances, budgets, subscriptions, calendar, goals and debts, financial Assistant boundary, account settings, Android APK, and public policy routes.

When one of those workflows changes, update the support prompt and its assertions in `apps/api/tests/support.test.ts` in the same change.
