const IV_LEN = 12;

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
  const buf: ArrayBuffer = keyBytes.buffer.slice(keyBytes.byteOffset, keyBytes.byteOffset + keyBytes.byteLength) as ArrayBuffer;
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

export async function encryptSecret(plain: string, masterB64: string): Promise<string> {
  if (!plain.trim()) throw new Error("Secret must not be empty.");
  if (!validateMasterKeyFormat(masterB64)) {
    throw new Error("Provider credential encryption key is not configured or invalid.");
  }
  const key = await importAesKey(masterB64);
  const iv = crypto.getRandomValues(new Uint8Array(IV_LEN));
  const data = new TextEncoder().encode(plain);
  const cipherBuf = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, data);
  const cipherBytes = new Uint8Array(cipherBuf);
  const combined = new Uint8Array(iv.length + cipherBytes.length);
  combined.set(iv, 0);
  combined.set(cipherBytes, iv.length);
  return bytesToB64(combined);
}

export async function decryptSecret(cipherB64: string, masterB64: string): Promise<string> {
  if (!cipherB64.trim()) throw new Error("Ciphertext must not be empty.");
  if (!validateMasterKeyFormat(masterB64)) {
    throw new Error("Provider credential encryption key is not configured or invalid.");
  }
  const key = await importAesKey(masterB64);
  const combined = b64ToBytes(cipherB64.trim());
  if (combined.length <= IV_LEN + 16) {
    throw new Error("Ciphertext is too short.");
  }
  const iv = combined.slice(0, IV_LEN);
  const cipherBytes = combined.slice(IV_LEN);
  const plainBuf = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, cipherBytes);
  return new TextDecoder().decode(plainBuf);
}
