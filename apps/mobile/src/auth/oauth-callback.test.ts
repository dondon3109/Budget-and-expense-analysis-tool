import { parseOAuthCallbackUrl } from "./oauth-callback";

describe("parseOAuthCallbackUrl", () => {
  it("extracts a PKCE code from a query-style callback", () => {
    expect(parseOAuthCallbackUrl("zoption-dev://auth/callback?code=abc-123")).toEqual({
      code: "abc-123",
    });
  });

  it("extracts a code when extra query parameters are present", () => {
    expect(
      parseOAuthCallbackUrl("zoption-dev://auth/callback?code=abc-123&next=update-password"),
    ).toEqual({ code: "abc-123" });
  });

  it("extracts a code from a fragment-style callback", () => {
    expect(parseOAuthCallbackUrl("zoption-dev://auth/callback#code=frag-99")).toEqual({
      code: "frag-99",
    });
  });

  it("surfaces the provider error and its description", () => {
    expect(
      parseOAuthCallbackUrl(
        "zoption-dev://auth/callback?error=access_denied&error_description=user%20said%20no",
      ),
    ).toEqual({ error: "user said no" });
  });

  it("falls back to the raw error when no description is given", () => {
    expect(parseOAuthCallbackUrl("zoption-dev://auth/callback?error=server_error")).toEqual({
      error: "server_error",
    });
  });

  it("returns null when no code or error is present", () => {
    expect(parseOAuthCallbackUrl("zoption-dev://auth/callback")).toBeNull();
  });
});
