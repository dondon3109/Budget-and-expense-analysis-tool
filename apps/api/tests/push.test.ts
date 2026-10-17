import type { DatabaseSync } from "node:sqlite";

import { pushPreferencesSchema } from "@zoption/shared";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createPushRepository } from "../src/db/push";
import { HttpError } from "../src/errors";
import { sendPush } from "../src/push";
import { createPushRoutes } from "../src/routes/push";
import type { Bindings } from "../src/types";
import { createD1TestDatabase } from "./helpers/d1-test-harness";
import { createTestApp } from "./helpers/test-app";

const PHONE = "ExponentPushToken[phone-aaaaaaaaaa]";
const TABLET = "ExponentPushToken[tablet-bbbbbbbbb]";
const databases: DatabaseSync[] = [];

afterEach(() => {
  for (const database of databases.splice(0)) database.close();
});

function setup() {
  const { binding, database } = createD1TestDatabase();
  databases.push(database);
  const env = { DB: binding } as unknown as Bindings;
  return { env, database, push: createPushRepository() };
}

describe("push repository", () => {
  it("moves a token to whoever signed in on that phone last", async () => {
    const { env, push } = setup();

    await push.registerDevice(env, "mama", PHONE, "android");
    await push.registerDevice(env, "anak", PHONE, "android");

    expect(await push.deliveryTokens(env, ["mama"], "remittance_received")).toEqual([]);
    expect(await push.deliveryTokens(env, ["anak"], "remittance_received")).toEqual([PHONE]);
    // Another person cannot remove a token they do not own.
    await push.unregisterDevice(env, "mama", PHONE);
    expect(await push.deliveryTokens(env, ["anak"], "remittance_received")).toEqual([PHONE]);
  });

  it("skips people who turned the category off, and only that category", async () => {
    const { env, push } = setup();
    await push.registerDevice(env, "mama", PHONE, "android");
    await push.registerDevice(env, "papa", TABLET, "android");

    const prefs = await push.setPreference(env, "mama", "family_digest", false);

    expect(prefs.categories.family_digest).toBe(false);
    expect(prefs.categories.remittance_received).toBe(true);
    expect(await push.deliveryTokens(env, ["mama", "papa"], "family_digest")).toEqual([TABLET]);
    expect(
      (await push.deliveryTokens(env, ["mama", "papa"], "remittance_received")).sort(),
    ).toEqual([PHONE, TABLET]);
    await push.setPreference(env, "mama", "family_digest", true);
    expect((await push.preferences(env, "mama")).categories.family_digest).toBe(true);
  });
});

describe("sendPush", () => {
  it("batches to Expo and deletes tokens Expo no longer knows", async () => {
    const { env, push } = setup();
    await push.registerDevice(env, "mama", PHONE, "android");
    await push.registerDevice(env, "mama", TABLET, "android");
    const fetcher = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const messages = JSON.parse(String(init?.body)) as { to: string }[];
      return Response.json({
        data: messages.map((message) =>
          message.to === TABLET
            ? { status: "error", details: { error: "DeviceNotRegistered" } }
            : { status: "ok", id: "ticket" },
        ),
      });
    });

    const result = await sendPush(
      env,
      push,
      {
        userIds: ["mama"],
        category: "remittance_received",
        title: "Money received",
        body: "₱5,000 from Don",
        path: "/family",
      },
      fetcher as typeof fetch,
    );

    expect(result).toEqual({ sent: 1, removed: 1 });
    const body = JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body)) as unknown[];
    expect(body[0]).toMatchObject({ title: "Money received", data: { path: "/family" } });
    expect(await push.deliveryTokens(env, ["mama"], "remittance_received")).toEqual([PHONE]);
  });

  it("sends nothing when nobody has a device", async () => {
    const { env, push } = setup();
    const fetcher = vi.fn();

    const result = await sendPush(
      env,
      push,
      { userIds: ["mama"], category: "low_balance", title: "t", body: "b" },
      fetcher as unknown as typeof fetch,
    );

    expect(result).toEqual({ sent: 0, removed: 0 });
    expect(fetcher).not.toHaveBeenCalled();
  });
});

describe("push routes", () => {
  function app() {
    const { env, push } = setup();
    const routes = createTestApp({ user: { id: "mama" }, env });
    routes.route("/api/app/push", createPushRoutes(push));
    routes.onError((error, context) =>
      error instanceof HttpError
        ? context.json({ error: error.code }, error.status)
        : context.json({ error: "internal_server_error" }, 500),
    );
    return { routes, env, push };
  }

  const json = (method: string, body: unknown) => ({
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  it("registers the signed-in person's device and rejects a non-Expo token", async () => {
    const { routes, env, push } = app();

    const bad = await routes.request(
      "/api/app/push/devices",
      json("PUT", { token: "fcm-raw-token", platform: "android" }),
    );
    const good = await routes.request(
      "/api/app/push/devices",
      json("PUT", { token: PHONE, platform: "android" }),
    );

    expect(bad.status).toBe(400);
    expect(good.status).toBe(204);
    expect(await push.deliveryTokens(env, ["mama"], "comment_reply")).toEqual([PHONE]);
  });

  it("reads and updates preferences", async () => {
    const { routes } = app();

    const updated = await routes.request(
      "/api/app/push/preferences",
      json("PUT", { category: "low_balance", enabled: false }),
    );
    const read = pushPreferencesSchema.parse(
      await (await routes.request("/api/app/push/preferences")).json(),
    );

    expect(updated.status).toBe(200);
    expect(read.categories.low_balance).toBe(false);
    expect(read.categories.comment_reply).toBe(true);
  });
});
