import { useDefaultSpendingAccountStore } from "./default-spending-account-store";

const STORAGE_KEY = "zoption-mobile-default-spending-account-v1";

// SecureStore has no native module under jest, so persistence runs against an
// in-memory map with the same shape.
jest.mock("expo-secure-store", () => {
  const store = new Map<string, string>();
  return {
    __store: store,
    getItemAsync: jest.fn(async (key: string) => store.get(key) ?? null),
    setItemAsync: jest.fn(async (key: string, value: string) => {
      store.set(key, value);
    }),
    deleteItemAsync: jest.fn(async (key: string) => {
      store.delete(key);
    }),
  };
});

const secureStore = jest.requireMock("expo-secure-store") as { __store: Map<string, string> };

describe("default spending account store", () => {
  beforeEach(() => {
    useDefaultSpendingAccountStore.setState({ accountId: null });
  });

  it("starts with no choice so the shared rule falls back to cash", () => {
    expect(useDefaultSpendingAccountStore.getState().accountId).toBeNull();
  });

  it("writes the choice and reads it back after a relaunch", async () => {
    useDefaultSpendingAccountStore.getState().setAccountId("account-gcash");
    await new Promise((resolve) => setTimeout(resolve, 0));
    const saved = secureStore.__store.get(STORAGE_KEY);
    expect(saved).toContain("account-gcash");

    useDefaultSpendingAccountStore.setState({ accountId: null });
    secureStore.__store.set(STORAGE_KEY, saved ?? "");

    await useDefaultSpendingAccountStore.persist.rehydrate();

    expect(useDefaultSpendingAccountStore.getState().accountId).toBe("account-gcash");
  });

  it("keeps no choice when the saved state is malformed", async () => {
    secureStore.__store.set(STORAGE_KEY, JSON.stringify({ state: { accountId: 42 }, version: 1 }));

    await useDefaultSpendingAccountStore.persist.rehydrate();

    expect(useDefaultSpendingAccountStore.getState().accountId).toBeNull();
  });
});
