import { Check, Globe2, Info, LockKeyhole, Smartphone, Wifi } from "lucide-react";

import { BrandMark } from "../components/brand/BrandMark";
import { LegalFooter } from "../components/legal/LegalFooter";
import { Breadcrumbs } from "../components/navigation/Breadcrumbs";
import { PublicHeader } from "../components/navigation/PublicHeader";
import "./LandingPage.css";
import "./InstallPage.css";
import { appUrl } from "../lib/appUrl";

/**
 * The Android app ships only through Google Play. Until its listing is public the page says so
 * and sends visitors to the web app; it never offers an APK download.
 */
export function InstallPage() {
  return (
    <div className="landing-page install-page">
      <PublicHeader
        navLabel="Android app page"
        ctaLabel="Create account"
        links={[{ label: "Home", href: "/" }]}
      />

      <main id="main-content" tabIndex={-1}>
        <div style={{ maxWidth: "1120px", margin: "0 auto", padding: "1.5rem 1.5rem 0" }}>
          <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "Android app" }]} />
        </div>
        <section className="install-hero" aria-labelledby="install-heading">
          <div className="install-hero-copy">
            <p className="hero-eyebrow">
              <Smartphone size={15} aria-hidden="true" /> Zoption for Android
            </p>
            <h1 id="install-heading">Zoption for Android is coming to Google Play.</h1>
          </div>
          <div className="install-hero-summary">
            <p className="install-hero-lead">
              The native Android app is in testing on Google Play. Your workspace sits encrypted on
              your phone so entries work offline, while voice logging, SMS Quick Paste, and camera
              receipt scanning draft expenses in seconds.
            </p>
            <ul className="install-benefits" aria-label="Android app benefits">
              <li>
                <Check size={17} aria-hidden="true" /> The same Zoption account and workspace
              </li>
              <li>
                <Check size={17} aria-hidden="true" /> Encrypted offline entries that sync later
              </li>
              <li>
                <Check size={17} aria-hidden="true" /> Installs and updates through Google Play
              </li>
            </ul>
          </div>

          <div className="install-hero-action">
            <section className="apk-download-panel" aria-labelledby="android-status-title">
              <div className="apk-card-heading">
                <BrandMark className="apk-app-icon" />
                <div>
                  <p>Android app</p>
                  <h2 id="android-status-title">Zoption</h2>
                </div>
                <span className="apk-format-badge">Google Play</span>
              </div>
              <a className="button primary apk-download-action" href={appUrl("/app")}>
                <Globe2 size={19} aria-hidden="true" /> Use Zoption on the web
              </a>
              <p className="apk-store-note">
                <Info size={16} aria-hidden="true" /> The Google Play listing opens to everyone once
                testing ends. Until then, the web app has every feature and the same account.
              </p>
            </section>
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
                  The app does not receive bank credentials or automatic access to files. You still
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
                <h3>The web app stays available</h3>
                <p>
                  Installation is optional. Open app.zoption.site in any browser whenever that is
                  more convenient, using the same account and workspace.
                </p>
              </div>
            </article>
          </div>
        </section>

        <section className="install-next-actions" aria-labelledby="install-next-title">
          <h2 id="install-next-title">Your account works on the web today.</h2>
          <p>Start in the browser now and pick up the same workspace on Android later.</p>
          <div>
            <a className="button primary" href={appUrl("/app")}>
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
