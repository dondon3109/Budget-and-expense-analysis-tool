/**
 * A minimal, dependency-free stand-in for Supabase Auth.
 *
 * Why this exists: the authenticated half of the app could not be audited because reaching it
 * needs a session, and a real session needs `supabase start`, which needs a container runtime.
 * This serves just enough of the GoTrue surface for the web client to sign in and for the API to
 * verify the resulting token, so the authenticated surfaces can be scanned and reviewed today —
 * and in CI, where Docker is not available either.
 *
 * It is a test double, not a replacement. Anything about real session behaviour — token lifetimes,
 * refresh races, provider metadata — still belongs to the local-Supabase run documented in
 * docs/local-supabase.md. Nothing in apps/ is changed to use this.
 *
 *   node scripts/fake-supabase-auth.mjs --port 54321 --user <uuid>
 *
 * Then point the app at it. The API's e2e config already targets http://127.0.0.1:54321, so only
 * the web env needs the same URL and any non-empty publishable key.
 */
import { Buffer } from "node:buffer";
import { generateKeyPairSync, randomUUID, sign } from "node:crypto";
import { createServer } from "node:http";

const args = process.argv.slice(2);
const readArg = (name, fallback) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
};

// Extra identities, so a second account can belong to a different tenant and therefore have an
// empty workspace. Repeat --user-for email=uuid; every other email falls back to --user.
const userOverrides = new Map();
for (let index = 0; index < args.length; index += 1) {
  if (args[index] !== "--user-for") continue;
  const [email, id] = String(args[index + 1] ?? "").split("=");
  if (email && id) userOverrides.set(email.toLowerCase(), id);
}

const port = Number(readArg("port", "54321"));
const defaultEmail = "audit@example.com";
const userId = readArg("user", "08060c19-8a55-4046-a2e7-7384808dd81c");
const issuer = `http://127.0.0.1:${port}/auth/v1`;
const ttlSeconds = Number(readArg("ttl", "3600"));

// One keypair per process, so the JWKS the API fetches always matches what we sign with.
const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const keyId = randomUUID();
const jwk = { ...publicKey.export({ format: "jwk" }), kid: keyId, use: "sig", alg: "RS256" };

const base64url = (input) => Buffer.from(input).toString("base64url");

const subjectFor = (email) => userOverrides.get(String(email ?? "").toLowerCase()) ?? userId;

// A refresh presents only its refresh token, so remember which email each token was issued to.
// Without this the refresh grant falls back to the default identity and silently moves the
// empty-workspace account onto the seeded one.
const sessionsByRefreshToken = new Map();

function mintToken(email, sessionId) {
  const issuedAt = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT", kid: keyId }));
  const payload = base64url(
    JSON.stringify({
      sub: subjectFor(email),
      aud: "authenticated",
      role: "authenticated",
      email,
      session_id: sessionId,
      iat: issuedAt,
      exp: issuedAt + ttlSeconds,
      iss: issuer,
    }),
  );
  const signature = sign("sha256", Buffer.from(`${header}.${payload}`), privateKey);
  return `${header}.${payload}.${signature.toString("base64url")}`;
}

function userFor(email) {
  const now = new Date().toISOString();
  return {
    id: subjectFor(email),
    aud: "authenticated",
    role: "authenticated",
    email,
    email_confirmed_at: now,
    confirmed_at: now,
    last_sign_in_at: now,
    created_at: now,
    updated_at: now,
    app_metadata: { provider: "email", providers: ["email"] },
    user_metadata: { display_name: "Local audit user" },
    identities: [],
  };
}

function sessionFor(email) {
  const refreshToken = `refresh-${randomUUID()}`;
  sessionsByRefreshToken.set(refreshToken, email);
  const accessToken = mintToken(email, randomUUID());
  return {
    access_token: accessToken,
    token_type: "bearer",
    expires_in: ttlSeconds,
    expires_at: Math.floor(Date.now() / 1000) + ttlSeconds,
    refresh_token: refreshToken,
    user: userFor(email),
  };
}

function send(response, status, body, origin, requestedHeaders) {
  const payload = body === undefined ? "" : JSON.stringify(body);
  response.writeHead(status, {
    "content-type": "application/json",
    "access-control-allow-origin": origin ?? "*",
    // Echo whatever the client asked for. supabase-js sends a growing set of x-supabase-*
    // headers, and a fixed allow-list rejects the preflight as soon as it adds another one.
    "access-control-allow-headers":
      requestedHeaders ?? "authorization, apikey, content-type, x-client-info, accept",
    "access-control-allow-methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
    "access-control-expose-headers": "content-type",
    "access-control-max-age": "600",
    "content-length": Buffer.byteLength(payload),
  });
  response.end(payload);
}

const server = createServer((request, response) => {
  const origin = request.headers.origin;
  const requestedHeaders = request.headers["access-control-request-headers"];
  const url = new URL(request.url ?? "/", `http://127.0.0.1:${port}`);
  const path = url.pathname.replace(/\/+$/, "");

  if (request.method === "OPTIONS") {
    send(response, 204, undefined, origin, requestedHeaders);
    return;
  }

  if (path === "/auth/v1/.well-known/jwks.json") {
    send(response, 200, { keys: [jwk] }, origin, requestedHeaders);
    return;
  }

  if (path === "/auth/v1/health") {
    send(
      response,
      200,
      { version: "zoption-auth-stub", name: "fake-supabase-auth" },
      origin,
      requestedHeaders,
    );
    return;
  }

  if (path === "/auth/v1/token" && request.method === "POST") {
    let body = "";
    request.on("data", (chunk) => {
      body += chunk;
    });
    request.on("end", () => {
      let parsed = {};
      try {
        parsed = JSON.parse(body || "{}");
      } catch {
        // Fall back to the default identity; the client only needs a session back.
      }
      const grantType = url.searchParams.get("grant_type") ?? parsed.grant_type;

      if (grantType === "refresh_token") {
        const email = sessionsByRefreshToken.get(parsed.refresh_token);
        if (!email) {
          // GoTrue answers an unusable refresh token with 400 invalid_grant. Minting a session
          // here is what let a refresh change identity instead of failing.
          send(
            response,
            400,
            { error: "invalid_grant", error_description: "Invalid Refresh Token" },
            origin,
            requestedHeaders,
          );
          return;
        }
        // Rotate: a refresh token is single-use, like the real service.
        sessionsByRefreshToken.delete(parsed.refresh_token);
        send(response, 200, sessionFor(email), origin, requestedHeaders);
        return;
      }

      const email = typeof parsed.email === "string" && parsed.email ? parsed.email : defaultEmail;
      send(response, 200, sessionFor(email), origin, requestedHeaders);
    });
    return;
  }

  if (path === "/auth/v1/user" && request.method === "GET") {
    if (!request.headers.authorization) {
      send(response, 401, { message: "missing authorization" }, origin, requestedHeaders);
      return;
    }
    // Derive the identity from the presented token. Returning a fixed user made the API's
    // identity check fail for every identity but the default one, and a failed check signs that
    // user out, so a second test account could never reach a route.
    const presented = String(request.headers.authorization).split(" ").pop() ?? "";
    let claims;
    try {
      claims = JSON.parse(Buffer.from(presented.split(".")[1] ?? "", "base64url").toString());
    } catch {
      claims = undefined;
    }
    if (!claims || typeof claims.sub !== "string") {
      send(response, 401, { message: "invalid token" }, origin, requestedHeaders);
      return;
    }
    send(response, 200, { ...userFor(claims.email), id: claims.sub }, origin, requestedHeaders);
    return;
  }

  if (path === "/auth/v1/logout") {
    send(response, 204, undefined, origin, requestedHeaders);
    return;
  }

  send(
    response,
    404,
    { message: `no stub route for ${request.method} ${path}` },
    origin,
    requestedHeaders,
  );
});

server.listen(port, "127.0.0.1", () => {
  console.log(`fake-supabase-auth listening on http://127.0.0.1:${port}`);
  console.log(`  user id : ${userId}`);
  console.log(`  issuer  : ${issuer}`);
  console.log(`  jwks    : ${issuer}/.well-known/jwks.json`);
  console.log(`  seed it : node scripts/seed-local-workspace.mjs --user ${userId}`);
});
