import { useRef, useState } from "react";
import { Platform, StyleSheet, Text, View, type DimensionValue, type TextStyle } from "react-native";

import { Button, Card } from "@/ui/components";
import { useZoptionTheme } from "@/ui/theme-provider";
import { typography } from "@/ui/tokens";

import {
  runDownloadBenchmark,
  type DownloadBenchmarkGates,
  type DownloadBenchmarkResult,
} from "./dev-download-benchmark";
import type { DownloadProgress } from "./update-filesystem";

type Phase = "idle" | "running" | "done";

const GATE_LABELS: Array<{ key: keyof DownloadBenchmarkGates; label: string }> = [
  { key: "trustedUrl", label: "Trusted HTTPS/host URL" },
  { key: "sizeMatches", label: "Size matches signed release" },
  { key: "sha256Matches", label: "SHA-256 digest matches" },
  { key: "packageMatches", label: "Package id matches" },
  { key: "versionMatches", label: "Version code matches" },
  { key: "signerMatches", label: "Signer matches permanent cert" },
  { key: "verifiedByNative", label: "Native trust anchor verified" },
  { key: "cleanedUp", label: "Temp file cleaned up" },
];

export function UpdateDownloadBenchmarkCard() {
  const theme = useZoptionTheme();
  const [phase, setPhase] = useState<Phase>("idle");
  const [progress, setProgress] = useState<DownloadProgress | null>(null);
  const [result, setResult] = useState<DownloadBenchmarkResult | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const run = () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setPhase("running");
    setProgress(null);
    setResult(null);
    void runDownloadBenchmark({
      signal: controller.signal,
      onProgress: setProgress,
    }).then((next) => {
      setResult(next);
      setPhase("done");
    });
  };

  const cancel = () => {
    abortRef.current?.abort();
    setPhase("idle");
  };

  const percent =
    progress && progress.totalBytes > 0
      ? Math.round((progress.bytesWritten / progress.totalBytes) * 100)
      : 0;

  return (
    <Card accessibilityLabel="Download benchmark (dev only)">
      <View className="gap-3">
        <Text style={[typography.headline, { color: theme.colors.text }]}>
          Download benchmark (dev only)
        </Text>
        <Text style={[typography.body, { color: theme.colors.textMuted }]}>
          Downloads the current public Beta APK via the optimized path, verifies it, then
          deletes the temp file. It never opens the installer.
        </Text>
        {phase === "running" ? (
          <View className="gap-2">
            {progress ? (
              <ProgressBar bytesWritten={progress.bytesWritten} totalBytes={progress.totalBytes} />
            ) : null}
            <Text style={[styles.mono, { color: theme.colors.textMuted }]}>
              {progress ? percent + "%" : "Connecting…"}
            </Text>
            <Button variant="secondary" onPress={cancel}>
              Cancel benchmark
            </Button>
          </View>
        ) : (
          <Button onPress={run}>
            {phase === "done" ? "Run again" : "Run device benchmark"}
          </Button>
        )}
        {phase === "done" && result ? <Report result={result} /> : null}
      </View>
    </Card>
  );
}

function Report({ result }: { result: DownloadBenchmarkResult }) {
  const theme = useZoptionTheme();
  const t = result.timing;
  const statusLine = result.ok
    ? "All security gates passed."
    : "A security gate FAILED." + (result.error ? " " + result.error : "");
  return (
    <View className="gap-2">
      {result.release ? (
        <Text style={[styles.mono, { color: theme.colors.textMuted }]} numberOfLines={1}>
          {"Target: " + result.release.downloadUrl}
        </Text>
      ) : null}
      <Text style={[styles.mono, { color: theme.colors.text }]}>
        {"download " + t.downloadSeconds.toFixed(1) + "s @ " + t.downloadMbps.toFixed(1) + " Mbps"}
      </Text>
      <Text style={[styles.mono, { color: theme.colors.text }]}>
        {"hash " + Math.round(t.hashMs) + "ms | verify " + Math.round(t.verifyMs) + "ms | total " + t.totalSeconds.toFixed(1) + "s"}
      </Text>
      <Text style={[styles.mono, { color: theme.colors.textMuted }]}>
        {"progress callbacks: " + result.progressCallbacks}
      </Text>
      <Text style={[typography.body, { color: result.ok ? theme.colors.income : theme.colors.danger }]}>
        {statusLine}
      </Text>
      {GATE_LABELS.map(({ key, label }) => (
        <Text key={key} style={[typography.body, { color: result.gates[key] ? theme.colors.text : theme.colors.danger }]}>
          {result.gates[key] ? "PASS" : "FAIL"}   {label}
        </Text>
      ))}
    </View>
  );
}

function ProgressBar({ bytesWritten, totalBytes }: DownloadProgress) {
  const theme = useZoptionTheme();
  const percent =
    totalBytes > 0 ? Math.max(0, Math.min(100, Math.round((bytesWritten / totalBytes) * 100))) : 0;
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: percent }}
      style={[styles.track, { backgroundColor: theme.colors.canvasMuted }]}
    >
      <View style={[styles.fill, { width: (percent + "%") as DimensionValue, backgroundColor: theme.colors.brand }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  track: { height: 8, borderRadius: 4, overflow: "hidden" },
  fill: { height: "100%" },
  mono: {
    fontFamily: Platform.select({ ios: "Menlo", android: "monospace" }),
    fontSize: 13,
    lineHeight: 18,
    fontVariant: ["tabular-nums"] as TextStyle["fontVariant"],
  },
});