import { describe, expect, it } from "vitest";

import { decryptSecret, encryptSecret } from "../src/provider-credentials/crypto";

const TEST_MASTER_KEY = btoa("\x01".repeat(32));
const ROW_ID = "3f1c9d0e-2222-4222-8222-222222222222";
// Rows written before the v1 format existed: base64(iv || AES-256-GCM ciphertext) with no
// additional data and no version prefix. Existing provider_credentials rows look like this and
// must keep decrypting.
const LEGACY_CIPHERTEXT = "CwsLCwsLCwsLCwsLzkn+BUxvgnu4aRsQGRjCNOrZke/qpH6yz4dATq8uT0JEQHXyQng=";
const LEGACY_PLAINTEXT = "sk-legacy-fixture-21A9";

describe("provider credential ciphertext format", () => {
  it("round-trips a v1 ciphertext bound to the credential row id", async () => {
    const encrypted = await encryptSecret("sk-live-secret-21A9", TEST_MASTER_KEY, ROW_ID);
    expect(encrypted.startsWith("v1.")).toBe(true);
    expect(encrypted).not.toContain("sk-live-secret");
    await expect(decryptSecret(encrypted, TEST_MASTER_KEY, ROW_ID)).resolves.toBe(
      "sk-live-secret-21A9",
    );
  });

  it("decrypts a legacy row that has no version prefix and no additional data", async () => {
    expect(LEGACY_CIPHERTEXT.startsWith("v1.")).toBe(false);
    // Callers now always pass the row id; the legacy path ignores it on purpose.
    await expect(decryptSecret(LEGACY_CIPHERTEXT, TEST_MASTER_KEY, ROW_ID)).resolves.toBe(
      LEGACY_PLAINTEXT,
    );
  });

  it("fails closed when a v1 ciphertext is tampered with", async () => {
    const encrypted = await encryptSecret("sk-live-secret-21A9", TEST_MASTER_KEY, ROW_ID);
    const combined = Uint8Array.from(atob(encrypted.slice("v1.".length)), (c) => c.charCodeAt(0));
    const tamperIndex = combined.length - 1;
    combined.set([(combined[tamperIndex] ?? 0) ^ 0x01], tamperIndex);
    const tampered = `v1.${btoa(String.fromCharCode(...combined))}`;
    await expect(decryptSecret(tampered, TEST_MASTER_KEY, ROW_ID)).rejects.toThrow();
  });

  it("fails closed when a v1 ciphertext is read for a different credential row", async () => {
    const encrypted = await encryptSecret("sk-live-secret-21A9", TEST_MASTER_KEY, ROW_ID);
    await expect(
      decryptSecret(encrypted, TEST_MASTER_KEY, "11111111-1111-4111-8111-111111111111"),
    ).rejects.toThrow();
  });

  it("refuses a v1 row without the row id binding", async () => {
    await expect(encryptSecret("sk-live-secret-21A9", TEST_MASTER_KEY, " ")).rejects.toThrow();
    const encrypted = await encryptSecret("sk-live-secret-21A9", TEST_MASTER_KEY, ROW_ID);
    await expect(decryptSecret(encrypted, TEST_MASTER_KEY, "")).rejects.toThrow();
  });
});
