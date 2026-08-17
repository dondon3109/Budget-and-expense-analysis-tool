import { appendFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

import semanticRelease from "semantic-release";

export function semanticReleaseOutputs(result) {
  if (!result) return { releaseNeeded: false };
  return {
    releaseNeeded: true,
    type: result.nextRelease.type,
    version: result.nextRelease.version,
  };
}

export async function writeSemanticReleaseOutputs(result, outputPath) {
  if (!outputPath) throw new Error("GITHUB_OUTPUT is required.");
  const outputs = semanticReleaseOutputs(result);
  const lines = [`release_needed=${outputs.releaseNeeded}`];
  if (outputs.releaseNeeded) {
    lines.push(`type=${outputs.type}`, `version=${outputs.version}`);
  }
  await appendFile(outputPath, `${lines.join("\n")}\n`);
  return outputs;
}

async function main() {
  const result = await semanticRelease({ dryRun: true });
  const outputs = await writeSemanticReleaseOutputs(result, process.env.GITHUB_OUTPUT);
  console.log(
    outputs.releaseNeeded
      ? `Semantic-release selected ${outputs.type} version ${outputs.version}.`
      : "No release-producing Conventional Commits were found.",
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
