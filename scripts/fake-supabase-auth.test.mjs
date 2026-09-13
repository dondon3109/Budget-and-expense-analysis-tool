import { Buffer } from "node:buffer";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { dirname, join } from "node:path";
import { clearTimeout, setTimeout } from "node:timers";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

/**
 * The stub's identity mapping is what keeps the empty-workspace audit honest: a refresh has to
 * come back as the same account, not as the --user default. Pinned here because an audit shorter
 * than the token lifetime passes either way, so a regression would only surface much later.
 */

const script = join(dirname(fileURLToPath(import.meta.url)), "fake-supabase-auth.mjs");
const seededId = "08060c19-8a55-4046-a2e7-7384808dd81c";
const emptyId = "3f2504e0-4f89-41d3-9a0c-0305e82c3301";

let stub;

afterEach(() => {
  stub?.kill("SIGKILL");
  stub = undefined;
});

async function freePort() {
  const server = createServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  await new Promise((resolve) => server.close(resolve));
  return port;
}

async function startStub() {
  const port = await freePort();
  const child = spawn(
    process.execPath,
    [
      script,
      "--port",
      String(port),
      "--user",
      seededId,
      "--user-for",
      `empty@example.com=${emptyId}`,
    ],
    { stdio: ["ignore", "pipe", "pipe"] },
  );
  stub = child;

  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("the auth stub never started")), 15_000);
    child.stdout.on("data", (chunk) => {
      if (String(chunk).includes("listening on")) {
        clearTimeout(timer);
        resolve();
      }
    });
    child.on("exit", (code) => {
      clearTimeout(timer);
      reject(new Error(`the auth stub exited with code ${code}`));
    });
  });

  return `http://127.0.0.1:${port}`;
}

function claimsOf(accessToken) {
  return JSON.parse(Buffer.from(accessToken.split(".")[1] ?? "", "base64url").toString());
}

async function postToken(base, grant, body) {
  const response = await fetch(`${base}/auth/v1/token?grant_type=${grant}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() };
}

describe("fake-supabase-auth", () => {
  it("keeps the --user-for identity across a refresh", { timeout: 30_000 }, async () => {
    const base = await startStub();
    const password = await postToken(base, "password", {
      email: "empty@example.com",
      password: "anything",
    });
    expect(password.status).toBe(200);
    expect(claimsOf(password.body.access_token).sub).toBe(emptyId);

    const refresh = await postToken(base, "refresh_token", {
      refresh_token: password.body.refresh_token,
    });
    expect(refresh.status).toBe(200);
    expect(claimsOf(refresh.body.access_token)).toMatchObject({
      sub: emptyId,
      email: "empty@example.com",
    });

    // Single use, like GoTrue: the rotated token replaces the one that was spent.
    const replay = await postToken(base, "refresh_token", {
      refresh_token: password.body.refresh_token,
    });
    expect(replay.status).toBe(400);
  });

  it(
    "rejects an unknown refresh token instead of minting the default identity",
    { timeout: 30_000 },
    async () => {
      const base = await startStub();
      const refresh = await postToken(base, "refresh_token", {
        refresh_token: "refresh-nobody",
      });
      expect(refresh.status).toBe(400);
      expect(refresh.body.error).toBe("invalid_grant");
    },
  );

  it("still resolves a password grant to the --user identity", { timeout: 30_000 }, async () => {
    const base = await startStub();
    const password = await postToken(base, "password", {
      email: "audit@example.com",
      password: "anything",
    });
    expect(claimsOf(password.body.access_token)).toMatchObject({ sub: seededId });
  });
});
