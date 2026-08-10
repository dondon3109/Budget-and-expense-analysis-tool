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
  ShieldCheck,
  Smartphone,
  Wifi,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { BrandMark } from "../components/brand/BrandMark";
import { LegalFooter } from "../components/legal/LegalFooter";
import { ThemeToggle } from "../components/theme/ThemeToggle";
import { ANDROID_RELEASE } from "../releases/androidRelease";
import "./LandingPage.css";
import "./InstallPage.css";

type DeviceKind = "checking" | "android" | "other";
type CopyState = "idle" | "copied" | "failed";

function DownloadPanel() {
  const [deviceKind, setDeviceKind] = useState<DeviceKind>("checking");
  const [copyState, setCopyState] = useState<CopyState>("idle");

  useEffect(() => {
    setDeviceKind(/Android/i.test(navigator.userAgent) ? "android" : "other");
  }, []);

  async function copyChecksum() {
    try {
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard API unavailable");
      await navigator.clipboard.writeText(ANDROID_RELEASE.sha256);
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
          <p>Official Android release</p>
          <h2 id="apk-download-title">Zoption {ANDROID_RELEASE.versionName}</h2>
        </div>
        <span className="apk-format-badge">APK</span>
      </div>

      <a
        className="button primary apk-download-action"
        href={ANDROID_RELEASE.downloadPath}
        download={ANDROID_RELEASE.filename}
      >
        <Download size={19} aria-hidden="true" /> Download Android APK
      </a>

      <p className="apk-store-note">
        <ShieldCheck size={16} aria-hidden="true" /> Signed by Zoption and distributed only from
        zoption.site — not through Google Play.
      </p>

      <dl className="apk-release-facts">
        <div>
          <dt>Version</dt>
          <dd>{ANDROID_RELEASE.versionName}</dd>
        </div>
        <div>
          <dt>File size</dt>
          <dd>{ANDROID_RELEASE.sizeLabel}</dd>
        </div>
        <div>
          <dt>Released</dt>
          <dd>{ANDROID_RELEASE.releaseDateLabel}</dd>
        </div>
        <div>
          <dt>Requires</dt>
          <dd>{ANDROID_RELEASE.minimumAndroid}</dd>
        </div>
      </dl>

      <div className="apk-checksum">
        <div>
          <p>SHA-256 checksum</p>
          <code>{ANDROID_RELEASE.sha256}</code>
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
      <a className="apk-checksum-file" href={ANDROID_RELEASE.checksumPath} download>
        Download checksum file <ExternalLink size={14} aria-hidden="true" />
      </a>

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
    </section>
  );
}

export function InstallPage() {
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
              <Smartphone size={15} aria-hidden="true" /> Android release from zoption.site
            </p>
            <h1 id="install-heading">Download Zoption for Android.</h1>
            <p className="install-hero-lead">
              Get the release-signed Zoption APK directly from the official website. It opens the
              same private, online-first workspace in a focused full-screen Android app.
            </p>
            <ul className="install-benefits" aria-label="Android app benefits">
              <li>
                <Check size={17} aria-hidden="true" /> The same Zoption account and workspace
              </li>
              <li>
                <Check size={17} aria-hidden="true" /> Verified connection to zoption.site
              </li>
              <li>
                <Check size={17} aria-hidden="true" /> No Google Play account or listing
              </li>
            </ul>
          </div>

          <div className="install-hero-action">
            <div className="apk-phone-preview" aria-hidden="true">
              <span className="apk-phone-speaker" />
              <BrandMark />
              <strong>Zoption</strong>
              <small>Your private budgeting workspace</small>
              <div>
                <i />
                <i />
                <i />
              </div>
            </div>
            <DownloadPanel />
          </div>
        </section>

        <section
          className="install-instructions"
          id="instructions"
          aria-labelledby="instructions-title"
        >
          <header>
            <p className="eyebrow">Install safely</p>
            <h2 id="instructions-title">Four steps from download to app icon.</h2>
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
                  Tap “Download Android APK.” Only trust a file whose address begins with
                  `https://zoption.site/downloads/`.
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
                  you used, then approve Zoption.
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
            <article>
              <h3>Installation is blocked</h3>
              <p>
                Open the warning&rsquo;s Settings action and allow only the app that opened the APK.
                Do not enable unrelated sources.
              </p>
            </article>
            <article>
              <h3>An update will not install</h3>
              <p>
                Download the newer APK from zoption.site. Do not uninstall if Android reports a
                signature mismatch; stop and contact Zoption support instead.
              </p>
            </article>
            <article>
              <h3>The app opens with browser controls</h3>
              <p>
                Confirm you are online and update Chrome. Domain verification can require a short
                retry after first installation.
              </p>
            </article>
            <article>
              <h3>You are not using Android</h3>
              <p>
                iPhone, iPad, Windows, macOS, and Linux cannot install this APK. Use the Zoption
                website, or transfer the file to an Android device.
              </p>
            </article>
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
                <h3>Online-first by design</h3>
                <p>
                  Sign-in, financial records, imports, assistant requests, billing, and account
                  changes require an internet connection. A previously loaded shell may appear
                  offline, but financial operations do not work offline.
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
          <h2 id="install-next-title">Your account works in the APK and the browser.</h2>
          <p>Download the Android release, or continue with Zoption on the web.</p>
          <div>
            <a className="button primary" href={ANDROID_RELEASE.downloadPath} download>
              <Download size={18} aria-hidden="true" /> Download APK
            </a>
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
