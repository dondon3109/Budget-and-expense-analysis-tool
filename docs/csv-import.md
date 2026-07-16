# CSV import guide

Clarity accepts UTF-8, comma-separated files with a header row. Download the current template from the Import page or use these columns:

| Column      | Required | Rule                                                                  |
| ----------- | -------- | --------------------------------------------------------------------- |
| Date        | Yes      | A real date in `YYYY-MM-DD` format.                                   |
| Description | Yes      | 1–240 characters.                                                     |
| Amount      | Yes      | A plain number with up to two decimals; commas and signs are allowed. |
| Category    | Yes      | The name or ID of an active Clarity category.                         |
| Type        | No       | `income`, `expense`, or `transfer`; otherwise inferred from the sign. |
| Currency    | No       | Must be `PHP` when mapped; otherwise PHP is assumed.                  |

Files are limited to 1 MB and 500 data rows. Every mapped field must point to a different source column.

## Safe preview and commit

Previewing parses and validates the file but does not create transactions. Each row is marked ready, invalid, or duplicate. Duplicate detection uses a SHA-256 fingerprint of normalized date, signed amount, description, and account source, and checks both the file and existing imported transactions.

The server stores only the ready normalized rows behind a one-time preview token that expires after 15 minutes. Committing uses that server-issued preview and writes the import audit plus transactions as one atomic D1 batch. Invalid and duplicate rows are never written.

## Example

```csv
Date,Description,Amount,Currency,Type,Category
2026-07-20,"Weekend groceries",-1250.50,PHP,expense,"Food & dining"
2026-07-21,Freelance payment,8000.00,PHP,income,Salary
```
