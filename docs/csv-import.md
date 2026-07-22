# Transaction import guide

Clarity accepts UTF-8 CSV files, Excel workbooks (`.xlsx`), and Excel 97–2003 workbooks (`.xls`). Choose a file with the native picker or drag and drop one file onto the import area; both methods use the same validation and preview pipeline. Importing always starts with a preview and never changes the workspace until the user confirms the ready rows.

## Supported files

- **CSV:** Up to 1 MB, comma-separated, with a selectable header row.
- **Excel:** Up to 5 MB. If the workbook has multiple worksheets, choose the worksheet containing the transaction table. A workbook with one worksheet is selected automatically.
- **Rows:** The selected header can have up to 500 nonblank data rows below it.
- **Drag and drop:** Drop exactly one supported file at a time. Multiple-file drops are rejected without choosing one implicitly.

Excel workbooks are read and converted to canonical CSV in a browser Web Worker. The original workbook is not uploaded to the API. Only the selected worksheet's converted text, selected header row, and editable column mapping enter the preview flow.

Password-protected, encrypted, damaged, or unsupported workbooks cannot be imported. Export an unprotected `.xlsx`, `.xls`, or UTF-8 `.csv` copy and try again.

## Header detection and bank formats

Clarity inspects a bounded set of early nonblank rows and suggests the row that looks most like a transaction header. Statement titles, account details, date ranges, and other introductory rows before the selected header are ignored. The suggested header remains editable, and row numbers in preview continue to identify the corresponding source records.

The **Bank format** control provides editable built-in mappings for:

- BPI
- BDO
- MariBank
- Bank of America
- JPMorgan / Chase
- Generic bank exports

Auto detection uses filename hints and recognizable headings. Presets match header names rather than fixed column positions, worksheet names, or introductory-row counts, so reordered and extra columns are allowed. Applying a preset fills the mapping controls; the user can still change every selected column and the Amount format before previewing. The server receives the resolved header and mapping, not a trusted bank preset ID.

## Transaction columns

Download the current template from the Import page or use these columns:

| Column       | Required    | Rule                                                                                                                          |
| ------------ | ----------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Date         | Conditional | `YYYY-MM-DD`, `M/D/YYYY`, or `MM/DD/YYYY`, optionally followed by a 24-hour time; otherwise choose one ISO date for all rows. |
| Description  | Yes         | 1–240 characters.                                                                                                             |
| Amount       | Conditional | One signed number with up to two decimals, including optional commas.                                                         |
| Debit/Credit | Conditional | Map both columns instead of Amount; exactly one side must contain a nonzero value.                                            |
| Category     | No          | An active category of the resolved type; otherwise Uncategorized is used.                                                     |
| Type         | No          | `income`, `expense`, or `transfer`; otherwise inferred from the signed amount.                                                |
| Currency     | No          | Must be `PHP` when mapped; otherwise PHP is assumed.                                                                          |

Choose exactly one amount strategy:

1. **One signed Amount column:** negative values become expenses and positive values become income unless a valid Type column is mapped.
2. **Separate Debit and Credit columns:** Debit becomes a negative absolute amount and Credit becomes a positive absolute amount. A row is invalid if both sides or neither side contains a nonzero value. A mapped income/expense Type must agree with the selected side.

Every mapped field must point to a different source column. Equivalent dates and amounts are normalized before duplicate detection, so `7/20/2026` with a Debit of `500.00` matches `2026-07-20` with an Amount of `-500.00` when the description and account source are also equal.

Slash dates are always interpreted as month/day/year. Clarity does not guess day-first dates. A supported date may be followed by a valid 24-hour time such as `14:30` or `14:30:45`; the time is discarded because transactions are date-based. Impossible dates such as `2/30/2026` and invalid times such as `24:00` remain invalid. When no Date column is mapped, Clarity displays an editable ISO date field and applies that date to every row. When a Date column is mapped, blank or invalid cells do not use the file-wide date.

When Category is not mapped, blank, unknown, archived, or belongs to another transaction type, the row uses the protected Uncategorized category for its inferred type. Clarity maintains separate income, expense, and transfer records that all display as `Uncategorized`; these system categories cannot be renamed or archived.

## PHP-only handling

Clarity stores Philippine pesos (`PHP`) only and does not perform currency conversion. A mapped Currency column must contain `PHP` for every imported row.

Bank of America and JPMorgan / Chase exports commonly contain USD. Their presets display a prominent warning. If a mapped Currency column does not prove that every row is PHP, the user must explicitly confirm that the numeric values should be stored as PHP without conversion before previewing. This confirmation does not make USD valid: a mapped non-PHP currency is still rejected by the API.

## Excel conversion behavior

- Real Excel date cells are converted to `YYYY-MM-DD` without changing the calendar day.
- Text dates are preserved and then validated by the same ISO/U.S.-slash date normalizer used for CSV files.
- Numeric cells use their raw values rather than displayed currency or thousands-separator formatting.
- Formulas are not recalculated. Clarity uses the last result saved in the workbook and displays a warning when formula cells are present.
- Formula cells without saved results are left blank. Open, recalculate, and save the workbook before importing if those cells are required.
- Entirely blank surrounding rows and columns are ignored. Nonblank introductory rows are preserved so the actual header can be detected or selected.
- Only the selected worksheet is converted; worksheets are never combined.

The converted worksheet must still fit the authoritative 1 MB canonical CSV and 500-data-row limits after the header is selected.

## Preview, bulk categories, and commit

Previewing parses and validates the file but does not create transactions. Each row is marked ready, invalid, or duplicate. The preview table is paginated in groups of 100 so all rows can be reviewed without rendering the complete file at once.

Ready rows that the server resolved to a protected Uncategorized category have selection controls. Choose one transaction type, select matching rows across all preview pages, and apply an active non-system category of the same type. Category changes remain local until commit and can be revised before saving.

Duplicate detection uses a SHA-256 fingerprint of the canonical date, signed amount, normalized description, and account source. Category is intentionally excluded, so changing a category does not alter transaction identity.

The server stores only normalized ready rows behind a one-time, tenant-scoped preview token that expires after 15 minutes. The saved preview remains immutable. Commit sends only the token and bounded row/category overrides; it never accepts replacement dates, amounts, descriptions, types, fingerprints, account sources, or tenant IDs.

Before any write, the API validates that each override targets a stored ready Uncategorized row and an active, non-system category owned by the authenticated tenant with the same transaction type. One invalid override rejects the entire commit. Valid category changes are applied in memory, then the import audit, transaction inserts, and preview deletion run in one atomic D1 batch. Invalid and duplicate rows are never written.

## Examples

A signed-amount CSV:

```csv
Date,Description,Amount,Currency,Type,Category
2026-07-20,"Weekend groceries",-1250.50,PHP,expense,"Food & dining"
7/21/2026,Freelance payment,8000.00,PHP,income,Salary
```

A bank export with introductory rows and split amounts:

```csv
BPI Statement of Account
Account,1234
Transaction Date,Description,Debit,Credit
7/20/2026,"Weekend groceries",1250.50,
7/21/2026,Freelance payment,,8000.00
```

A date-less, category-less summary can also be imported. Choose one date in the mapping step; Clarity assigns the appropriate Uncategorized category:

```csv
Description,Amount
"Weekend groceries",-1250.50
Freelance payment,8000.00
```
