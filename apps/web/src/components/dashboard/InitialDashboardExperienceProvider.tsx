import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

import { useAuth } from "../../auth/AuthProvider";

type InitialDashboardExperienceContextValue = {
  hasCompletedInitialDashboardExperience: boolean;
  completeInitialDashboardExperience: () => void;
};

const InitialDashboardExperienceContext = createContext<InitialDashboardExperienceContextValue | null>(
  null,
);

export function InitialDashboardExperienceProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [completedUserIds, setCompletedUserIds] = useState<ReadonlySet<string>>(() => new Set());
  const userId = user?.id;

  useEffect(() => {
    if (userId !== undefined) return;

    setCompletedUserIds((current) => (current.size === 0 ? current : new Set()));
  }, [userId]);

  const hasCompletedInitialDashboardExperience =
    userId !== undefined && completedUserIds.has(userId);

  const completeInitialDashboardExperience = useCallback(() => {
    if (!userId) return;

    setCompletedUserIds((current) => {
      if (current.has(userId)) return current;
      return new Set(current).add(userId);
    });
  }, [userId]);

  const value = useMemo(
    () => ({ hasCompletedInitialDashboardExperience, completeInitialDashboardExperience }),
    [completeInitialDashboardExperience, hasCompletedInitialDashboardExperience],
  );

  return (
    <InitialDashboardExperienceContext.Provider value={value}>
      {children}
    </InitialDashboardExperienceContext.Provider>
  );
}

export function useInitialDashboardExperience() {
  const context = useContext(InitialDashboardExperienceContext);
  if (!context) {
    throw new Error(
      "useInitialDashboardExperience must be used within InitialDashboardExperienceProvider.",
    );
  }
  return context;
}
