import { describe, expect, it } from "vitest";

import { MAX_LINES, checkStructure, countLines } from "./check-structure.mjs";

const lines = (count) => "x\n".repeat(count);
const thinRoute = 'export { HomeScreen as default } from "@/features/dashboard/HomeScreen";\n';
const noCeilings = { oversizeCeilings: {} };

describe("countLines", () => {
  it("counts newlines like wc -l", () => {
    expect(countLines("")).toBe(0);
    expect(countLines("a")).toBe(0);
    expect(countLines("a\nb\n")).toBe(2);
  });
});

describe("checkStructure", () => {
  it("accepts files at the limit and fails a file past it", () => {
    const { failures } = checkStructure(
      [
        { path: "apps/web/src/Ok.tsx", text: lines(MAX_LINES) },
        { path: "apps/web/src/Big.tsx", text: lines(MAX_LINES + 1) },
        { path: "docs/long.md", text: lines(MAX_LINES * 2) },
      ],
      noCeilings,
    );
    expect(failures).toHaveLength(1);
    expect(failures[0]).toContain("apps/web/src/Big.tsx");
  });

  it("holds an oversize file to its ceiling and reports a ceiling that is no longer needed", () => {
    const oversizeCeilings = {
      "apps/api/src/db/big.ts": 1500,
      "apps/api/src/db/shrunk.ts": 1500,
      "apps/api/src/db/gone.ts": 1500,
    };
    const { failures, notices } = checkStructure(
      [
        { path: "apps/api/src/db/big.ts", text: lines(1501) },
        { path: "apps/api/src/db/shrunk.ts", text: lines(400) },
      ],
      { oversizeCeilings },
    );
    expect(failures).toEqual([expect.stringContaining("apps/api/src/db/big.ts grew to 1501")]);
    expect(notices).toEqual([
      expect.stringContaining("apps/api/src/db/shrunk.ts is now 400 lines"),
      expect.stringContaining("apps/api/src/db/gone.ts no longer exists"),
    ]);
  });

  it("exempts data catalogs", () => {
    const { failures } = checkStructure(
      [{ path: "packages/web-common/src/releases/currentRelease.ts", text: lines(5000) }],
      noCeilings,
    );
    expect(failures).toEqual([]);
  });

  it("requires mobile routes to be one-line feature re-exports, except layouts", () => {
    const { failures } = checkStructure(
      [
        { path: "apps/mobile/app/(app)/goals.tsx", text: thinRoute },
        { path: "apps/mobile/app/(app)/_layout.tsx", text: "export default function L() {}\n" },
        {
          path: "apps/mobile/app/(app)/debts.tsx",
          text: 'import { DebtsScreen } from "@/features/debts/DebtsScreen";\nexport default DebtsScreen;\n',
        },
        {
          path: "apps/mobile/app/(app)/elsewhere.tsx",
          text: 'export { X as default } from "@/db/repository";\n',
        },
      ],
      noCeilings,
    );
    expect(failures).toHaveLength(2);
    expect(failures[0]).toContain("apps/mobile/app/(app)/debts.tsx must be one line");
    expect(failures[1]).toContain("apps/mobile/app/(app)/elsewhere.tsx must be one line");
  });
});
