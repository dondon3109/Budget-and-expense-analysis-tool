import {
  Check,
  CheckCircle2,
  Clipboard,
  Download,
  ExternalLink,
  FileCheck2,
  Globe2,
  Info,
  LockKeyhole,
  RefreshCw,
  ShieldCheck,
  Smartphone,
  Wifi,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { BrandMark } from "../components/brand/BrandMark";
import { LegalFooter } from "../components/legal/LegalFooter";
import { ThemeToggle } from "../components/theme/ThemeToggle";
import {
  useAndroidRelease,
  type AndroidReleaseSource,
} from "../releases/useAndroidRelease";
import "./LandingPage.css";
import "./InstallPage.css";

type DeviceKind = "checking" | "android" | "other";
type CopyState = "idle" | "copied" | "failed";

function DownloadPanel({ source }: { source: AndroidReleaseSource }) {
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
            <Info size={19} aria-hidden="true" /> Android Beta download temporarily unavailable.
          </p>
          <p className="apk-unavailable-detail">
            The download information could not be loaded right now. Zoption is still available in
            your browser — check back shortly to download the Beta.
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
              Uninstall the previous Zoption Beta first, then install this version — future updates
              install over it normally.
            </p>
          ) : (
            <p className="apk-update-note">
              <RefreshCw size={16} aria-hidden="true" />{" "}
              {release.notes && release.notes.length > 0
                ? release.notes.join(" ")
                : "New in this beta: scan a receipt with your camera and Zoption drafts the expense for you. The older Zoption app must be uninstalled before installing the beta — it uses a different signing identity."}
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
      </dl>

      <div className="apk-checksum">
        <div>
          <p>SHA-256 checksum</p>
          <code>{release.sha256}</code>
        </div>
        <button type="button" onClick={() => void copyChecksum()} aria-describedby="copy-result">
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

export function InstallPage() {
  const source = useAndroidRelease();
  const { release } = source;
  const trustedDownloadOrigin = release ? new URL(release.downloadPath).origin : null;

  return (
    <div className="landing-page install-page">
      <header className="landing-nav" id="top">
        <Link className="brand" to="/" aria-label="Zoption home">
          <BrandMark />
          <span className="brand-wordmark">Zoption</span>
        </Link>
        <nav className="install-header-links" aria-label="Android download page">
          <Link to="/">Home</Link>
          <a href="#instructions">Install safely</a>
          <a href="#troubleshooting">Troubleshooting</a>
        </nav>
        <div className="landing-account-actions">
          <ThemeToggle />
          <Link className="landing-sign-in" to="/login">
            Sign in
          </Link>
          <Link className="button primary" to="/signup">
            Create account
          </Link>
        </div>
      </header>

      <main>
        <section className="install-hero" aria-labelledby="install-heading">
          <div className="install-hero-copy">
            <p className="hero-eyebrow">
              <Smartphone size={15} aria-hidden="true" /> Android beta from zoption.site
            </p>
            <h1 id="install-heading">Download Zoption Beta for Android.</h1>
          </div>
          <div className="install-hero-summary">
            <p className="install-hero-lead">
              Get the official Zoption Beta APK from the Zoption website. It is the new native
              Android app: your workspace lives on the device, entries work offline, and a photo
              of a receipt drafts the expense for you.
            </p>
            <ul className="install-benefits" aria-label="Android app benefits">
              <li>
                <Check size={17} aria-hidden="true" /> The same Zoption account and workspace
              </li>
              <li>
                <Check size={17} aria-hidden="true" /> Offline-first entries that sync later
              </li>
              <li>
                <Check size={17} aria-hidden="true" /> No Google Play account or listing
              </li>
            </ul>
          </div>

          <div className="install-hero-action">
            <DownloadPanel source={source} />
          </div>
        </section>

        <section
          className="install-instructions"
          id="instructions"
          aria-labelledby="instructions-title"
        >
          <header className="install-section-heading">
            <div>
              <p className="eyebrow">Install safely</p>
              <h2 id="instructions-title">Four steps from download to app icon.</h2>
            </div>
            <p>
              Android calls direct website installation “sideloading.” The warning is expected
              because this APK is not delivered through Google Play.
            </p>
          </header>

          <ol className="apk-install-steps">
            <li>
              <span>1</span>
              <div>
                <h3>Download from this page</h3>
                <p>
                  {trustedDownloadOrigin && release ? (
                    <>
                      Tap “Download Android APK.” Only trust a file whose address begins with{" "}
                      <code>{trustedDownloadOrigin}/</code> and ends in{" "}
                      <code>{release.filename}</code>.
                    </>
                  ) : (
                    <>
                      When the download returns, only trust a file whose address matches the one
                      shown on this page’s download button.
                    </>
                  )}
                </p>
              </div>
            </li>
            <li>
              <span>2</span>
              <div>
                <h3>Open the downloaded APK</h3>
                <p>Use the completed download notification or your Downloads app to open it.</p>
              </div>
            </li>
            <li>
              <span>3</span>
              <div>
                <h3>Allow this source if Android asks</h3>
                <p>
                  Give temporary “Install unknown apps” permission only to the browser or file app
                  you used, then approve Zoption. Do not disable Play Protect or another device
                  security control.
                </p>
              </div>
            </li>
            <li>
              <span>4</span>
              <div>
                <h3>Open Zoption, then turn the setting off</h3>
                <p>
                  Launch Zoption from its app icon. You can disable “Install unknown apps” again
                  immediately after installation.
                </p>
              </div>
            </li>
          </ol>

          <div className="apk-integrity-note">
            <FileCheck2 size={23} aria-hidden="true" />
            <div>
              <h3>Optional integrity check</h3>
              <p>
                Compare the downloaded file&rsquo;s SHA-256 with the checksum above before
                installing. If it differs by even one character, delete the file and download it
                again from this page.
              </p>
            </div>
          </div>
        </section>

        <section
          className="install-troubleshooting"
          id="troubleshooting"
          aria-labelledby="troubleshooting-title"
        >
          <div>
            <p className="eyebrow">Troubleshooting</p>
            <h2 id="troubleshooting-title">
              Keep the official file and signing identity together.
            </h2>
            <p>
              Android&rsquo;s wording varies by manufacturer. Search Settings for “Install unknown
              apps” if the path below differs on your device.
            </p>
          </div>
          <div className="apk-troubleshooting-list">
            <details>
              <summary>Installation is blocked</summary>
              <p>
                Open the warning&rsquo;s Settings action and allow only the app that opened the APK.
                Do not enable unrelated sources.
              </p>
            </details>
            <details>
              <summary>Installation reports a conflict or signature mismatch</summary>
              <p>
                The beta replaces the older Zoption website app and uses a different signing
                identity. Uninstall the old Zoption app first (your data stays with your account),
                then install the beta and sign in again.
              </p>
            </details>
            <details>
              <summary>The app will not open or crashes on launch</summary>
              <p>
                Delete the downloaded file, download it again from this page, and reinstall. If it
                still fails, contact Zoption support from the website.
              </p>
            </details>
            <details>
              <summary>You are not using Android</summary>
              <p>
                iPhone, iPad, Windows, macOS, and Linux cannot install this APK. Use the Zoption
                website, or transfer the file to an Android device.
              </p>
            </details>
          </div>
        </section>

        <section className="install-boundaries" aria-labelledby="install-boundaries-title">
          <div className="install-boundary-copy">
            <p className="eyebrow">Clear boundaries</p>
            <h2 id="install-boundaries-title">An app icon does not change your privacy choices.</h2>
          </div>
          <div className="install-boundary-points">
            <article>
              <LockKeyhole size={22} aria-hidden="true" />
              <div>
                <h3>No added financial access</h3>
                <p>
                  The APK does not receive bank credentials or automatic access to files. You still
                  choose every file you import and use the same Zoption account.
                </p>
              </div>
            </article>
            <article>
              <Wifi size={22} aria-hidden="true" />
              <div>
                <h3>Offline-first with a connected sync</h3>
                <p>
                  Your workspace is stored encrypted on the device, so you can record transactions,
                  budgets, and goals without a connection and sync them later. Sign-in, the
                  assistant, and receipt scanning still need the internet.
                </p>
              </div>
            </article>
            <article>
              <Globe2 size={22} aria-hidden="true" />
              <div>
                <h3>The website remains available</h3>
                <p>
                  Installation is optional. Open zoption.site in any supported browser whenever that
                  is more convenient.
                </p>
              </div>
            </article>
          </div>
        </section>

        <section className="install-next-actions" aria-labelledby="install-next-title">
          <h2 id="install-next-title">Your account works in the beta and the browser.</h2>
          <p>Download the Android beta, or continue with Zoption on the web.</p>
          <div>
            {release && (
              <a className="button primary" href={release.downloadPath} download>
                <Download size={18} aria-hidden="true" /> Download APK
              </a>
            )}
            <Link className="button secondary" to="/app">
              Open in browser
            </Link>
            <Link className="install-text-link" to="/privacy-policy">
              Read the privacy policy
            </Link>
          </div>
        </section>
      </main>

      <LegalFooter />
    </div>
  );
}
