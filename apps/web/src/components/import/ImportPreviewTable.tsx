import {
  normalizeSignedAmount,
  type CategoryRecord,
  type ImportPreview,
  type TransactionKind,
} from "@zoption/shared";

import { formatMoney } from "../../lib/formatters";

function categoryName(
  categories: CategoryRecord[],
  categoryId: string | undefined,
): string | undefined {
  return categories.find((category) => category.id === categoryId)?.name;
}

interface ImportPreviewTableProps {
  rows: ImportPreview["rows"];
  categories: CategoryRecord[];
  kindOverrides: Record<number, TransactionKind>;
  categoryOverrides: Record<number, string>;
  selectedRows: number[];
  toggleRow: (rowNumber: number) => void;
}

/** One page of preview rows, showing each row as it will import after type and category changes. */
export function ImportPreviewTable({
  rows: visibleRows,
  categories,
  kindOverrides,
  categoryOverrides,
  selectedRows,
  toggleRow,
}: ImportPreviewTableProps) {
  return (
    <div className="import-table-wrap">
      <table className="import-table">
        <caption className="sr-only">Import preview rows</caption>
        <thead>
          <tr>
            <th scope="col" className="import-select-column">
              Select
            </th>
            <th scope="col">Row</th>
            <th scope="col">Status</th>
            <th scope="col">Transaction</th>
            <th scope="col">Amount</th>
            <th scope="col">Details</th>
          </tr>
        </thead>
        <tbody>
          {visibleRows.map((row) => {
            const eligible = row.status === "ready" && row.categoryIsUncategorized && row.kind;
            const effectiveKind = kindOverrides[row.rowNumber] ?? row.kind;
            const effectiveAmount =
              row.amountMinor === undefined || !effectiveKind
                ? row.amountMinor
                : effectiveKind === "transfer"
                  ? row.amountMinor
                  : normalizeSignedAmount(row.amountMinor, effectiveKind);
            const overrideName = categoryName(categories, categoryOverrides[row.rowNumber]);
            const effectiveCategory =
              overrideName ||
              (effectiveKind !== row.kind ? "Uncategorized" : row.categoryName) ||
              "No category";
            const changed = Boolean(overrideName || (effectiveKind && effectiveKind !== row.kind));
            return (
              <tr key={row.rowNumber}>
                <td className="import-select-column">
                  {row.status === "ready" && row.categoryIsUncategorized ? (
                    <input
                      type="checkbox"
                      aria-label={`Select row ${row.rowNumber}`}
                      checked={selectedRows.includes(row.rowNumber)}
                      disabled={!eligible}
                      onChange={() => toggleRow(row.rowNumber)}
                    />
                  ) : (
                    "—"
                  )}
                </td>
                <td>{row.rowNumber}</td>
                <td>
                  <span className={`import-status ${row.status}`}>{row.status}</span>
                </td>
                <td>
                  <strong>{row.description || "—"}</strong>
                  <small>
                    {row.date || "No valid date"} · {effectiveKind || "No type"} ·{" "}
                    {effectiveCategory}
                  </small>
                </td>
                <td>{effectiveAmount === undefined ? "—" : formatMoney(effectiveAmount)}</td>
                <td>
                  {changed && effectiveKind
                    ? `Will import as ${effectiveKind} · ${effectiveCategory}`
                    : row.errors[0] || "Ready to import"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
