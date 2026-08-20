# AI-assisted entry (R1)

Photo receipt entry removes the "logging tax" for the most common paper trail in budgeting: the
receipt. The user snaps a photo, reviews an AI-drafted entry, and confirms it on the same
preview screen the CSV/Excel import already uses. Nothing is written until the user confirms
every field — the AI drafts, the user commits.

## Flow

1. **Consent gate.** One-time, separate from the assistant and voice consents. The disclosure
   states that a selected photo, PDF, or recording is processed in-flight to draft fields and is
   never stored or used for anything else.
2. **Capture.** Import page "Photo receipt" tab (also linked from the dashboard quick actions).
   Accepts JPEG/PNG/WebP up to 8 MB; the mobile file input uses `capture="environment"`.
3. **Extraction.** The photo is sent to Cloudflare Workers AI (`@cf/meta/llama-3.2-11b-vision-instruct`)
   with a strict-JSON prompt returning `merchant`, `date`, receipt `amountMinor` (centavos), `kind`,
   `categoryName`, readable `items`, and `rawText`. The API normalizes the candidate: date via the
   shared import normalizer (falling back to today in the configured time zone), kind from the amount
   sign when missing, and hard 422 failures when merchant or amount cannot be read.
4. **Draft edit.** The extracted fields appear in a small form (merchant, date, amount, type,
   category) where the user can correct anything, with the recovered raw text available in a
   disclosure.
5. **Same preview screen.** The corrected draft is synthesized into a one-row CSV
   (`Description,Amount,Category,Type`) and fed into the existing import pipeline:
   `POST /api/app/imports/preview` validates the row, computes its duplicate fingerprint against
   existing transactions, and stores a 15-minute one-time commit token. The user then sees the
   standard preview screen — including category/type overrides and duplicate flags — and
   commits through the unchanged `POST /api/app/imports/commit` path.

## PDF statement import

The mobile import picker also accepts PDFs up to 5 MB. The authenticated Worker sends the selected
file to Workers AI Markdown Conversion in-flight, asks a text model for bounded normalized statement
rows, and invokes the unchanged import-preview repository. The normal 15-minute preview token,
tenant-scoped duplicate detection, category/type corrections, plan check, and explicit
`POST /api/app/imports/commit` are all reused. The PDF itself and extracted text are not persisted.

## Voice transaction entry

The New transaction screen can record one short voice clip. Workers AI Whisper transcribes the
temporary audio; a text model drafts its description, date, positive centavo amount, type, and an
optional category label. The app fills the ordinary editable transaction form and does not create a
local mutation until the user taps Save. Voice entry does not reuse the Assistant's read-only consent
or conversation routes; it is covered by the dedicated AI-entry consent below.

On mobile, every readable receipt item is independently editable (description, amount, and category).
The item total must reconcile to the receipt total before the app creates all local transactions in one
SQLite transaction; older API deployments that do not return `items` continue as a single receipt-total
draft. The web import flow still uses the receipt total as its one preview row.

## Why it is cheap

Four of the five building blocks are reused verbatim:

- **Commit target** — the import repository (`apps/api/src/db/imports.ts`) is untouched.
- **Preview screen** — the Import page preview, pagination, overrides, and success state are
  reused; the only new UI is the capture + draft-edit step that produces a CSV.
- **Duplicate detection** — the existing SHA-256 fingerprint
  (`date|amountMinor|description|accountSource`, in `packages/shared/src/fingerprint.ts`) runs on
  AI-drafted entries automatically because they enter through the same preview.
- **Consent framework** — the per-feature opt-in pattern of the assistant and voice consents
  (`assistant_preferences`) is mirrored by a dedicated `receipt_preferences` table and a
  `PATCH /api/app/receipts/preferences {consented:true}` grant, gated by
  `CURRENT_RECEIPT_CONSENT_VERSION`. Version 2 explicitly covers selected receipt photos, PDF
  statements, and voice recordings; none may leave the device before this consent.

The only new piece is the extraction step: a vision provider abstraction
(`apps/api/src/receipts/vision-provider.ts`) with one Cloudflare Workers AI implementation
(`apps/api/src/receipts/cloudflare-vision.ts`), plus a thin service (`receipts/service.ts`) that
maps provider failures to stable HTTP errors exactly like the voice service does.

## Privacy posture

- **Source files are never stored.** A photo, PDF, or recording exists only inside its extraction request; no bucket,
  no retention window, no deletion job. The consent copy says exactly this, so the "deleted
  after X days" promise is satisfied by "stored for zero seconds".
- **Consent is separate and checkable.** Scanning stays off until the user accepts; the server
  refuses extraction (409 `receipt_consent_required`) until the tenant has a current consent
  record.
- **Read-only by design.** The vision model returns text only; it cannot create, edit, or
  delete records. The commit step is the user's click on the existing import screen.
- **No new retention surfaces.** The committed transaction carries the standard import
  bookkeeping (import id, fingerprint, row number) and no image references.

## Environment

- `RECEIPT_ENTRY_ENABLED` — "true" enables the routes (404 otherwise).
- `RECEIPT_VISION_MODEL` — defaults to `@cf/meta/llama-3.2-11b-vision-instruct`; swap
  freely, the provider validates output shape regardless of model.
- `RECEIPT_VISION_PROVIDER_TIMEOUT_MS` — 5s–60s, default 30s.
- `AI_ENTRY_PROVIDER_TIMEOUT_MS` — text-model timeout for PDF row and voice draft extraction;
  5s–60s, default 30s.

The Workers AI binding (`AI`) is already configured for assistant voice transcription.

## Database

Migration `0034_receipt_consent.sql` adds `receipt_preferences` (tenant-scoped, cascades on
tenant deletion): consented_at, consent_version, timestamps.

## Out of scope for this version

- Scanned/image-only PDF OCR beyond Workers AI Markdown Conversion.
- Field editing inside the import preview itself; the draft-edit step covers corrections.
- PostHog AI observability for extraction calls; provider failures are logged as structured
  console events and mapped to stable HTTP errors.
- Billing changes: receipt commits count against the existing file-import monthly usage
  statement, which keeps enforcement consistent with the import feature.
