import { createContext, useContext, useEffect, useMemo, type PropsWithChildren } from "react";
import { useColorScheme, View } from "react-native";

import { useThemeStore } from "@/stores/theme-store";
import { themes, type ThemeTokens } from "./tokens";

const ThemeContext = createContext<ThemeTokens>(themes.light);

export function ZoptionThemeProvider({ children }: PropsWithChildren) {
  const systemScheme = useColorScheme();
  const preference = useThemeStore((state) => state.preference);

  useEffect(() => {
    void useThemeStore.persist.rehydrate();
  }, []);

  const theme = useMemo(
    () =>
      themes[preference === "system" ? (systemScheme === "dark" ? "dark" : "light") : preference],
    [preference, systemScheme],
  );

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
