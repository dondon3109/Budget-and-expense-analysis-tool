import { authErrorMessage, emailSchema, validateNewPassword } from "./auth-validation";

describe("mobile authentication validation", () => {
  it("normalizes email addresses without weakening validation", () => {
    expect(emailSchema.parse("  don@example.com ")).toBe("don@example.com");
    expect(emailSchema.safeParse("not-an-email").success).toBe(false);
  });

  it("matches the existing Zoption password policy", () => {
    expect(validateNewPassword("Short1!")).toBeTruthy();
    expect(validateNewPassword("A-longer-pass1!")).toBeNull();
  });

  it("does not expose Supabase's raw invalid-credential wording", () => {
    expect(authErrorMessage(new Error("Invalid login credentials"), "fallback")).toBe(
      "Email or password is incorrect.",
    );
  });
});
