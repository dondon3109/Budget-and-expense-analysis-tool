import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, resolve } from "node:path";

const androidRoot = resolve(import.meta.dirname, "..");
const repositoryRoot = resolve(androidRoot, "../..");
const webRoot = resolve(repositoryRoot, "apps/web");
const metadataPath = resolve(webRoot, "src/releases/androidRelease.json");
const metadata = JSON.parse(await readFile(metadataPath, "utf8"));
const sourceApk = resolve(
  process.argv[2] ?? resolve(homedir(), "Builds/Zoption", metadata.filename),
);

if (basename(sourceApk) !== metadata.filename) {
  throw new Error(
    `Expected release filename ${metadata.filename}, received ${basename(sourceApk)}.`,
  );
}

const sourceBytes = await readFile(sourceApk);
const sourceStats = await stat(sourceApk);
const checksum = createHash("sha256").update(sourceBytes).digest("hex");

if (sourceStats.size !== metadata.sizeBytes) {
  throw new Error(`APK size ${sourceStats.size} does not match metadata ${metadata.sizeBytes}.`);
}
if (checksum !== metadata.sha256) {
  throw new Error(`APK SHA-256 ${checksum} does not match committed release metadata.`);
}

const downloadsDirectory = resolve(webRoot, "dist/downloads");
const destinationApk = resolve(downloadsDirectory, metadata.filename);
const checksumFilename = `${metadata.filename}.sha256`;

await mkdir(downloadsDirectory, { recursive: true });
await copyFile(sourceApk, destinationApk);
await writeFile(
  resolve(downloadsDirectory, checksumFilename),
  `${checksum}  ${metadata.filename}\n`,
);
await writeFile(
  resolve(downloadsDirectory, "latest.json"),
  `${JSON.stringify(
    {
      packageId: metadata.packageId,
      versionName: metadata.versionName,
      versionCode: metadata.versionCode,
      filename: metadata.filename,
      downloadPath: metadata.downloadPath,
      sha256: metadata.sha256,
      sizeBytes: metadata.sizeBytes,
      releaseDate: metadata.releaseDate,
    },
    null,
    2,
  )}\n`,
);

console.log(`Staged ${destinationApk} (${sourceStats.size} bytes, SHA-256 ${checksum}).`);
