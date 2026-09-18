const IV_LEN = 12;
const TAG_LEN = 16;
// Ciphertext format version. Rows written before the prefix existed are unprefixed base64 of
// iv || ciphertext with no additional data; they must keep decrypting forever.
const VERSION_PREFIX = "v1.";

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function bytesToB64(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

async function importAesKey(masterB64: string): Promise<CryptoKey> {
  const keyBytes = b64ToBytes(masterB64.trim());
  if (keyBytes.length !== 32) {
    throw new Error("Provider credential encryption key must be 32 bytes (base64).");
  }
  // Cast to BufferSource for Web Crypto compatibility (Uint8Array backed by ArrayBuffer)
  const buf: ArrayBuffer = keyBytes.buffer.slice(
    keyBytes.byteOffset,
    keyBytes.byteOffset + keyBytes.byteLength,
  ) as ArrayBuffer;
  return crypto.subtle.importKey("raw", buf, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

export function getLast4(secret: string): string {
  const trimmed = secret.trim();
  if (trimmed.length < 4) return trimmed.padStart(4, "•").slice(-4);
  return trimmed.slice(-4);
}

export function validateMasterKeyFormat(value: string | undefined): boolean {
  if (!value?.trim()) return false;
  try {
    const bytes = b64ToBytes(value.trim());
    return bytes.length === 32;
  } catch {
    return false;
  }
}

/**
 * Encrypts a credential secret into the `v1.` format. `aad` is the credential row id: it binds
 * the ciphertext to that row, so a stored value moved to another row cannot be decrypted. The
 * version prefix records which format and key wrote the row, which is what a later key rotation
 * needs to keep decrypting existing rows.
 */
export async function encryptSecret(
  plain: string,
  masterB64: string,
  aad: string,
): Promise<string> {
  if (!plain.trim()) throw new Error("Secret must not be empty.");
  if (!aad.trim()) throw new Error("Credential row id (additional data) must not be empty.");
  if (!validateMasterKeyFormat(masterB64)) {
    throw new Error("Provider credential encryption key is not configured or invalid.");
  }
  const key = await importAesKey(masterB64);
  const iv = crypto.getRandomValues(new Uint8Array(IV_LEN));
  const data = new TextEncoder().encode(plain);
  const cipherBuf = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: new TextEncoder().encode(aad) },
    key,
    data,
  );
  const cipherBytes = new Uint8Array(cipherBuf);
  const combined = new Uint8Array(iv.length + cipherBytes.length);
  combined.set(iv, 0);
  combined.set(cipherBytes, iv.length);
  return `${VERSION_PREFIX}${bytesToB64(combined)}`;
}

/**
 * Decrypts both ciphertext formats. A `v1.` row is bound to `aad` and fails when it does not
 * match, so there is no try-both fallback. An unprefixed row predates that binding and is
 * decrypted without additional data, which is why the legacy path ignores `aad`.
 */
export async function decryptSecret(
  cipherB64: string,
  masterB64: string,
  aad: string,
): Promise<string> {
  if (!cipherB64.trim()) throw new Error("Ciphertext must not be empty.");
  if (!validateMasterKeyFormat(masterB64)) {
    throw new Error("Provider credential encryption key is not configured or invalid.");
  }
  const value = cipherB64.trim();
  const versioned = value.startsWith(VERSION_PREFIX);
  if (versioned && !aad.trim()) {
    throw new Error("A v1 ciphertext requires the credential row id as additional data.");
  }
  const key = await importAesKey(masterB64);
  const combined = b64ToBytes(versioned ? value.slice(VERSION_PREFIX.length) : value);
  if (combined.length <= IV_LEN + TAG_LEN) {
    throw new Error("Ciphertext is too short.");
  }
  const iv = combined.slice(0, IV_LEN);
  const cipherBytes = combined.slice(IV_LEN);
  const algorithm = versioned
    ? { name: "AES-GCM", iv, additionalData: new TextEncoder().encode(aad) }
    : { name: "AES-GCM", iv };
  const plainBuf = await crypto.subtle.decrypt(algorithm, key, cipherBytes);
  return new TextDecoder().decode(plainBuf);
}
