/**
 * Fails when a bugfix draft carries user identifiers that must never reach a public pull request.
 *
 * Usage: node scripts/bugfix-scrub.mjs <patch> <pr-body>
 *
 * The check uses detectIdentifierLeaks rather than detectSensitive: the latter is tuned for free
 * text and flags any "@" or any four digit run, so it would fail every source diff. Only added
 * lines are scanned, and a draft that fails here opens nothing.
 */
import { readFileSync } from "node:fs";

import { detectIdentifierLeaks } from "../packages/shared/src/redaction.ts";

const EXCERPT_LIMIT = 120;

const [patchPath, bodyPath] = process.argv.slice(2);
if (!patchPath || !bodyPath) {
  console.error("usage: node scripts/bugfix-scrub.mjs <patch> <pr-body>");
  process.exit(2);
}

// Diff headers and removed lines are not content this draft introduces.
const addedLines = readFileSync(patchPath, "utf8")
  .split("\n")
  .filter((line) => line.startsWith("+") && !line.startsWith("+++"));

const checked = [...addedLines, ...readFileSync(bodyPath, "utf8").split("\n")];

const failures = checked
  .map((line) => ({ line, hits: detectIdentifierLeaks(line) }))
  .filter((entry) => entry.hits.length > 0);

if (failures.length > 0) {
  console.error("bugfix scrub failed: the draft carries user identifiers");
  for (const failure of failures) {
    console.error(`  ${failure.hits.join(",")}: ${failure.line.slice(0, EXCERPT_LIMIT)}`);
  }
  process.exit(1);
}

console.log(`bugfix scrub clean: ${checked.length} lines checked`);
