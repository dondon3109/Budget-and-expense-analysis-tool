#!/usr/bin/env node
// Structural guardrails that keep the tree readable in one pass by people and agents:
//
// 1. No source or stylesheet file grows past MAX_LINES. Files that were already larger when the
//    rule landed are listed in OVERSIZE_CEILINGS at their size then; they may shrink but never
//    grow. Shrinking one below its ceiling needs no edit here, so a refactor elsewhere never has to
//    touch this high-risk script. Prune the list when an entry is reported as removable.
// 2. Every expo-router route file in apps/mobile/app other than a layout is a one-line re-export
//    of a screen in src/features. Legacy route files with a body are listed in
//    ROUTE_BODY_CEILINGS the same way.

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const MAX_LINES = 1000;

const CHECKED_EXTENSIONS = /\.(ts|tsx|js|mjs|cjs|css)$/;

// Data catalogs that grow with content, not with logic.
const EXEMPT = new Set([
  "apps/web/src/releases/currentRelease.ts",
  "packages/shared/src/financeGuides.ts",
]);

export const OVERSIZE_CEILINGS = {
  "apps/api/src/db/billing.ts": 1123,
  "apps/api/src/db/mobile-sync.ts": 2251,
  "apps/api/tests/app.test.ts": 2182,
  "apps/api/tests/mobile-sync.test.ts": 2900,
  "apps/api/tests/voice-stream.test.ts": 1015,
  "apps/mobile/app/(app)/(tabs)/index.tsx": 1316,
  "apps/mobile/app/(app)/(tabs)/transactions.tsx": 1041,
  "apps/mobile/src/db/local-workspace-state.tsx": 1382,
  "apps/mobile/src/db/repository.ts": 1244,
  "apps/mobile/src/db/transaction-mutation-repository.test.ts": 2068,
  "apps/mobile/src/db/transaction-mutation-repository.ts": 1878,
  "apps/mobile/src/db/transaction-mutations/conflicts.ts": 1593,
  "apps/mobile/src/features/assistant/AssistantScreen.tsx": 1500,
  "apps/mobile/src/features/assistant/AssistantVoiceConversation.tsx": 1357,
  "apps/mobile/src/features/budgets/BudgetsScreen.tsx": 1374,
  "apps/web/src/components/assistant/AssistantVoiceConversation.tsx": 1119,
  "apps/web/src/lib/api.ts": 1712,
  "apps/web/src/pages/AdminProviderConfigsPage.tsx": 1025,
  "apps/web/src/pages/AssistantPage.css": 2947,
  "apps/web/src/pages/CalendarPage.css": 1124,
  "apps/web/src/pages/DashboardPage.css": 1550,
  "apps/web/src/pages/DashboardPage.tsx": 1360,
  "apps/web/src/pages/ImportPage.tsx": 1381,
  "apps/web/src/pages/LandingPage.css": 3568,
  "apps/web/src/pages/SettingsPage.tsx": 1051,
  "apps/web/src/pages/TransactionsPage.tsx": 1262,
  "apps/web/src/styles/foundation.css": 1012,
  "db/schema.ts": 1152,
  "packages/shared/src/smsNotificationParser.ts": 1421,
};

const ROUTE_FILE = /^apps\/mobile\/app\/.+\.tsx?$/;
const LAYOUT_FILE = /(^|\/)_layout\.tsx?$/;
const THIN_ROUTE = /^export \{ [A-Za-z0-9_]+ as default \} from "@\/features\/[^"]+";$/;

export const ROUTE_BODY_CEILINGS = {
  "apps/mobile/app/(app)/(tabs)/index.tsx": 1316,
  "apps/mobile/app/(app)/(tabs)/more.tsx": 433,
  "apps/mobile/app/(app)/(tabs)/transactions.tsx": 1041,
  "apps/mobile/app/(app)/receipt-scan.tsx": 941,
  "apps/mobile/app/(public)/forgot-password.tsx": 72,
  "apps/mobile/app/(public)/index.tsx": 458,
  "apps/mobile/app/(public)/sign-in.tsx": 196,
  "apps/mobile/app/+not-found.tsx": 16,
  "apps/mobile/app/auth/callback.tsx": 79,
  "apps/mobile/app/auth/update-password.tsx": 89,
  "apps/mobile/app/index.tsx": 17,
};

/** Line count with `wc -l` semantics, so the numbers above match what a shell reports. */
export function countLines(text) {
  let lines = 0;
  for (let index = text.indexOf("\n"); index !== -1; index = text.indexOf("\n", index + 1)) {
    lines += 1;
  }
  return lines;
}

/**
 * Checks `files` ({ path, text } with repo-relative POSIX paths) and returns the failures plus
 * notices for ceilings that no longer hold anything back.
 */
export function checkStructure(
  files,
  { oversizeCeilings = OVERSIZE_CEILINGS, routeBodyCeilings = ROUTE_BODY_CEILINGS } = {},
) {
  const failures = [];
  const notices = [];
  const seen = new Set();

  for (const { path, text } of files) {
    seen.add(path);
    const lines = countLines(text);

    if (CHECKED_EXTENSIONS.test(path) && !EXEMPT.has(path)) {
      const ceiling = oversizeCeilings[path];
      if (ceiling === undefined && lines > MAX_LINES) {
        failures.push(
          `${path} has ${lines} lines, over the ${MAX_LINES} line limit. Split it along a responsibility seam.`,
        );
      } else if (ceiling !== undefined && lines > ceiling) {
        failures.push(
          `${path} grew to ${lines} lines, past its ${ceiling} line ceiling. Split it instead of growing it.`,
        );
      } else if (ceiling !== undefined && lines <= MAX_LINES) {
        notices.push(`${path} is now ${lines} lines; remove it from OVERSIZE_CEILINGS.`);
      }
    }

    if (ROUTE_FILE.test(path) && !LAYOUT_FILE.test(path)) {
      const thin = THIN_ROUTE.test(text.trim());
      const ceiling = routeBodyCeilings[path];
      if (!thin && ceiling === undefined) {
        failures.push(
          `${path} must be one line: export { XScreen as default } from "@/features/<area>/XScreen"; move the body into src/features.`,
        );
      } else if (!thin && lines > ceiling) {
        failures.push(
          `${path} grew to ${lines} lines, past its ${ceiling} line ceiling. Move the body into src/features.`,
        );
      } else if (thin && ceiling !== undefined) {
        notices.push(`${path} is now a thin re-export; remove it from ROUTE_BODY_CEILINGS.`);
      }
    }
  }

  for (const path of [...Object.keys(oversizeCeilings), ...Object.keys(routeBodyCeilings)]) {
    if (!seen.has(path)) notices.push(`${path} no longer exists; remove its ceiling.`);
  }

  return { failures, notices: [...new Set(notices)] };
}

function listRepositoryFiles(root) {
  // Untracked files count too, so a new oversized file fails before it is committed.
  const output = execFileSync(
    "git",
    ["ls-files", "--cached", "--others", "--exclude-standard", "--deduplicate", "-z"],
    { cwd: root, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
  );
  return output
    .split("\0")
    .filter((path) => path && (CHECKED_EXTENSIONS.test(path) || ROUTE_FILE.test(path)));
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const files = [];
  for (const path of listRepositoryFiles(root)) {
    try {
      files.push({ path, text: readFileSync(resolve(root, path), "utf8") });
    } catch (error) {
      // A tracked file deleted in the working tree is simply gone.
      if (error?.code !== "ENOENT") throw error;
    }
  }

  const { failures, notices } = checkStructure(files);
  for (const notice of notices) console.log(`notice: ${notice}`);
  for (const failure of failures) console.error(`error: ${failure}`);
  if (failures.length > 0) process.exit(1);
  console.log(`check-structure: ${files.length} files within limits.`);
}
