import { useEffect, useState } from "react";
import { Linking, Text, View } from "react-native";

import {
  disablePlaceVisits,
  enablePlaceVisits,
  isPlaceVisitsEnabled,
  placeVisitsSupported,
  removeExcludedPlace,
  type EnableResult,
} from "@/features/place-visits/place-visits";
import { loadVisitState, type VisitState } from "@/features/place-visits/visit-storage";
import { Button, CollapsibleCard } from "@/ui/components";
import { useZoptionTheme } from "@/ui/theme-provider";
import { typography } from "@/ui/tokens";

type Notice = Exclude<EnableResult, "enabled"> | "failed";

const NOTICE_COPY: Record<Notice, string> = {
  "notifications-denied": "Notifications are turned off for Zoption. Allow them in settings.",
  "location-denied": "Location access was not allowed. Allow it in settings to use place prompts.",
  "background-denied":
    'Place prompts need location set to "Allow all the time". Change it in settings, then turn prompts on again.',
  failed: "Zoption couldn't change place prompts. Try again.",
};

/**
 * Opt-in "did you spend here?" prompts. The disclosure text doubles as the
 * prominent disclosure Google Play requires before the background location
 * prompt, so it must stay visible above the button that asks for it.
 */
export function PlaceVisitCard() {
  const theme = useZoptionTheme();
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [excluded, setExcluded] = useState<VisitState["excluded"]>([]);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);

  useEffect(() => {
    let active = true;
    void Promise.all([isPlaceVisitsEnabled(), loadVisitState()])
      .then(([started, state]) => {
        if (!active) return;
        setEnabled(started);
        setExcluded(state.excluded);
      })
      .catch(() => active && setEnabled(false));
    return () => {
      active = false;
    };
  }, []);

  if (!placeVisitsSupported) return null;

  const turnOn = async () => {
    setBusy(true);
    setNotice(null);
    try {
      const result = await enablePlaceVisits();
      if (result === "enabled") setEnabled(true);
      else setNotice(result);
    } catch {
      setNotice("failed");
    } finally {
      setBusy(false);
    }
  };

  const turnOff = async () => {
    setBusy(true);
    setNotice(null);
    try {
      await disablePlaceVisits();
      setEnabled(false);
    } catch {
      setNotice("failed");
    } finally {
      setBusy(false);
    }
  };

  const unexclude = async (id: string) => {
    await removeExcludedPlace(id).catch(() => undefined);
    setExcluded((current) => current.filter((place) => place.id !== id));
  };

  const summary = enabled === null ? "Loading…" : enabled ? "On" : "Off";
  const muted = [typography.caption, { color: theme.colors.textMuted }];

  return (
    <CollapsibleCard title="Place prompts" summary={summary} icon="map-marker-outline">
      <Text style={muted}>
        Zoption can ask &quot;Did you spend here?&quot; after you leave a store, restaurant, market,
        mall, school, or hospital. To do this it collects your location in the background, even when
        the app is closed. When you leave a place, its location is sent to Zoption and Google Maps
        to find the place name; it is not stored. Prompts pause from 10 PM to 7 AM.
      </Text>
      {enabled ? (
        <Button variant="secondary" disabled={busy} onPress={() => void turnOff()}>
          Turn off place prompts
        </Button>
      ) : (
        <Button disabled={busy || enabled === null} onPress={() => void turnOn()}>
          Allow location and turn on
        </Button>
      )}
      {notice ? (
        <View className="gap-2">
          <Text
            accessibilityRole="alert"
            style={[typography.caption, { color: theme.colors.danger }]}
          >
            {NOTICE_COPY[notice]}
          </Text>
          {notice !== "failed" ? (
            <Button variant="secondary" size="compact" onPress={() => void Linking.openSettings()}>
              Open settings
            </Button>
          ) : null}
        </View>
      ) : null}
      {excluded.length > 0 ? (
        <View className="gap-2">
          <Text style={[typography.headline, { color: theme.colors.text }]}>
            Places you won&apos;t be asked about
          </Text>
          {excluded.map((place) => (
            <View key={place.id} className="flex-row items-center justify-between gap-2">
              <Text style={[typography.body, { color: theme.colors.text, flex: 1 }]}>
                {place.name}
              </Text>
              <Button variant="secondary" size="compact" onPress={() => void unexclude(place.id)}>
                Ask again
              </Button>
            </View>
          ))}
        </View>
      ) : null}
    </CollapsibleCard>
  );
}
