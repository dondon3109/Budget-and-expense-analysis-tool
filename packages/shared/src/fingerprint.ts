export interface FingerprintInput {
  date: string;
  amountMinor: number;
  description: string;
  accountSource: string;
}

function normalizeText(value: string): string {
  return value.trim().toLocaleLowerCase("en").replace(/\s+/g, " ");
}

export async function createImportFingerprint(input: FingerprintInput): Promise<string> {
  const canonical = [
    input.date,
    String(input.amountMinor),
    normalizeText(input.description),
    normalizeText(input.accountSource),
  ].join("|");
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonical));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
