// Fails when a newly added migration drops or renames anything, unless the pull request carries
// the destructive-migration label. A release applies migrations before the Worker deploys, and
// the previous Worker must keep working against the new schema, so a destructive change belongs
// in the contract step of expand-then-contract (apps/api/AGENTS.md), on purpose.
//
//   node scripts/check-migration-safety.mjs <migration.sql>...
//
// Env: ALLOW_DESTRUCTIVE=true when the pull request has the label.
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const DESTRUCTIVE = /\b(DROP|RENAME)\b/i;

/** Lines of SQL that drop or rename, ignoring `--` comments and block comments. */
export function destructiveLines(sql) {
  const withoutBlocks = sql.replace(/\/\*[\s\S]*?\*\//g, (block) => block.replace(/[^\n]/g, " "));
  return withoutBlocks
    .split("\n")
    .map((line, index) => ({ line: index + 1, text: line.replace(/--.*$/, "").trim() }))
    .filter(({ text }) => DESTRUCTIVE.test(text));
}

async function main(files) {
  const allowed = process.env.ALLOW_DESTRUCTIVE === "true";
  let found = false;
  for (const file of files) {
    for (const { line, text } of destructiveLines(await readFile(file, "utf8"))) {
      found = true;
      const level = allowed ? "warning" : "error";
      console.log(`::${level} file=${file},line=${line}::Destructive statement: ${text}`);
    }
  }
  if (!found) {
    console.log(`Checked ${files.length} new migration file(s): no DROP or RENAME.`);
    return;
  }
  if (allowed) {
    console.log("The destructive-migration label is set; the statements above are allowed.");
    return;
  }
  console.log(
    "::error::A new migration drops or renames. Split it into expand then contract, or add the destructive-migration label to this pull request.",
  );
  process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main(process.argv.slice(2));
}
