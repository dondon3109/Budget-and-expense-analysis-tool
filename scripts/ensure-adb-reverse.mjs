#!/usr/bin/env node
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

export const DEFAULT_PORTS = [8081, 8787];

/**
 * Parses `adb devices` stdout into an array of active device serials.
 * Only lines with the status `device` are included (ignores offline/unauthorized).
 */
export function parseAdbDevices(output) {
  if (typeof output !== "string") return [];
  const lines = output.trim().split("\n");
  const devices = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const parts = line.split(/\s+/);
    if (parts.length >= 2 && parts[1] === "device") {
      devices.push(parts[0]);
    }
  }
  return devices;
}

/**
 * Parses `adb reverse --list` stdout into a Set of currently reversed local TCP ports.
 */
export function parseReversedPorts(output) {
  const ports = new Set();
  if (typeof output !== "string") return ports;
  const lines = output.trim().split("\n");
  for (const line of lines) {
    const match = line.match(/tcp:(\d+)\s+tcp:(\d+)/);
    if (match) {
      ports.add(Number(match[1]));
    }
  }
  return ports;
}

/**
 * Ensures specified ports are reversed for all connected Android devices.
 * Returns the list of ports reversed during this invocation.
 */
export function ensureAdbReverse(options = {}) {
  const execFn = options.execFn ?? execSync;
  const ports = options.ports ?? DEFAULT_PORTS;
  const log = options.log ?? console.log;

  let devicesOutput = "";
  try {
    devicesOutput = execFn("adb devices", {
      encoding: "utf8",
      stdio: ["pipe", "pipe", "ignore"],
    }).toString();
  } catch {
    // adb is either not installed or server not reachable; exit gracefully
    return [];
  }

  const devices = parseAdbDevices(devicesOutput);
  if (devices.length === 0) {
    return [];
  }

  const reversed = [];
  for (const serial of devices) {
    let listOutput = "";
    try {
      listOutput = execFn(`adb -s ${serial} reverse --list`, {
        encoding: "utf8",
        stdio: ["pipe", "pipe", "ignore"],
      }).toString();
    } catch {
      listOutput = "";
    }

    const currentPorts = parseReversedPorts(listOutput);
    for (const port of ports) {
      if (!currentPorts.has(port)) {
        try {
          execFn(`adb -s ${serial} reverse tcp:${port} tcp:${port}`, {
            encoding: "utf8",
            stdio: ["pipe", "pipe", "ignore"],
          });
          reversed.push({ serial, port });
        } catch {
          // ignore failure for individual port/device
        }
      }
    }
  }

  if (reversed.length > 0) {
    const summary = reversed.map((r) => `tcp:${r.port}`).join(", ");
    log(`[adb-reverse] Port forwarding established for Android (${summary}).`);
  }

  return reversed;
}

// CLI execution
const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];

if (isMain) {
  const watchIndex = process.argv.indexOf("--watch");
  if (watchIndex !== -1) {
    ensureAdbReverse();
    const intervalMs = 3000;
    setInterval(() => {
      ensureAdbReverse();
    }, intervalMs);
  } else {
    ensureAdbReverse();
  }
}
