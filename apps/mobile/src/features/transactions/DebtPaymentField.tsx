import type { LocalDebtItem } from "@/db/view-models";
import { SelectionField } from "@/ui/components";

// Selection id for clearing the link; never a real debt id.
const NO_DEBT_OPTION = "__no_debt__";

/**
 * Picks the debt an entry pays down. An expense in the Debt payment category must name one when
 * any exist, as on the web; a transfer into a liability account may leave it unlinked.
 */
export function DebtPaymentField({
  debts,
  required,
  value,
  error,
  disabled,
  onChange,
}: {
  debts: LocalDebtItem[];
  required: boolean;
  value: string;
  error?: string;
  disabled: boolean;
  onChange: (debtId: string) => void;
}) {
  // A debt paid off after the fact stays listed, so an edit does not silently relink it.
  const options = debts
    .filter((debt) => debt.status === "active" || debt.id === value)
    .map((debt) => ({ id: debt.id, label: debt.name }));
  if (options.length === 0) return null;
  return (
    <SelectionField
      disabled={disabled}
      error={error}
      hint={required ? undefined : "Optional. The debt's balance drops once this syncs."}
      label="Debt paid"
      onSelect={(debtId) => onChange(debtId === NO_DEBT_OPTION ? "" : debtId)}
      options={required ? options : [{ id: NO_DEBT_OPTION, label: "No linked debt" }, ...options]}
      placeholder={required ? "Choose a debt" : "No linked debt"}
      sheetTitle="Which debt does this pay?"
      value={value}
    />
  );
}
