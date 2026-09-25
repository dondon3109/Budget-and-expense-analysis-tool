import * as Crypto from "expo-crypto";
import * as SecureStore from "expo-secure-store";
import { z } from "zod";

export const PIN_LENGTH = 6;

/**
 * Version 2 records hold a PIN. Version 1 records hold the free-text app
 * password earlier builds used; the lock screen accepts one once and then asks
 * for a PIN to replace it.
 */
const lockRecordSchema = z
  .object({
    version: z.union([z.literal(1), z.literal(2)]),
    salt: z.string().min(1),
    hash: z.string().min(1),
  })
  .strict();

export type AppLockKind = "pin" | "password";

export function isValidPin(pin: string): boolean {
  return pin.length === PIN_LENGTH && /^\d+$/.test(pin);
}

const secureStoreOptions: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
};

// One lock per subject, so a different account signing in on this device is
// never asked for someone else's PIN.
function lockKey(subject: string): string {
  return `zoption.app_lock.${subject}`;
}

// The record already sits in Keystore/Keychain-backed storage. The salted hash
// only keeps the PIN itself from being read back; the lock screen's attempt
// delay is what limits guessing.
function hashSecret(salt: string, secret: string): Promise<string> {
  return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, `${salt}:${secret}`);
}

async function readLockRecord(subject: string) {
  const raw = await SecureStore.getItemAsync(lockKey(subject), secureStoreOptions);
  if (raw === null) return null;
  try {
    const record = lockRecordSchema.safeParse(JSON.parse(raw));
    return record.success ? record.data : "unreadable";
  } catch {
    return "unreadable";
  }
}

/**
 * The kind of lock set for this subject, or null when there is none. An
 * unreadable record reads as a PIN that never verifies: the lock fails closed.
 */
export async function readAppLockKind(subject: string): Promise<AppLockKind | null> {
  const record = await readLockRecord(subject);
  if (record === null) return null;
  if (record !== "unreadable" && record.version === 1) return "password";
  return "pin";
}

export async function setAppLock(subject: string, pin: string): Promise<void> {
  if (!isValidPin(pin)) throw new Error(`Use ${PIN_LENGTH} digits.`);
  const salt = Crypto.randomUUID();
  const record = { version: 2, salt, hash: await hashSecret(salt, pin) };
  await SecureStore.setItemAsync(lockKey(subject), JSON.stringify(record), secureStoreOptions);
}

/** Checks a PIN, or the legacy password when the record is version 1. */
export async function verifyAppLock(subject: string, secret: string): Promise<boolean> {
  const record = await readLockRecord(subject);
  if (record === null || record === "unreadable") return false;
  return (await hashSecret(record.salt, secret)) === record.hash;
}

export async function clearAppLock(subject: string): Promise<void> {
  await SecureStore.deleteItemAsync(lockKey(subject), secureStoreOptions);
}
