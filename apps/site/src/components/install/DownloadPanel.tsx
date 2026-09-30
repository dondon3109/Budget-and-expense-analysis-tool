import {
  CheckCircle2,
  Clipboard,
  Download,
  ExternalLink,
  Info,
  RefreshCw,
  ShieldCheck,
  Smartphone,
} from "lucide-react";
import { useEffect, useState } from "react";

import { BrandMark } from "../brand/BrandMark";
import { useAndroidRelease } from "../../releases/useAndroidRelease";

type DeviceKind = "checking" | "android" | "other";
type CopyState = "idle" | "copied" | "failed";

/**
 * The install page's live card: it refreshes the shipped snapshot from R2,
 * detects Android, and copies the checksum, so it is the page's only island.
 */
export function DownloadPanel() {
  const source = useAndroidRelease();
  const [deviceKind, setDeviceKind] = useState<DeviceKind>("checking");
  const [copyState, setCopyState] = useState<CopyState>("idle");
  const { release, status } = source;

  useEffect(() => {
    setDeviceKind(/Android/i.test(navigator.userAgent) ? "android" : "other");
  }, []);

  async function copyChecksum() {
    if (!release) return;
    try {
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard API unavailable");
      await navigator.clipboard.writeText(release.sha256);
      setCopyState("copied");
    } catch {
      setCopyState("failed");
    }
  }

  return (
    <section className="apk-download-panel" aria-labelledby="apk-download-title">
      <div className="apk-card-heading">
        <BrandMark className="apk-app-icon" />
        <div>
          <p>Official Android beta</p>
          <h2 id="apk-download-title">Zoption Beta</h2>
        </div>
        <span className="apk-format-badge">APK</span>
      </div>

      {status === "unavailable" ? (
        <div className="apk-download-unavailable" role="alert">
          <p>
            <Info size={19} aria-hidden="true" />
            <span>Android Beta download temporarily unavailable.</span>
          </p>
          <p className="apk-unavailable-detail">
            The latest file details could not be loaded. Use Zoption in the browser for now, and try
            this page again shortly.
          </p>
        </div>
      ) : status === "loading" ? (
        <p className="apk-download-status" role="status">
          Loading the latest Beta download…
        </p>
      ) : release ? (
        <>
          <a
            className="button primary apk-download-action"
            href={release.downloadPath}
            download={release.filename}
          >
            <Download size={19} aria-hidden="true" /> Download Android APK
          </a>

          {release.reinstallRequired ? (
            <p className="apk-update-note apk-reinstall-note">
              <RefreshCw size={16} aria-hidden="true" /> This update changes the signing key.
              Uninstall the previous Zoption Beta first, then install this version. Later updates
              install over it normally.
            </p>
          ) : (
            <p className="apk-update-note">
              <RefreshCw size={16} aria-hidden="true" /> This build can check for updates inside the
              app and install the next verified Zoption Beta.
            </p>
          )}

          <dl className="apk-release-facts">
            <div>
              <dt>Version</dt>
              <dd>{release.versionName}</dd>
            </div>
            <div>
              <dt>File size</dt>
              <dd>{release.sizeLabel}</dd>
            </div>
            <div>
              <dt>Released</dt>
              <dd>{release.releaseDateLabel}</dd>
            </div>
            <div>
              <dt>Requires</dt>
              <dd>{release.minimumAndroid}</dd>
            </div>
            <div className="apk-release-cert">
              <dt>Signing certificate</dt>
              <dd>
                <code className="apk-cert-fingerprint">{release.certificateSha256}</code>
              </dd>
            </div>
          </dl>

          {release.notes && release.notes.length > 0 && (
            <div className="apk-release-notes" aria-label="Release highlights">
              <p className="apk-release-notes-title">What’s new in this release</p>
              <ul className="apk-release-notes-list">
                {release.notes.map((note) => (
                  <li key={note}>
                    <CheckCircle2 size={16} aria-hidden="true" />
                    <span>{note}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="apk-checksum">
            <div>
              <p>SHA-256 checksum</p>
              <code>{release.sha256}</code>
            </div>
            <button
              type="button"
              onClick={() => void copyChecksum()}
              aria-describedby="copy-result"
            >
              {copyState === "copied" ? (
                <CheckCircle2 size={17} aria-hidden="true" />
              ) : (
                <Clipboard size={17} aria-hidden="true" />
              )}
              {copyState === "copied" ? "Copied" : "Copy"}
            </button>
          </div>
          <p id="copy-result" className="apk-copy-result" role="status" aria-live="polite">
            {copyState === "failed"
              ? "Copying is unavailable in this browser. Select the checksum text instead."
              : copyState === "copied"
                ? "Checksum copied to the clipboard."
                : ""}
          </p>
          {release.checksumPath && (
            <a className="apk-checksum-file" href={release.checksumPath} download>
              Download checksum file <ExternalLink size={14} aria-hidden="true" />
            </a>
          )}

          {deviceKind !== "checking" && (
            <div className={`apk-device-note ${deviceKind === "android" ? "is-android" : ""}`}>
              {deviceKind === "android" ? (
                <Smartphone size={19} aria-hidden="true" />
              ) : (
                <Info size={19} aria-hidden="true" />
              )}
              <p>
                {deviceKind === "android"
                  ? "Android detected. Download the APK, then follow the installation steps below."
                  : "This APK runs only on Android. You can download it here and transfer it to an Android device, or keep using Zoption in this browser."}
              </p>
            </div>
          )}
        </>
      ) : null}

      <p className="apk-store-note">
        <ShieldCheck size={16} aria-hidden="true" /> Signed by Zoption and linked only from
        zoption.site — not distributed through Google Play.
      </p>
    </section>
  );
}
