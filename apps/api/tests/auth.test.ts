import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from "jose";
import { beforeAll, describe, expect, it, vi } from "vitest";

import { AuthConfigurationError, createSupabaseAuthVerifier } from "../src/auth";
import type { Bindings } from "../src/types";

let privateKey: CryptoKey;
let localJwks: ReturnType<typeof createLocalJWKSet>;
const keyId = "test-key";
const supabaseUrl = "https://project-ref.supabase.co";

function bindings(overrides: Partial<Bindings> = {}): Bindings {
  return {
    DB: {} as D1Database,
    SUPABASE_URL: supabaseUrl,
    ...overrides,
  };
}

async function createToken(
  options: { audience?: string; issuer?: string; role?: string } = {},
) {
  return new SignJWT({
    email: "person@example.com",
    role: options.role ?? "authenticated",
  })
    .setProtectedHeader({ alg: "RS256", kid: keyId })
    .setSubject("user-1")
    .setIssuer(options.issuer ?? `${supabaseUrl}/auth/v1`)
    .setAudience(options.audience ?? "authenticated")
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(privateKey);
}

beforeAll(async () => {
  const keyPair = await generateKeyPair("RS256");
  privateKey = keyPair.privateKey;
  const publicJwk = await exportJWK(keyPair.publicKey);
  localJwks = createLocalJWKSet({
    keys: [{ ...publicJwk, kid: keyId, alg: "RS256", use: "sig" }],
  });
});

describe("Supabase JWT verifier", () => {
  it("verifies the JWKS signature, issuer, audience, and subject", async () => {
    const createJwks = vi.fn(() => localJwks);
    const verifier = createSupabaseAuthVerifier(createJwks);
    await expect(verifier.verify(bindings(), await createToken())).resolves.toEqual({
      id: "user-1",
      email: "person@example.com",
      role: "authenticated",
    });
    expect(createJwks).toHaveBeenCalledWith(
      new URL("https://project-ref.supabase.co/auth/v1/.well-known/jwks.json"),
    );
  });

  it("rejects a token with the wrong audience", async () => {
    const verifier = createSupabaseAuthVerifier(() => localJwks);
    await expect(
      verifier.verify(bindings(), await createToken({ audience: "service_role" })),
    ).rejects.toThrow();
  });

  it("rejects a token without the authenticated role", async () => {
    const verifier = createSupabaseAuthVerifier(() => localJwks);
    await expect(
      verifier.verify(bindings(), await createToken({ role: "service_role" })),
    ).rejects.toThrow("authenticated role");
  });

  it("requires an explicit Supabase project URL", async () => {
    const verifier = createSupabaseAuthVerifier(() => localJwks);
    await expect(
      verifier.verify(bindings({ SUPABASE_URL: undefined }), "not-a-token"),
    ).rejects.toBeInstanceOf(AuthConfigurationError);
  });
});
