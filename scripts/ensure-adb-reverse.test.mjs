import { describe, expect, it, vi } from "vitest";
import {
  ensureAdbReverse,
  parseAdbDevices,
  parseReversedPorts,
} from "./ensure-adb-reverse.mjs";

describe("ensure-adb-reverse", () => {
  describe("parseAdbDevices", () => {
    it("parses active devices and filters out offline or unauthorized devices", () => {
      const sample = `List of devices attached
EYLFLJOZN755CIKZ\tdevice
emulator-5554\toffline
unauthorized_device\tunauthorized
192.168.1.100:5555\tdevice
`;
      expect(parseAdbDevices(sample)).toEqual([
        "EYLFLJOZN755CIKZ",
        "192.168.1.100:5555",
      ]);
    });

    it("handles empty or malformed outputs", () => {
      expect(parseAdbDevices("")).toEqual([]);
      expect(parseAdbDevices("List of devices attached\n")).toEqual([]);
      expect(parseAdbDevices(null)).toEqual([]);
    });
  });

  describe("parseReversedPorts", () => {
    it("parses reversed TCP ports from adb reverse list output", () => {
      const sample = `(reverse) UsbFfs tcp:8081 tcp:8081
(reverse) UsbFfs tcp:8787 tcp:8787
`;
      const ports = parseReversedPorts(sample);
      expect(ports.has(8081)).toBe(true);
      expect(ports.has(8787)).toBe(true);
      expect(ports.has(3000)).toBe(false);
    });

    it("handles empty list output", () => {
      expect(parseReversedPorts("").size).toBe(0);
      expect(parseReversedPorts(undefined).size).toBe(0);
    });
  });

  describe("ensureAdbReverse", () => {
    it("reverses missing ports when device is connected", () => {
      const mockExec = vi.fn((cmd) => {
        if (cmd === "adb devices") {
          return "List of devices attached\ndevice-123\tdevice\n";
        }
        if (cmd === "adb -s device-123 reverse --list") {
          return "UsbFfs tcp:8081 tcp:8081\n"; // 8787 is missing
        }
        return "";
      });
      const log = vi.fn();

      const reversed = ensureAdbReverse({
        execFn: mockExec,
        ports: [8081, 8787],
        log,
      });

      expect(reversed).toEqual([{ serial: "device-123", port: 8787 }]);
      expect(mockExec).toHaveBeenCalledWith(
        "adb -s device-123 reverse tcp:8787 tcp:8787",
        expect.anything(),
      );
      expect(log).toHaveBeenCalled();
    });

    it("does nothing when all ports are already reversed", () => {
      const mockExec = vi.fn((cmd) => {
        if (cmd === "adb devices") {
          return "List of devices attached\ndevice-123\tdevice\n";
        }
        if (cmd === "adb -s device-123 reverse --list") {
          return "UsbFfs tcp:8081 tcp:8081\nUsbFfs tcp:8787 tcp:8787\n";
        }
        return "";
      });
      const log = vi.fn();

      const reversed = ensureAdbReverse({
        execFn: mockExec,
        ports: [8081, 8787],
        log,
      });

      expect(reversed).toEqual([]);
      expect(log).not.toHaveBeenCalled();
    });

    it("gracefully returns empty array when adb fails or is missing", () => {
      const mockExec = vi.fn(() => {
        throw new Error("adb: command not found");
      });
      const reversed = ensureAdbReverse({ execFn: mockExec });
      expect(reversed).toEqual([]);
    });
  });
});
