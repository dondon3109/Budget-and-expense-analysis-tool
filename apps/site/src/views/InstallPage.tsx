import { Check, Download, FileCheck2, Globe2, LockKeyhole, Smartphone, Wifi } from "lucide-react";
import { ANDROID_RELEASE } from "@zoption/web-common/android-release";
import type { ReactNode } from "react";

import { LegalFooter } from "../components/legal/LegalFooter";
import { Breadcrumbs } from "../components/navigation/Breadcrumbs";
import { PublicHeader } from "../components/navigation/PublicHeader";
import "./LandingPage.css";
import "./InstallPage.css";
import { appUrl } from "../lib/appUrl";

/** Static apart from `downloadPanel`, the Astro island that keeps the card current. */
export function InstallPage({ downloadPanel }: { downloadPanel?: ReactNode }) {
  const release = ANDROID_RELEASE;
  const trustedDownloadOrigin = new URL(release.downloadPath).origin;

  return (
    <div className="landing-page install-page">
      <PublicHeader
        navLabel="Android download page"
        ctaLabel="Create account"
        links={[
          { label: "Home", href: "/" },
          { label: "Install safely", href: "#instructions" },
          { label: "Troubleshooting", href: "#troubleshooting" },
        ]}
      />

      <main id="main-content" tabIndex={-1}>
        <div style={{ maxWidth: "1120px", margin: "0 auto", padding: "1.5rem 1.5rem 0" }}>
          <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "Android Beta APK" }]} />
        </div>
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
              Android app: your workspace lives on the device, entries work offline, and a photo of
              a receipt drafts the expense for you.
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

          <div className="install-hero-action">{downloadPanel}</div>
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
            <a className="button secondary" href={appUrl("/app")}>
              Open in browser
            </a>
            <a className="install-text-link" href="/privacy-policy">
              Read the privacy policy
            </a>
          </div>
        </section>
      </main>

      <LegalFooter />
    </div>
  );
}
