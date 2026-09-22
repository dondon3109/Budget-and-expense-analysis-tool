/**
 * Fails when a bugfix draft carries user identifiers that must never reach a public pull request.
 *
 * Usage: node scripts/bugfix-scrub.mjs <patch> <text-file> [text-file...]
 *
 * The check uses detectIdentifierLeaks rather than detectSensitive: the latter is tuned for free
 * text and flags any "@" or any four digit run, so it would fail every source diff. Only added
 * lines of the patch are scanned; every other file is scanned whole, which is what covers the
 * report title carried in meta.json. A draft that fails here opens nothing.
 *
 * The offending line itself is never printed. The repository is public, so echoing it would leak
 * the identifier this check exists to refuse.
 */
import { readFileSync } from "node:fs";

import { detectIdentifierLeaks } from "../packages/shared/src/redaction.ts";

const [patchPath, ...textPaths] = process.argv.slice(2);
if (!patchPath || textPaths.length === 0) {
  console.error("usage: node scripts/bugfix-scrub.mjs <patch> <text-file> [text-file...]");
  process.exit(2);
}

const lines = [
  // Diff headers and removed lines are not content this draft introduces.
  ...readFileSync(patchPath, "utf8")
    .split("\n")
    .filter((line) => line.startsWith("+") && !line.startsWith("+++"))
    .map((line) => ({ line, where: patchPath })),
  ...textPaths.flatMap((path) =>
    readFileSync(path, "utf8")
      .split("\n")
      .map((line, index) => ({ line, where: `${path}:${index + 1}` })),
  ),
];

const failures = lines
  .map((entry) => ({ ...entry, hits: detectIdentifierLeaks(entry.line) }))
  .filter((entry) => entry.hits.length > 0);

if (failures.length > 0) {
  console.error("bugfix scrub failed: the draft carries user identifiers");
  for (const failure of failures) {
    console.error(`  ${failure.hits.join(",")}: ${failure.where}`);
  }
  process.exit(1);
}

console.log(`bugfix scrub clean: ${lines.length} lines checked`);
