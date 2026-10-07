import { describe, expect, it } from "vitest";

import { renderMarkdown, summarizeFailures } from "./preview-failures.mjs";

const result = (message) => ({ status: "failed", errors: [{ message }] });

const report = (tests) => ({
  suites: [
    {
      title: "accessibility.spec.ts",
      file: "accessibility.spec.ts",
      suites: [
        {
          title: "accessibility — authenticated routes (desktop)",
          specs: tests.map(([title, test]) => ({
            title,
            file: "accessibility.spec.ts",
            line: 57,
            tests: [{ projectName: "desktop-chromium", ...test }],
          })),
        },
      ],
    },
  ],
  errors: [],
});

describe("summarizeFailures", () => {
  it("lists only tests that failed every attempt, with the full title path", () => {
    const summary = summarizeFailures(
      report([
        ["/app renders", { status: "unexpected", results: [result("a"), result("h1 missing")] }],
        ["/app/budgets renders", { status: "flaky", results: [result("timeout"), {}] }],
        ["/app/plan renders", { status: "expected", results: [{}] }],
      ]),
    );

    expect(summary.failed).toEqual([
      {
        project: "desktop-chromium",
        location: "accessibility.spec.ts:57",
        title:
          "accessibility.spec.ts › accessibility — authenticated routes (desktop) › /app renders",
        attempts: 2,
        error: "h1 missing",
      },
    ]);
  });

  it("strips terminal colours and truncates long errors", () => {
    const long = `\u001b[31mExpected\u001b[39m ${"x".repeat(4000)}`;
    const [failure] = summarizeFailures(
      report([["/app renders", { status: "unexpected", results: [result(long)] }]]),
    ).failed;

    expect(failure.error.startsWith("Expected x")).toBe(true);
    expect(failure.error.endsWith("[truncated]")).toBe(true);
  });

  it("flags a run where every failure is the fixture's sign-in error", () => {
    const signIn = "Error: [auth] seeded sign-in failed. Check that the account exists";
    expect(
      summarizeFailures(
        report([
          ["/app renders", { status: "unexpected", results: [result(signIn)] }],
          ["/app/plan renders", { status: "unexpected", results: [result(signIn)] }],
        ]),
      ).allSignInFailures,
    ).toBe(true);
    expect(
      summarizeFailures(
        report([
          ["/app renders", { status: "unexpected", results: [result(signIn)] }],
          ["/app/plan renders", { status: "unexpected", results: [result("h1 missing")] }],
        ]),
      ).allSignInFailures,
    ).toBe(false);
  });
});

describe("renderMarkdown", () => {
  it("renders errors outside a test before the failed tests", () => {
    const markdown = renderMarkdown({
      failed: [
        {
          project: "mobile-chromium",
          location: "accessibility.mobile.spec.ts:63",
          title: "/app renders",
          attempts: 2,
          error: "",
        },
      ],
      globalErrors: ["config threw"],
    });

    expect(markdown.indexOf("config threw")).toBeLessThan(markdown.indexOf("/app renders"));
    expect(markdown).toContain("(no error message recorded)");
  });
});
