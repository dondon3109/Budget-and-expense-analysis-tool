#!/usr/bin/env node
/**
 * Turns the preview audit's Playwright JSON report into the short failure summary the Preview
 * Failure Fix workflow hands to Claude, so the model reads each failing test's title and error
 * instead of the HTML report.
 *
 *   node scripts/preview-failures.mjs playwright-report/results.json failures.md
 *
 * Writes the markdown summary to the second path and prints a JSON line with the counts the
 * workflow branches on.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

// An error message can carry a whole page snapshot; the head is what explains the failure.
const MAX_ERROR_CHARS = 3000;
// eslint-disable-next-line no-control-regex -- the escape character is what is being stripped
const ANSI = /\u001b\[[0-9;]*m/g;
// Thrown by e2e/fixtures/authenticated.ts when E2E_REQUIRE_AUTH is set and sign-in fails.
const SIGN_IN_FAILURE = /\[auth\] \w+ sign-in failed/;

/** Every spec in the report, flattened out of its nested suites. */
function collectSpecs(suites, titlePath = []) {
  return (suites ?? []).flatMap((suite) => {
    const path = suite.title ? [...titlePath, suite.title] : titlePath;
    const own = (suite.specs ?? []).map((spec) => ({ spec, titlePath: path }));
    return [...own, ...collectSpecs(suite.suites, path)];
  });
}

function errorText(result) {
  const messages = (result.errors?.length ? result.errors : [result.error])
    .map((error) => error?.message ?? "")
    .filter(Boolean);
  const text = messages.join("\n\n").replace(ANSI, "").trim();
  return text.length > MAX_ERROR_CHARS ? `${text.slice(0, MAX_ERROR_CHARS)}\n[truncated]` : text;
}

/**
 * The tests that failed every attempt ("unexpected"), with their last error. A test that passed
 * on retry is "flaky" in Playwright's terms and did not fail the run, so it is not listed.
 */
export function summarizeFailures(report) {
  const failed = [];
  for (const { spec, titlePath } of collectSpecs(report.suites)) {
    for (const test of spec.tests ?? []) {
      if (test.status !== "unexpected") continue;
      const last = test.results?.at(-1) ?? {};
      failed.push({
        project: test.projectName ?? "",
        location: `${spec.file}:${spec.line}`,
        title: [...titlePath, spec.title].filter(Boolean).join(" › "),
        attempts: test.results?.length ?? 0,
        error: errorText(last),
      });
    }
  }
  // Errors outside any test, such as a config that threw before collection.
  const globalErrors = (report.errors ?? [])
    .map((error) => (error.message ?? "").replace(ANSI, "").trim())
    .filter(Boolean);

  const allSignInFailures =
    failed.length > 0 && failed.every((failure) => SIGN_IN_FAILURE.test(failure.error));
  return { failed, globalErrors, allSignInFailures };
}

export function renderMarkdown({ failed, globalErrors }) {
  const lines = [`# Preview signed-in audit: ${failed.length} failed test(s)`, ""];
  for (const error of globalErrors) {
    lines.push("## Error outside a test", "", "```", error, "```", "");
  }
  for (const failure of failed) {
    lines.push(
      `## ${failure.title}`,
      "",
      `- Project: ${failure.project}`,
      `- Spec: ${failure.location}`,
      `- Attempts: ${failure.attempts}`,
      "",
      "```",
      failure.error || "(no error message recorded)",
      "```",
      "",
    );
  }
  return lines.join("\n");
}

function main() {
  const [input, output] = process.argv.slice(2);
  if (!input || !output) {
    console.error("Usage: node scripts/preview-failures.mjs <results.json> <failures.md>");
    process.exit(1);
  }
  const summary = summarizeFailures(JSON.parse(readFileSync(input, "utf8")));
  writeFileSync(output, renderMarkdown(summary), "utf8");
  console.log(
    JSON.stringify({
      failed: summary.failed.length,
      globalErrors: summary.globalErrors.length,
      allSignInFailures: summary.allSignInFailures,
    }),
  );
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main();
}
