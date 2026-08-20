import { File } from "expo-file-system";

/** Removes a user-selected AI input once no in-flight request needs it anymore. */
export function discardTemporarySourceFile(uri: string | null | undefined): void {
  if (!uri) return;
  try {
    new File(uri).delete();
  } catch {
    // Cache cleanup is best-effort and must never hide the user's result or request error.
  }
}
