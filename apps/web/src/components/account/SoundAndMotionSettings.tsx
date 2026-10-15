import {
  reduceMotionPreference,
  soundEffectsPreference,
  useBrowserPreference,
  type BrowserPreference,
} from "../../lib/browserPreferences";
import "./SoundAndMotionSettings.css";

function PreferenceSwitch({
  preference,
  title,
  description,
}: {
  preference: BrowserPreference;
  title: string;
  description: string;
}) {
  const checked = useBrowserPreference(preference);
  return (
    <div className="settings-switch-row">
      <div>
        <strong>{title}</strong>
        <p>{description}</p>
      </div>
      <label className="settings-switch">
        <span className="sr-only">{title}</span>
        <input
          type="checkbox"
          role="switch"
          checked={checked}
          onChange={(event) => preference.set(event.target.checked)}
        />
        <span aria-hidden="true" />
      </label>
    </div>
  );
}

/** Pet sounds and the in-app Reduce Motion switch, both remembered by this browser only. */
export function SoundAndMotionSettings() {
  return (
    <section
      id="sound-and-motion"
      className="settings-section"
      aria-labelledby="sound-and-motion-title"
      tabIndex={-1}
    >
      <div className="settings-section-heading">
        <div>
          <h2 id="sound-and-motion-title">Sound and motion</h2>
          <p>This browser remembers these choices.</p>
        </div>
        <span>This browser</span>
      </div>
      <PreferenceSwitch
        preference={soundEffectsPreference}
        title="Sound effects"
        description="Play short sounds, like your pet's voice when you pet it."
      />
      <PreferenceSwitch
        preference={reduceMotionPreference}
        title="Reduce motion"
        description="Keep animations still across Zoption. Your device's Reduce Motion setting always applies too."
      />
    </section>
  );
}
