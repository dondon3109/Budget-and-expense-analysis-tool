import { HttpError } from "../errors";

function fromHex(value: string): Uint8Array | null {
  if (!/^[a-f\d]{64}$/i.test(value)) return null;
  const bytes = new Uint8Array(32);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(value.slice(index * 2, index * 2 + 2), 16);
  }
  return bytes;
}

function timingSafeEqual(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left[index]! ^ right[index]!;
  return difference === 0;
}

function signatureParts(header: string): { timestamp: string; signatures: string[] } | null {
  const values = new Map<string, string[]>();
  for (const part of header.split(";")) {
    const [key, value] = part.trim().split("=", 2);
    if (!key || !value) return null;
    values.set(key, [...(values.get(key) ?? []), value]);
  }
  const timestamp = values.get("ts")?.[0];
  const signatures = values.get("h1") ?? [];
  return timestamp && signatures.length > 0 ? { timestamp, signatures } : null;
}

export async function verifyPaddleWebhook(
  rawBody: string,
  signatureHeader: string | undefined,
  secret: string | undefined,
): Promise<void> {
  if (!signatureHeader || !secret)
    throw new HttpError(400, "invalid_webhook", "Invalid webhook request.");
  const parts = signatureParts(signatureHeader);
  if (!parts || !/^\d+$/.test(parts.timestamp)) {
    throw new HttpError(400, "invalid_webhook", "Invalid webhook request.");
  }
  const timestamp = Number(parts.timestamp);
  if (!Number.isSafeInteger(timestamp) || Math.abs(Date.now() - timestamp * 1_000) > 5 * 60_000) {
    throw new HttpError(400, "invalid_webhook", "Invalid webhook request.");
  }
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const expected = new Uint8Array(
    await crypto.subtle.sign(
      "HMAC",
      key,
      new TextEncoder().encode(`${parts.timestamp}:${rawBody}`),
    ),
  );
  if (
    !parts.signatures.some((signature) => {
      const received = fromHex(signature);
      return received !== null && timingSafeEqual(expected, received);
    })
  ) {
    throw new HttpError(400, "invalid_webhook", "Invalid webhook request.");
  }
}
