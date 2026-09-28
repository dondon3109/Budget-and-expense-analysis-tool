import { vi, type Mock } from "vitest";

import type * as Api from "../../src/lib/api";

type ApiModule = typeof Api;
type ApiFunctionName = {
  [Name in keyof ApiModule]: ApiModule[Name] extends (...args: never[]) => unknown ? Name : never;
}[keyof ApiModule];

/**
 * Typed, unimplemented stubs for the lib/api calls a suite uses. vi.mock is hoisted above
 * imports, so load this inside the factory:
 *
 *   vi.mock("../src/lib/api", async () =>
 *     (await import("./helpers/api-mock")).createApiMock(["getAccounts"]),
 *   );
 *
 * Then import the call from "../src/lib/api" and program it with vi.mocked(...). A call the suite
 * did not name throws when the code under test reaches it, which keeps each suite's surface explicit.
 */
export function createApiMock<const Names extends readonly ApiFunctionName[]>(
  names: Names,
): { [Name in Names[number]]: Mock<ApiModule[Name]> } {
  return Object.fromEntries(names.map((name) => [name, vi.fn()])) as {
    [Name in Names[number]]: Mock<ApiModule[Name]>;
  };
}
