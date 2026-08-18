export interface ReservedApk {
  uri: string;
  reservedUntil: number;
}

export function urisToDelete(input: {
  files: readonly string[];
  reserved: ReservedApk | null;
  now: number;
}): string[] {
  return input.files.filter((uri) => {
    if (!input.reserved) return true;
    if (uri !== input.reserved.uri) return true;
    return input.now >= input.reserved.reservedUntil;
  });
}

export async function cleanupUpdateFiles(input: {
  listUpdateFiles: () => Promise<string[]>;
  deleteUri: (uri: string) => Promise<void>;
  reserved: ReservedApk | null;
  now: number;
}): Promise<void> {
  const files = await input.listUpdateFiles();
  const obsolete = urisToDelete({ files, reserved: input.reserved, now: input.now });
  await Promise.all(obsolete.map((uri) => input.deleteUri(uri)));
}
