import { act, fireEvent, render, screen } from "@testing-library/react-native";

import { resetAccountLinkForTests, setSignedInAccount } from "@/telemetry/account-link";
import { telemetry } from "@/telemetry/telemetry";
import { UsageAnalyticsCard, UsageAnalyticsPromptHost } from "./UsageAnalytics";

jest.mock("expo-secure-store", () => {
  const store = new Map<string, string>();
  return {
    __store: store,
    getItemAsync: jest.fn(async (key: string) => store.get(key) ?? null),
    setItemAsync: jest.fn(async (key: string, value: string) => {
      store.set(key, value);
    }),
  };
});

jest.mock("@/telemetry/telemetry", () => ({
  telemetry: { identify: jest.fn(), reset: jest.fn(async () => undefined) },
}));

const secureStore = jest.requireMock("expo-secure-store") as { __store: Map<string, string> };
const account = { id: "user-1", email: "person@example.com" };

async function signIn(next = account) {
  await act(async () => {
    setSignedInAccount(next);
  });
}

beforeEach(() => {
  secureStore.__store.clear();
  resetAccountLinkForTests();
  jest.clearAllMocks();
});

describe("usage analytics account link", () => {
  it("asks a new account, and links it only after Allow", async () => {
    await render(<UsageAnalyticsPromptHost />);
    expect(screen.queryByText("Help improve Zoption")).toBeNull();

    await signIn();
    expect(screen.getByText("Help improve Zoption")).toBeTruthy();
    expect(telemetry.identify).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByText("Allow"));
    expect(telemetry.identify).toHaveBeenCalledWith(account);
    expect(screen.queryByText("Help improve Zoption")).toBeNull();
    expect(secureStore.__store.get("zoption.analytics.account-link.user-1")).toBe("granted");
  });

  it("keeps the account anonymous after Not now and does not ask again", async () => {
    await render(<UsageAnalyticsPromptHost />);
    await signIn();
    await fireEvent.press(screen.getByText("Not now"));
    expect(telemetry.identify).not.toHaveBeenCalled();
    expect(telemetry.reset).toHaveBeenCalled();

    await signIn();
    expect(screen.queryByText("Help improve Zoption")).toBeNull();
    expect(telemetry.identify).not.toHaveBeenCalled();
  });

  it("identifies a returning account that already allowed it, without asking", async () => {
    secureStore.__store.set("zoption.analytics.account-link.user-1", "granted");
    await render(<UsageAnalyticsPromptHost />);
    await signIn();

    expect(screen.queryByText("Help improve Zoption")).toBeNull();
    expect(telemetry.identify).toHaveBeenCalledWith(account);
  });

  it("lets a signed-in account change the choice in Preferences", async () => {
    secureStore.__store.set("zoption.analytics.account-link.user-1", "granted");
    await render(<UsageAnalyticsCard />);
    expect(screen.queryByText("Usage analytics")).toBeNull();

    await signIn();
    await fireEvent.press(screen.getByText("Usage analytics"));
    await fireEvent(
      screen.getByLabelText("Link usage analytics to my account"),
      "valueChange",
      false,
    );

    expect(telemetry.reset).toHaveBeenCalled();
    expect(secureStore.__store.get("zoption.analytics.account-link.user-1")).toBe("declined");
  });
});
