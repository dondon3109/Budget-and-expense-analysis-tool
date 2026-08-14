import * as Crypto from "expo-crypto";
import * as SecureStore from "expo-secure-store";

const databaseKeyPattern = /^[0-9a-f]{64}$/;
const keyOptions: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
};

export class LocalKeyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LocalKeyError";
  }
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
}

export async function workspaceAlias(subject: string): Promise<string> {
  return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, subject, {
    encoding: Crypto.CryptoEncoding.HEX,
  });
}

export function workspaceKeyAlias(alias: string): string {
  return `zoption.workspace-key.v1.${alias.slice(0, 32)}`;
}

export async function getOrCreateWorkspaceKey(alias: string): Promise<string> {
  const secureStoreAlias = workspaceKeyAlias(alias);
  const existing = await SecureStore.getItemAsync(secureStoreAlias, keyOptions);
  if (existing) {
    if (!databaseKeyPattern.test(existing)) {
      throw new LocalKeyError(
        "The protected workspace key is invalid. Zoption preserved the local database for recovery.",
      );
    }
    return existing;
  }

  const generated = bytesToHex(await Crypto.getRandomBytesAsync(32));
  await SecureStore.setItemAsync(secureStoreAlias, generated, keyOptions);
  return generated;
}

export async function removeWorkspaceKey(alias: string): Promise<void> {
  await SecureStore.deleteItemAsync(workspaceKeyAlias(alias), keyOptions);
}

export function workspaceGenerationAlias(alias: string): string {
  return `zoption.workspace-generation.v1.${alias.slice(0, 32)}`;
}

export async function getWorkspaceGeneration(alias: string): Promise<number> {
  const stored = await SecureStore.getItemAsync(workspaceGenerationAlias(alias), keyOptions);
  if (!stored) return 1;
  const generation = Number.parseInt(stored, 10);
  if (!Number.isSafeInteger(generation) || generation < 1) {
    throw new LocalKeyError(
      "The protected workspace generation is invalid. Zoption preserved the local database for recovery.",
    );
  }
  return generation;
}

export async function setWorkspaceGeneration(alias: string, generation: number): Promise<void> {
  if (!Number.isSafeInteger(generation) || generation < 1) {
    throw new LocalKeyError("Choose a valid workspace generation.");
  }
  await SecureStore.setItemAsync(workspaceGenerationAlias(alias), String(generation), keyOptions);
}

export async function removeWorkspaceGeneration(alias: string): Promise<void> {
  await SecureStore.deleteItemAsync(workspaceGenerationAlias(alias), keyOptions);
}
