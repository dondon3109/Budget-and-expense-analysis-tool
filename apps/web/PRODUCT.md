# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Zoption primarily serves individual budgeters who want a private place to understand and manage their own spending.

## Product Purpose

Zoption helps people import or record transactions, understand spending patterns, set budgets, track recurring expenses, and make more deliberate financial decisions.

## Operating Context

People use Zoption as an authenticated personal workspace. Supabase owns identity, credentials, sessions, and user-facing account metadata. Cloudflare D1 stores tenant-isolated financial data used by the application.

## Capabilities and Constraints

- Account and financial features require an active authenticated session.
- Supabase user IDs establish application ownership; user-editable metadata is presentation-only and must never control authorization, tenant selection, or data access.
- The browser uses only a Supabase publishable key. Privileged account administration credentials must never be exposed to it.
- Browser-based account deletion is not offered because deleting identity and financial data requires a coordinated trusted-server workflow.
- The AI Financial Assistant is read-only. Zoption calculates financial results from the authenticated tenant; DeepSeek only interprets questions and explains verified tool output.
- Assistant use requires one-time provider data-sharing consent, and chat history expires after 90 days unless deleted sooner.
- Account balances are manually maintained snapshots with explicit as-of dates.

## Brand Commitments

The product is named Zoption. Account and financial language should be direct, calm, and explicit about the result of sensitive actions.

## Product Principles

- Keep personal financial data private and clearly scoped to its owner.
- Make consequential account actions understandable before they happen.
- Report success, pending confirmation, and failure states honestly.
- Keep AI answers brief, evidence-led, and explicit about date ranges, missing data, and balance freshness.
- Preserve familiar, low-friction workflows for routine financial management.
