import { useNetInfo } from "@react-native-community/netinfo";
import type { WorkspaceSummary } from "@zoption/shared";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
} from "react";

import { getFamilyDetail } from "@/api/family";
import { listWorkspaces } from "@/api/workspaces";
import { useSessionSnapshot } from "@/auth/session-state";
import { isDummyDevelopmentSubject } from "@/db/demo-seed";
import { discardLocalWorkspace } from "@/db/workspace";

import {
  EMPTY_WORKSPACE_RECORD,
  familySubject,
  loadWorkspaceRecord,
  mergeWorkspaceList,
  saveWorkspaceRecord,
  type WorkspaceRecord,
} from "./workspace-record";

interface ActiveWorkspaceValue {
  status: "loading" | "ready";
  /** The family shown, or null for the personal workspace. */
  family: WorkspaceSummary | null;
  families: readonly WorkspaceSummary[];
  /** Families that finished one sync on this phone and so open offline. */
  synced: readonly string[];
  /** When the family shown closes, once its owner has closed it; null otherwise. */
  closesAt: string | null;
  /** Closing dates of the families known to be closing, by family id. */
  closing: Readonly<Record<string, string>>;
  /**
   * Whether changes can be made in what is shown: always in personal, and in a family unless the
   * person only views it, it is closing, or its plan has ended.
   */
  writable: boolean;
  /** The local file subject for what is shown: the person, or the person plus the family. */
  workspaceSubject: string;
  switchTo: (familyId: string | null) => void;
  markSynced: (familyId: string) => void;
  /** Access to a family ended: drop it, delete its file, and show personal if it was shown. */
  forgetFamily: (familyId: string) => Promise<void>;
  refresh: () => void;
}

const ActiveWorkspaceContext = createContext<ActiveWorkspaceValue | null>(null);

/**
 * Which workspace the app shows, remembered per person in SecureStore and cleared on sign-out.
 * The family list is refreshed from the Worker whenever the phone is online; a family that is no
 * longer listed loses its local file, and the app falls back to personal.
 */
export function ActiveWorkspaceProvider({
  subject,
  enabled = true,
  children,
}: PropsWithChildren<{ subject: string; enabled?: boolean }>) {
  const { status: sessionStatus, getAccessToken } = useSessionSnapshot();
  const netInfo = useNetInfo();
  // Key on offline rather than nullable reachability so NetInfo's null -> true startup
  // transition does not abort and double-fire the workspace requests.
  const offline = (netInfo.isInternetReachable ?? netInfo.isConnected) === false;
  const [loadedState, setLoadedState] = useState<{
    subject: string;
    record: WorkspaceRecord;
  } | null>(null);
  const [listAttempt, setListAttempt] = useState(0);
  const recordRef = useRef<WorkspaceRecord>(EMPTY_WORKSPACE_RECORD);
  const recordSubjectRef = useRef<string | null>(null);
  // Derive synchronously so changing subject (such as guest -> signed-in) never exposes the
  // previous subject's record for a render before the load effect clears it.
  const record = loadedState?.subject === subject ? loadedState.record : null;

  // Consumers stay unmounted while `status === "loading"`, so commits only run once loaded.
  const commit = useCallback(
    (change: (current: WorkspaceRecord) => WorkspaceRecord) => {
      const current =
        recordSubjectRef.current === subject ? recordRef.current : EMPTY_WORKSPACE_RECORD;
      const next = change(current);
      recordSubjectRef.current = subject;
      recordRef.current = next;
      setLoadedState({ subject, record: next });
      void saveWorkspaceRecord(subject, next).catch(() => undefined);
    },
    [subject],
  );

  useEffect(() => {
    let live = true;
    recordSubjectRef.current = null;
    recordRef.current = EMPTY_WORKSPACE_RECORD;
    setLoadedState(null);
    void loadWorkspaceRecord(subject)
      .catch(() => EMPTY_WORKSPACE_RECORD)
      .then((loaded) => {
        if (!live) return;
        recordSubjectRef.current = subject;
        recordRef.current = loaded;
        setLoadedState({ subject, record: loaded });
      });
    return () => {
      live = false;
    };
  }, [subject]);

  const loaded = record !== null;
  useEffect(() => {
    if (
      !enabled ||
      !loaded ||
      sessionStatus !== "signed-in" ||
      isDummyDevelopmentSubject(subject)
    ) {
      return;
    }
    if (offline) return;
    const controller = new AbortController();
    void (async () => {
      try {
        const accessToken = await getAccessToken(false);
        const list = await listWorkspaces({ accessToken, signal: controller.signal });
        if (controller.signal.aborted) return;
        const { record: next, gone } = mergeWorkspaceList(recordRef.current, list.workspaces);
        if (JSON.stringify(next) !== JSON.stringify(recordRef.current)) {
          commit(() => next);
        }
        for (const familyId of gone) {
          await discardLocalWorkspace(familySubject(subject, familyId)).catch(() => undefined);
        }
      } catch {
        // Offline or refused: keep the families this phone already knows until the next try.
      }
    })();
    return () => controller.abort();
  }, [commit, enabled, getAccessToken, listAttempt, loaded, offline, sessionStatus, subject]);

  // The family shown is re-read online on every list refresh, which a closing or lapsed refusal
  // from sync also asks for, so the phone learns it is closing or unpaid and stops offering changes.
  const activeId = record?.active ?? null;
  useEffect(() => {
    if (
      !enabled ||
      !activeId ||
      sessionStatus !== "signed-in" ||
      isDummyDevelopmentSubject(subject) ||
      offline
    ) {
      return;
    }
    const controller = new AbortController();
    void (async () => {
      try {
        const detail = await getFamilyDetail({
          accessToken: await getAccessToken(false),
          workspaceId: activeId,
          signal: controller.signal,
        });
        if (controller.signal.aborted || recordSubjectRef.current !== subject) return;
        const known = recordRef.current.closing[activeId] ?? null;
        const lapsed = detail.plan === "lapsed";
        if (known === detail.closesAt && recordRef.current.lapsed.includes(activeId) === lapsed) {
          return;
        }
        commit((current) => {
          const { [activeId]: _previous, ...others } = current.closing;
          const otherLapsed = current.lapsed.filter((id) => id !== activeId);
          return {
            ...current,
            closing: detail.closesAt ? { ...others, [activeId]: detail.closesAt } : others,
            lapsed: lapsed ? [...otherLapsed, activeId] : otherLapsed,
          };
        });
      } catch {
        // Offline or no longer a member: the list refresh handles losing access.
      }
    })();
    return () => controller.abort();
  }, [activeId, commit, enabled, getAccessToken, listAttempt, offline, sessionStatus, subject]);

  const switchTo = useCallback(
    (familyId: string | null) => commit((current) => ({ ...current, active: familyId })),
    [commit],
  );
  const markSynced = useCallback(
    (familyId: string) => {
      if (recordRef.current.synced.includes(familyId)) return;
      commit((current) => ({ ...current, synced: [...current.synced, familyId] }));
    },
    [commit],
  );
  const forgetFamily = useCallback(
    async (familyId: string) => {
      commit((current) => ({
        active: current.active === familyId ? null : current.active,
        families: current.families.filter((family) => family.id !== familyId),
        synced: current.synced.filter((id) => id !== familyId),
        closing: Object.fromEntries(
          Object.entries(current.closing).filter(([id]) => id !== familyId),
        ),
        lapsed: current.lapsed.filter((id) => id !== familyId),
      }));
      await discardLocalWorkspace(familySubject(subject, familyId)).catch(() => undefined);
    },
    [commit, subject],
  );
  const refresh = useCallback(() => setListAttempt((value) => value + 1), []);

  const value = useMemo<ActiveWorkspaceValue>(() => {
    const current = record ?? EMPTY_WORKSPACE_RECORD;
    const family = current.families.find((candidate) => candidate.id === current.active) ?? null;
    const closesAt = family ? (current.closing[family.id] ?? null) : null;
    return {
      status: record ? "ready" : "loading",
      family,
      families: current.families,
      synced: current.synced,
      closesAt,
      closing: current.closing,
      writable:
        !family ||
        (family.role !== "viewer" && closesAt === null && !current.lapsed.includes(family.id)),
      workspaceSubject: family ? familySubject(subject, family.id) : subject,
      switchTo,
      markSynced,
      forgetFamily,
      refresh,
    };
  }, [forgetFamily, markSynced, record, refresh, subject, switchTo]);
  return (
    <ActiveWorkspaceContext.Provider value={value}>{children}</ActiveWorkspaceContext.Provider>
  );
}

export function useActiveWorkspace(): ActiveWorkspaceValue {
  const value = useContext(ActiveWorkspaceContext);
  if (!value) throw new Error("useActiveWorkspace must be used inside ActiveWorkspaceProvider.");
  return value;
}
