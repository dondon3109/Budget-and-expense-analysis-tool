import * as Crypto from "expo-crypto";
import * as SecureStore from "expo-secure-store";
import { z } from "zod";

export const APP_LOCK_MIN_LENGTH = 4;

const lockRecordSchema = z
  .object({
    version: z.literal(1),
    salt: z.string().min(1),
    hash: z.string().min(1),
  })
  .strict();

const secureStoreOptions: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
};

// One lock per subject, so a different account signing in on this device is
// never asked for someone else's app password.
function lockKey(subject: string): string {
  return `zoption.app_lock.${subject}`;
}

// The record already sits in Keystore/Keychain-backed storage. The salted hash
// only keeps the password itself from being read back; the lock screen's
// attempt delay is what limits guessing.
function hashPassword(salt: string, password: string): Promise<string> {
  return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, `${salt}:${password}`);
}

/** True when a lock record exists, even an unreadable one: the lock fails closed. */
export async function hasAppLock(subject: string): Promise<boolean> {
  return (await SecureStore.getItemAsync(lockKey(subject), secureStoreOptions)) !== null;
}

export async function setAppLock(subject: string, password: string): Promise<void> {
  if (password.length < APP_LOCK_MIN_LENGTH) {
    throw new Error(`Use at least ${APP_LOCK_MIN_LENGTH} characters.`);
  }
  const salt = Crypto.randomUUID();
  const record = { version: 1, salt, hash: await hashPassword(salt, password) };
  await SecureStore.setItemAsync(lockKey(subject), JSON.stringify(record), secureStoreOptions);
}

export async function verifyAppLock(subject: string, password: string): Promise<boolean> {
  const raw = await SecureStore.getItemAsync(lockKey(subject), secureStoreOptions);
  if (!raw) return false;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return false;
  }
  const record = lockRecordSchema.safeParse(parsed);
  if (!record.success) return false;
  return (await hashPassword(record.data.salt, password)) === record.data.hash;
}

export async function clearAppLock(subject: string): Promise<void> {
  await SecureStore.deleteItemAsync(lockKey(subject), secureStoreOptions);
}
