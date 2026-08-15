import { buildBugDiagnostics, prepareSupportHistory, validateBugDraft, validateSupportMessage } from "./support-forms";
import type { SupportChatMessage } from "@/api/support";

describe("support form helpers", () => {
  it("trims history so the final message is the new user message", () => {
    const history: SupportChatMessage[] = [
      { role: "user", content: "hello" },
      { role: "assistant", content: "hi" },
    ];
    const prepared = prepareSupportHistory(history, "Transfers fail");
    expect(prepared.at(-1)).toEqual({ role: "user", content: "Transfers fail" });
    expect(prepared).toHaveLength(3);
  });

  it("caps history at the Worker limit", () => {
    const history: SupportChatMessage[] = Array.from({ length: 30 }, (_, index) => ({
      role: index % 2 === 0 ? ("user" as const) : ("assistant" as const),
      content: "message " + index,
    }));
    const prepared = prepareSupportHistory(history, "final");
    expect(prepared.length).toBeLessThanOrEqual(12);
    expect(prepared.at(-1)?.content).toBe("final");
  });

  it("rejects empty history by returning an empty array", () => {
    expect(prepareSupportHistory([], "")).toEqual([]);
  });

  it("validates message length", () => {
    expect(validateSupportMessage("hello")).toBe(null);
    expect(validateSupportMessage("  ")).toMatch(/Enter a message/);
    expect(validateSupportMessage("x".repeat(1201))).toMatch(/1,200 characters/);
  });

  it("builds safe diagnostics with an app route and standalone display", () => {
    const diagnostics = buildBugDiagnostics("/support");
    expect(diagnostics.route).toBe("/support");
    expect(diagnostics.displayMode).toBe("standalone");
    expect(diagnostics.releaseVersion.length).toBeGreaterThan(0);
    expect(diagnostics.viewportWidth).toBeGreaterThan(0);
    expect(["ios", "android", "other"]).toContain(diagnostics.platform);
  });

  it("validates bug report drafts with the shared schema", () => {
    const valid = {
      title: "Import preview crashes",
      category: "import" as const,
      actualBehavior: "App closes after mapping.",
      expectedBehavior: "Preview opens.",
      stepsToReproduce: "Pick a CSV, map, confirm.",
      frequency: "always" as const,
    };
    expect(validateBugDraft(valid)).toBe(null);
    expect(validateBugDraft({ ...valid, title: "x" })).toMatch(/5/);
    expect(validateBugDraft({ ...valid, frequency: "daily" as never })).toBeTruthy();
  });
});
