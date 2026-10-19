import { useEffect, useState } from "react";
import { Text } from "react-native";

import { getFamilyDetail, getFamilyEntryHistory } from "@/api/family";
import { useSessionSnapshot } from "@/auth/session-state";
import { useZoptionTheme } from "@/ui/theme-provider";
import { typography } from "@/ui/tokens";

import { formatFamilyTime } from "./entry-history";
import { memberLabel, useFamilyApi } from "./use-family-api";

/**
 * On a family conflict, names who made the family's version: the last person in the entry's
 * history. Shows nothing outside a family, offline, or for an entry never edited.
 */
export function FamilyLastEditor({ transactionId }: { transactionId: string }) {
  const theme = useZoptionTheme();
  const me = useSessionSnapshot().subject;
  const familyApi = useFamilyApi();
  const [line, setLine] = useState<string | null>(null);
  useEffect(() => {
    if (!familyApi) return;
    let live = true;
    void familyApi((api) =>
      Promise.all([getFamilyDetail(api), getFamilyEntryHistory(api, transactionId)]),
    )
      .then(([detail, events]) => {
        const last = events.at(-1);
        if (live && last) {
          const who = memberLabel(last.userId, me, detail.members);
          setLine(`Family version by ${who}, ${formatFamilyTime(last.at)}`);
        }
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [familyApi, me, transactionId]);
  if (!line) return null;
  return <Text style={[typography.callout, { color: theme.colors.textMuted }]}>{line}</Text>;
}
