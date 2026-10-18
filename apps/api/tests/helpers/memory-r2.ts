/** An in-memory stand-in for the parts of an R2 bucket the Worker uses. */
export function createMemoryR2() {
  const objects = new Map<string, { body: ArrayBuffer; contentType: string }>();
  const bucket = {
    async put(
      key: string,
      value: ArrayBuffer,
      options?: { httpMetadata?: { contentType?: string } },
    ) {
      objects.set(key, {
        body: value,
        contentType: options?.httpMetadata?.contentType ?? "application/octet-stream",
      });
    },
    async get(key: string) {
      const stored = objects.get(key);
      if (!stored) return null;
      return {
        body: stored.body,
        httpMetadata: { contentType: stored.contentType },
      };
    },
    async delete(keys: string | string[]) {
      for (const key of Array.isArray(keys) ? keys : [keys]) objects.delete(key);
    },
    async list({ prefix }: { prefix: string }) {
      const keys = [...objects.keys()].filter((key) => key.startsWith(prefix));
      return { objects: keys.map((key) => ({ key })), truncated: false };
    },
  } as unknown as R2Bucket;
  return { objects, bucket };
}
