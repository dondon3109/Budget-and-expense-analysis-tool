# Transaction import guide

Clarity accepts UTF-8 CSV files, Excel workbooks (`.xlsx`), and Excel 97–2003 workbooks (`.xls`). Importing always starts with a preview and never changes the workspace until the user confirms the ready rows.

## Supported files

- **CSV:** Up to 1 MB, comma-separated, with a header row.
- **Excel:** Up to 5 MB. If the workbook has multiple worksheets, choose the worksheet containing the transaction table. A workbook with one worksheet is selected automatically.
- **Rows:** The selected CSV or worksheet can contain up to 500 data rows.

Excel workbooks are read and converted to canonical CSV in the browser. The original workbook is not uploaded to the API. Only the selected worksheet's converted text and column mapping enter the existing preview flow.

Password-protected, encrypted, damaged, or unsupported workbooks cannot be imported. Export an unprotected `.xlsx`, `.xls`, or UTF-8 `.csv` copy and try again.

## Transaction columns

Download the current template from the Import page or use these columns:

| Column      | Required    | Rule                                                                  |
| ----------- | ----------- | --------------------------------------------------------------------- |
| Date        | Conditional | A real date in `YYYY-MM-DD` format, or choose one date for every row. |
| Description | Yes         | 1–240 characters.                                                     |
| Amount      | Yes         | A plain number with up to two decimals; commas and signs are allowed. |
| Category    | No          | An active Clarity category; otherwise Uncategorized is used.          |
| Type        | No          | `income`, `expense`, or `transfer`; otherwise inferred from the sign. |
| Currency    | No          | Must be `PHP` when mapped; otherwise PHP is assumed.                  |

Every mapped field must point to a different source column. When no Date column is mapped, Clarity displays an editable date field and applies that date to every row. When a Date column is mapped, blank or invalid dates remain invalid and do not use the file-wide date.

When Category is not mapped, blank, unknown, archived, or belongs to another transaction type, the row uses the protected Uncategorized category for its inferred type. Clarity maintains separate income, expense, and transfer records that all display as `Uncategorized`; these system categories cannot be renamed or archived.

## Excel conversion behavior

- Real Excel date cells are converted to `YYYY-MM-DD` without changing the calendar day.
- Text dates are left unchanged. Ambiguous values such as `7/21/2026` remain invalid until corrected in the workbook.
- Numeric cells use their raw values rather than displayed currency or thousands-separator formatting.
- Formulas are not recalculated. Clarity uses the last result saved in the workbook and displays a warning when formula cells are present.
- Formula cells without saved results are left blank. Open, recalculate, and save the workbook before importing if those cells are required.
- Entirely blank surrounding rows and columns are ignored. The first remaining row must contain unique, nonblank headers.
- Only the selected worksheet is converted; worksheets are never combined.

The converted worksheet must still fit the authoritative 1 MB CSV and 500-row limits.

## Safe preview and commit

Previewing parses and validates the file but does not create transactions. Each row is marked ready, invalid, or duplicate. Duplicate detection uses a SHA-256 fingerprint of the resolved date, signed amount, description, and account source, and checks both the file and existing imported transactions. A date entered for every row therefore participates in duplicate detection.

The server stores only the ready normalized rows behind a one-time preview token that expires after 15 minutes. Committing uses that server-issued preview and writes the import audit plus transactions as one atomic D1 batch. Invalid and duplicate rows are never written.

## CSV example

```csv
Date,Description,Amount,Currency,Type,Category
2026-07-20,"Weekend groceries",-1250.50,PHP,expense,"Food & dining"
2026-07-21,Freelance payment,8000.00,PHP,income,Salary
```

A date-less, category-less bank summary can also be imported. Choose one date in the mapping step; Clarity will assign the appropriate Uncategorized category:

```csv
Description,Amount
"Weekend groceries",-1250.50
Freelance payment,8000.00
```
