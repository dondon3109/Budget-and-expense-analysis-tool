import { familyTapRoute } from "./family-push-tap";

jest.mock("@react-native-community/netinfo", () => ({ useNetInfo: () => ({}) }));
jest.mock("expo-notifications", () => ({}));
jest.mock("expo-router", () => ({ router: { push: jest.fn() } }));
jest.mock("./active-workspace", () => ({}));

const base = { path: "/family" as const, workspaceId: "family-1" };

describe("familyTapRoute", () => {
  it("opens the entry or remittance a push is about, else Home", () => {
    expect(familyTapRoute({ ...base, subjectKind: "transaction", subjectId: "t1" })).toEqual({
      pathname: "/(app)/transaction",
      params: { id: "t1" },
    });
    expect(familyTapRoute({ ...base, subjectKind: "remittance", subjectId: "r1" })).toEqual({
      pathname: "/(app)/remittance",
      params: { id: "r1" },
    });
    expect(familyTapRoute(base)).toBe("/(app)/(tabs)");
  });
});
