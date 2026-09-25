/** Keeps each ledger entry meaningful when several items share a receipt. */
export function receiptItemDescription(merchant: string, itemDescription: string): string {
  const merchantName = merchant.trim();
  const itemName = itemDescription.trim();
  if (!merchantName) return itemName;
  if (!itemName || itemName.toLocaleLowerCase("en") === merchantName.toLocaleLowerCase("en")) {
    return merchantName;
  }
  return `${merchantName} · ${itemName}`.slice(0, 240);
}
