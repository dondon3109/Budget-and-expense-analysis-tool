import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from "react";
import { useColorScheme, View } from "react-native";

import { useThemeStore } from "@/stores/theme-store";
import { themes, type ThemeTokens } from "./tokens";

const ThemeContext = createContext<ThemeTokens>(themes.light);

export function ZoptionThemeProvider({ children }: PropsWithChildren) {
  const systemScheme = useColorScheme();
  const preference = useThemeStore((state) => state.preference);
  const [hydrated, setHydrated] = useState(() => useThemeStore.persist.hasHydrated());

  useEffect(() => {
    if (useThemeStore.persist.hasHydrated()) return;
    let active = true;
    // Hydration resolves even when the stored preference cannot be read, in
    // which case the store keeps its default. The app renders only after this
    // settles, so the first frame already carries the chosen theme instead of
    // flashing the system one and correcting itself.
    void Promise.resolve(useThemeStore.persist.rehydrate()).finally(() => {
      if (active) setHydrated(true);
    });
    return () => {
      active = false;
    };
  }, []);

  const theme = useMemo(
    () =>
      themes[preference === "system" ? (systemScheme === "dark" ? "dark" : "light") : preference],
    [preference, systemScheme],
  );

  if (!hydrated) return null;

  return (
    <ThemeContext.Provider value={theme}>
      <View className="flex-1" style={{ backgroundColor: theme.colors.canvas }}>
        {children}
      </View>
    </ThemeContext.Provider>
  );
}

export function useZoptionTheme(): ThemeTokens {
  return useContext(ThemeContext);
}
