import { Link } from "react-router-dom";

import { currentRelease } from "@zoption/web-common/releases";
import { siteUrl } from "../../lib/siteUrl";

/**
 * The web app version this browser loaded. The Android app has its own version,
 * shown on its More > About Zoption page.
 */
export function AboutSettings() {
  return (
    <section id="about" className="settings-section" aria-labelledby="about-title" tabIndex={-1}>
      <div className="settings-section-heading">
        <div>
          <h2 id="about-title">About Zoption</h2>
          <p>The Android app shows its own version under More, About Zoption.</p>
        </div>
        <span>Web app</span>
      </div>
      <div className="settings-switch-row">
        <div>
          <strong>Version {currentRelease.version}</strong>
          <p>Released {currentRelease.releasedOn}</p>
        </div>
        <Link to={siteUrl("/changelog")}>What’s new</Link>
      </div>
    </section>
  );
}
