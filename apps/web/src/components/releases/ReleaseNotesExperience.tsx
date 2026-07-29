import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";

import { useAuth } from "../../auth/AuthProvider";
import { useCookieConsent } from "../../consent/CookieConsentProvider";
import { currentRelease } from "../../releases/currentRelease";
import {
  hasAcknowledgedRelease,
  persistReleaseAwarenessRecord,
  readReleaseAwarenessRecord,
  RELEASE_AWARENESS_STORAGE_KEY,
} from "../../releases/releaseStorage";
import { useTheme } from "../../theme/ThemeProvider";
import { ReleaseNotesDialog } from "./ReleaseNotesDialog";
import "./releaseNotes.css";

export function ReleaseNotesExperience() {
  const location = useLocation();
  const { loading, user } = useAuth();
  const { hasThemePreference } = useTheme();
  const { hasDecision } = useCookieConsent();
  const [record, setRecord] = useState(readReleaseAwarenessRecord);
  const [acknowledgedThisMount, setAcknowledgedThisMount] = useState(false);
  const isAppRoute = location.pathname === "/app" || location.pathname.startsWith("/app/");
  const hasAcknowledgedCurrentRelease = record?.acknowledgedVersion === currentRelease.version;
  const eligible =
    !loading &&
    user !== null &&
    isAppRoute &&
    hasThemePreference &&
    hasDecision &&
    !hasAcknowledgedCurrentRelease;

  useEffect(() => {
    function syncReleaseAwareness(event: StorageEvent) {
      if (event.key !== RELEASE_AWARENESS_STORAGE_KEY) return;
      setRecord(
        hasAcknowledgedRelease(currentRelease.version, event.newValue)
          ? readReleaseAwarenessRecord({ getItem: () => event.newValue })
          : null,
      );
    }

    window.addEventListener("storage", syncReleaseAwareness);
    return () => window.removeEventListener("storage", syncReleaseAwareness);
  }, []);

  function acknowledgeRelease() {
    persistReleaseAwarenessRecord(currentRelease.version);
    setRecord(readReleaseAwarenessRecord());
    setAcknowledgedThisMount(true);
  }

  if (!eligible || acknowledgedThisMount) return null;

  return <ReleaseNotesDialog release={currentRelease} onAcknowledge={acknowledgeRelease} />;
}
