import { FormField, SelectionField } from "@/ui/components";

interface AccountOption {
  id: string;
  label: string;
  detail?: string;
}

/** The extra fields a scanned transfer needs: where the money landed, the total, and the fee. */
export function ReceiptTransferFields({
  accountOptions,
  fromAccountId,
  toAccountId,
  amount,
  fee,
  onToAccountChange,
  onAmountChange,
  onFeeChange,
}: {
  accountOptions: AccountOption[];
  fromAccountId: string;
  toAccountId: string;
  amount: string;
  fee: string;
  onToAccountChange: (accountId: string) => void;
  onAmountChange: (value: string) => void;
  onFeeChange: (value: string) => void;
}) {
  return (
    <>
      <SelectionField
        label="To account"
        value={toAccountId}
        options={accountOptions.filter((option) => option.id !== fromAccountId)}
        placeholder="Choose an account"
        sheetTitle="To account"
        hint="Where the money landed, such as your GCash or Maya wallet."
        onSelect={onToAccountChange}
      />
      <FormField
        label="Amount"
        value={amount}
        onChangeText={onAmountChange}
        placeholder="0.00"
        keyboardType="decimal-pad"
        hint="The total that left the first account, fee included."
      />
      <FormField
        label="Fee"
        value={fee}
        onChangeText={onFeeChange}
        placeholder="0.00"
        keyboardType="decimal-pad"
      />
    </>
  );
}
