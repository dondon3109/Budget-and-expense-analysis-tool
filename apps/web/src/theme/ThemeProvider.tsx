import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export const THEMES = ["light", "dark", "coffee"] as const;
export type Theme = (typeof THEMES)[number];

export const THEME_STORAGE_KEY = "zoption-theme";

const LEGACY_THEME_STORAGE_KEY = "clarity-theme";

const THEME_COLORS: Record<Theme, string> = {
  light: "#f4f1e9",
  dark: "#0f1115",
  coffee: "#efe4d2",
};

const THEME_COLOR_SCHEMES: Record<Theme, "light" | "dark"> = {
  light: "light",
  dark: "dark",
  coffee: "light",
};

interface ThemeContextValue {
  theme: Theme;
  hasThemePreference: boolean;
  previewTheme: (theme: Theme) => void;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
}

interface ThemeState {
  theme: Theme;
  hasThemePreference: boolean;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

function isTheme(value: unknown): value is Theme {
  return typeof value === "string" && THEMES.some((theme) => theme === value);
}

function storedTheme(): Theme | undefined {
  if (typeof window === "undefined") return undefined;

  let legacyValue: string | null;

  try {
    const value = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (isTheme(value)) return value;

    legacyValue = window.localStorage.getItem(LEGACY_THEME_STORAGE_KEY);
  } catch {
    return undefined;
  }

  if (!isTheme(legacyValue)) return undefined;

  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, legacyValue);
    window.localStorage.removeItem(LEGACY_THEME_STORAGE_KEY);
  } catch {
    // The legacy preference still applies when migration writes are unavailable.
  }

  return legacyValue;
}

function systemTheme(): Theme {
  if (typeof window === "undefined") return "light";

  try {
    return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  } catch {
    return "light";
  }
}

function initialThemeState(): ThemeState {
  const root = typeof document === "undefined" ? undefined : document.getElementById("root");
  if (typeof window !== "undefined" && !root?.hasChildNodes()) return browserThemeState();

  return { theme: "light", hasThemePreference: false };
}

function browserThemeState(): ThemeState {
  const preference = storedTheme();
  const documentTheme = document.documentElement.dataset.theme;

  return {
    theme: isTheme(documentTheme) ? documentTheme : (preference ?? systemTheme()),
    hasThemePreference: preference !== undefined,
  };
}

function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = THEME_COLOR_SCHEMES[theme];
  document
    .querySelector<HTMLMetaElement>('meta[name="theme-color"]')
    ?.setAttribute("content", THEME_COLORS[theme]);
}

function persistTheme(theme: Theme) {
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
    window.localStorage.removeItem(LEGACY_THEME_STORAGE_KEY);
  } catch {
    // Theme switching still works when storage is unavailable.
  }
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [themeState, setThemeState] = useState<ThemeState>(initialThemeState);

  useEffect(() => {
    setThemeState(browserThemeState());
  }, []);

  useEffect(() => {
    applyTheme(themeState.theme);
  }, [themeState.theme]);

  useEffect(() => {
    function syncTheme(event: StorageEvent) {
      if (event.key === THEME_STORAGE_KEY && isTheme(event.newValue)) {
        setThemeState({ theme: event.newValue, hasThemePreference: true });
      }
    }

    window.addEventListener("storage", syncTheme);
    return () => window.removeEventListener("storage", syncTheme);
  }, []);

  const previewTheme = useCallback((nextTheme: Theme) => {
    applyTheme(nextTheme);
    setThemeState((current) => ({ ...current, theme: nextTheme }));
  }, []);

  const setTheme = useCallback((nextTheme: Theme) => {
    applyTheme(nextTheme);
    persistTheme(nextTheme);
    setThemeState({ theme: nextTheme, hasThemePreference: true });
  }, []);

  const toggleTheme = useCallback(() => {
    const currentIndex = THEMES.indexOf(themeState.theme);
    const nextTheme = THEMES[(currentIndex + 1) % THEMES.length] ?? "light";
    setTheme(nextTheme);
  }, [setTheme, themeState.theme]);

  const value = useMemo(
    () => ({ ...themeState, previewTheme, setTheme, toggleTheme }),
    [previewTheme, setTheme, themeState, toggleTheme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) throw new Error("useTheme must be used within ThemeProvider.");
  return context;
}
