import type { SupportedStorage } from "@supabase/supabase-js";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import { z } from "zod";

const manifestSchema = z
  .object({
    version: z.literal(1),
    chunks: z.number().int().positive().max(64),
  })
  .strict();

// Older iOS releases can reject large Keychain values. Supabase sessions can
// exceed that limit, so the adapter stores small encrypted chunks and writes
// the manifest last. An interrupted write fails closed as an invalid session.
const CHUNK_SIZE = 1_800;
const secureStoreOptions: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
};

// auth-js deletes the stored session when a refresh is rejected. On Android
// that deletion is ignored unless a real sign-out (or a phone restart) allowed
// it, so closing the app or an expired access token cannot sign the user out.
let sessionRemovalDepth = 0;

export function sessionRemovalIsAllowed(): boolean {
  return sessionRemovalDepth > 0;
}

export async function withSessionRemovalAllowed<T>(action: () => Promise<T>): Promise<T> {
  sessionRemovalDepth += 1;
  try {
    return await action();
  } finally {
    sessionRemovalDepth -= 1;
  }
}

function manifestKey(key: string): string {
  return `${key}.manifest`;
}

function chunkKey(key: string, index: number): string {
  return `${key}.chunk.${index}`;
}

async function readManifest(key: string): Promise<z.infer<typeof manifestSchema> | null> {
  const rawManifest = await SecureStore.getItemAsync(manifestKey(key), secureStoreOptions);
  if (!rawManifest) return null;

  try {
    const parsed: unknown = JSON.parse(rawManifest);
    const result = manifestSchema.safeParse(parsed);
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

export const secureSessionStorage: SupportedStorage = {
  async getItem(key) {
    const manifest = await readManifest(key);
    if (!manifest) return null;

    const chunks = await Promise.all(
      Array.from({ length: manifest.chunks }, (_, index) =>
        SecureStore.getItemAsync(chunkKey(key, index), secureStoreOptions),
      ),
    );
    if (chunks.some((chunk) => chunk === null)) return null;
    return chunks.join("");
  },

  async setItem(key, value) {
    const previousManifest = await readManifest(key);
    const chunks = Array.from(
      { length: Math.max(1, Math.ceil(value.length / CHUNK_SIZE)) },
      (_, index) => value.slice(index * CHUNK_SIZE, (index + 1) * CHUNK_SIZE),
    );

    for (const [index, chunk] of chunks.entries()) {
      await SecureStore.setItemAsync(chunkKey(key, index), chunk, secureStoreOptions);
    }
    await SecureStore.setItemAsync(
      manifestKey(key),
      JSON.stringify({ version: 1, chunks: chunks.length }),
      secureStoreOptions,
    );

    for (let index = chunks.length; index < (previousManifest?.chunks ?? 0); index += 1) {
      await SecureStore.deleteItemAsync(chunkKey(key, index), secureStoreOptions);
    }
  },

  async removeItem(key) {
    if (Platform.OS === "android" && sessionRemovalDepth === 0) return;

    const manifest = await readManifest(key);
    if (manifest) {
      await Promise.all(
        Array.from({ length: manifest.chunks }, (_, index) =>
          SecureStore.deleteItemAsync(chunkKey(key, index), secureStoreOptions),
        ),
      );
    }
    await SecureStore.deleteItemAsync(manifestKey(key), secureStoreOptions);
  },
};
