// Writes the approval summary the maintainer reads before approving the production environment:
// what ships, who wrote it, which migrations run, and whether anything under a CODEOWNERS path
// changed. Production Release runs it in the approval-summary job, which finishes before the
// gated deploy job starts, so the summary exists the moment the approval request appears.
//
// Env: RELEASE_VERSION, PREVIOUS_VERSION, BUNDLE_SHA256, PREVIEW_RESULT, RUN_URL, and optionally
// ATTESTATION_URL. Reads the checkout (full history) at the release commit. Writes
// GITHUB_STEP_SUMMARY and a short `message` output for the Telegram notice.
import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { appendFile, readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";

const run = promisify(execFile);
const MAX_SQL_LINES = 300;
const MAX_NOTICE_CHANGES = 8;

async function git(...args) {
  const { stdout } = await run("git", args, { maxBuffer: 32 * 1024 * 1024 });
  return stdout;
}

/** Patterns of a CODEOWNERS file that name at least one owner, as path matchers. */
export function parseCodeowners(text) {
  const matchers = [];
  for (const raw of text.split("\n")) {
    const [pattern, ...owners] = raw.replace(/#.*$/, "").trim().split(/\s+/);
    if (!pattern || owners.length === 0) continue;
    const directory = pattern.endsWith("/");
    const body = pattern.replace(/\/$/, "");
    const anchored = body.startsWith("/") || body.includes("/");
    const source = body
      .replace(/^\//, "")
      .replace(/[.+^${}()|[\]\\]/g, "\\$&")
      .replace(/\*\*/g, "\uE000")
      .replace(/\*/g, "[^/]*")
      .replace(/\?/g, "[^/]")
      .replace(/\uE000/g, ".*");
    const tail = directory ? "/.*$" : "(?:/.*)?$";
    matchers.push(new RegExp(`${anchored ? "^" : "^(?:.*/)?"}${source}${tail}`));
  }
  return matchers;
}

export function ownedPaths(matchers, paths) {
  return paths.filter((path) => matchers.some((matcher) => matcher.test(path)));
}

/** A commit author that is a GitHub App or Dependabot: its name or noreply email ends in [bot]. */
export function isBotAuthor(name, email) {
  return /\[bot\]/i.test(name) || /\[bot\]@users\.noreply\.github\.com$/i.test(email);
}

export function pullRequestNumber(subject) {
  return subject.match(/\(#(\d+)\)\s*$/)?.[1] ?? null;
}

async function commitsSince(tag) {
  const log = await git("log", "--no-merges", "--format=%h%x1f%an%x1f%ae%x1f%s", `${tag}..HEAD`);
  return log
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [sha, name, email, subject] = line.split("\u001f");
      return { sha, name, subject, bot: isBotAuthor(name, email), pr: pullRequestNumber(subject) };
    });
}

async function newMigrations(tag) {
  const names = (
    await git("diff", "--name-only", "--diff-filter=A", tag, "HEAD", "--", "db/migrations")
  )
    .split("\n")
    .filter((name) => name.endsWith(".sql"));
  return Promise.all(
    names.map(async (name) => {
      const lines = (await readFile(name, "utf8")).trimEnd().split("\n");
      const shown = lines.slice(0, MAX_SQL_LINES).join("\n");
      return { name, sql: shown, omitted: Math.max(0, lines.length - MAX_SQL_LINES) };
    }),
  );
}

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

async function main() {
  const version = required("RELEASE_VERSION");
  const previous = required("PREVIOUS_VERSION");
  const sha256 = required("BUNDLE_SHA256");
  const previewResult = required("PREVIEW_RESULT");
  const runUrl = required("RUN_URL");
  const attestation = process.env.ATTESTATION_URL?.trim();
  const tag = `v${previous}`;

  const commits = await commitsSince(tag);
  const migrations = await newMigrations(tag);
  const changed = (await git("diff", "--name-only", tag, "HEAD")).split("\n").filter(Boolean);
  const owners = parseCodeowners(await readFile(".github/CODEOWNERS", "utf8"));
  const owned = ownedPaths(owners, changed);
  const bots = commits.filter((commit) => commit.bot);

  const summary = [
    `## Zoption v${version} is waiting for production approval`,
    "",
    `Replaces v${previous}. Approve the \`production\` environment on [this run](${runUrl}) to deploy.`,
    "",
    "| | |",
    "|---|---|",
    `| Preview deploy and smoke test | ${previewResult === "success" ? "passed" : `**${previewResult}**`} |`,
    `| Bundle sha256 | \`${sha256}\` |`,
    `| Provenance | ${attestation ? `[attestation](${attestation})` : "not recorded"} |`,
    `| Changes since v${previous} | ${commits.length}, of which **${bots.length} bot-authored** |`,
    `| New D1 migrations | ${migrations.length} |`,
    `| CODEOWNERS paths changed | ${owned.length === 0 ? "none" : `**${owned.length} file(s)**`} |`,
    "",
    "### Changes",
    "",
    ...(commits.length === 0
      ? ["None."]
      : commits.map(
          (commit) =>
            `- ${commit.bot ? "**[bot]** " : ""}${commit.subject} (\`${commit.sha}\`, ${commit.name}${commit.pr ? `, #${commit.pr}` : ""})`,
        )),
    "",
    "### New D1 migrations",
    "",
    ...(migrations.length === 0
      ? ["None."]
      : migrations.flatMap(({ name, sql, omitted }) => [
          `#### \`${name}\``,
          "",
          "```sql",
          sql,
          "```",
          ...(omitted > 0 ? ["", `_${omitted} more line(s) not shown._`] : []),
          "",
        ])),
    "### CODEOWNERS paths changed",
    "",
    ...(owned.length === 0 ? ["None."] : owned.map((path) => `- \`${path}\``)),
    "",
  ].join("\n");
  await appendFile(required("GITHUB_STEP_SUMMARY"), `${summary}\n`);

  const shownChanges = commits
    .slice(0, MAX_NOTICE_CHANGES)
    .map((commit) => `- ${commit.bot ? "[bot] " : ""}${commit.subject}`);
  const more = commits.length - shownChanges.length;
  const message = [
    `Zoption v${version} is waiting for production approval (replaces v${previous}).`,
    `Preview: ${previewResult}. Bot-authored changes: ${bots.length} of ${commits.length}. New migrations: ${migrations.length}. CODEOWNERS paths changed: ${owned.length === 0 ? "none" : owned.length}.`,
    ...shownChanges,
    ...(more > 0 ? [`...and ${more} more`] : []),
    runUrl,
  ].join("\n");
  const delimiter = `EOF_${randomUUID()}`;
  await appendFile(required("GITHUB_OUTPUT"), `message<<${delimiter}\n${message}\n${delimiter}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    await main();
  } catch (error) {
    console.error(`::error::${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}
