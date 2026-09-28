import { Check } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import {
  VOICE_LANGUAGES,
  getStoredVoiceLanguage,
  setStoredVoiceLanguage,
  type VoiceLanguage,
} from "../../lib/voiceLanguage";

/** The default voice language for this browser, as a keyboard-navigable radio group. */
export function VoiceLanguageSettings() {
  const [voiceLanguage, setVoiceLanguage] = useState<VoiceLanguage>(() => getStoredVoiceLanguage());
  const voiceRadioRefs = useRef<(HTMLButtonElement | null)[]>([]);

  useEffect(() => {
    const onLangChange = (event: Event) => {
      const detail = (event as CustomEvent<VoiceLanguage>).detail;
      if (detail === "auto" || detail === "en" || detail === "fil") {
        setVoiceLanguage(detail);
      }
    };
    window.addEventListener("zoption-voice-lang-change", onLangChange);
    return () => window.removeEventListener("zoption-voice-lang-change", onLangChange);
  }, []);

  function handleVoiceLanguageChange(lang: VoiceLanguage) {
    setVoiceLanguage(lang);
    setStoredVoiceLanguage(lang);
  }

  function handleVoiceLanguageKeyDown(
    event: React.KeyboardEvent<HTMLButtonElement>,
    currentIndex: number,
  ) {
    let nextIndex: number | undefined;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      nextIndex = (currentIndex + 1) % VOICE_LANGUAGES.length;
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      nextIndex = (currentIndex - 1 + VOICE_LANGUAGES.length) % VOICE_LANGUAGES.length;
    } else if (event.key === "Home") {
      nextIndex = 0;
    } else if (event.key === "End") {
      nextIndex = VOICE_LANGUAGES.length - 1;
    }
    if (nextIndex === undefined) return;
    event.preventDefault();
    const nextOption = VOICE_LANGUAGES[nextIndex];
    if (!nextOption) return;
    handleVoiceLanguageChange(nextOption.code);
    voiceRadioRefs.current[nextIndex]?.focus();
  }

  return (
    <section
      id="voice-language"
      className="settings-section"
      aria-labelledby="voice-language-title"
      tabIndex={-1}
    >
      <div className="settings-section-heading">
        <div>
          <h2 id="voice-language-title">Voice language</h2>
          <p>
            Choose your default voice language for AI assistant voice chats and transaction voice
            entry. Auto mode automatically detects English and Tagalog. This browser remembers the
            choice; another browser or device keeps its own.
          </p>
        </div>
        <span>Speech input</span>
      </div>

      <div
        className="settings-voice-lang-grid"
        role="radiogroup"
        aria-labelledby="voice-language-title"
      >
        {VOICE_LANGUAGES.map((option, index) => {
          const isSelected = voiceLanguage === option.code;
          return (
            <button
              key={option.code}
              ref={(el) => {
                voiceRadioRefs.current[index] = el;
              }}
              type="button"
              role="radio"
              aria-checked={isSelected}
              tabIndex={isSelected ? 0 : -1}
              className={`settings-voice-lang-card ${isSelected ? "selected" : ""}`}
              onClick={() => handleVoiceLanguageChange(option.code)}
              onKeyDown={(event) => handleVoiceLanguageKeyDown(event, index)}
            >
              <div className="settings-voice-lang-header">
                <div className="settings-voice-lang-title-group">
                  <strong className="settings-voice-lang-name">{option.label}</strong>
                  {option.code === "auto" && (
                    <span className="settings-voice-lang-badge">Default</span>
                  )}
                </div>
                {isSelected && (
                  <Check size={16} className="settings-voice-lang-check" aria-hidden="true" />
                )}
              </div>
              <p className="settings-voice-lang-desc">{option.description}</p>
            </button>
          );
        })}
      </div>
    </section>
  );
}
