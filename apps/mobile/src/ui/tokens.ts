import { Platform, type ColorValue, type TextStyle } from "react-native";

export type ThemeName = "light" | "dark" | "coffee";
export type ThemePreference = "system" | ThemeName;

export interface ColorTokens {
  canvas: ColorValue;
  canvasMuted: ColorValue;
  surface: ColorValue;
  surfaceRaised: ColorValue;
  text: ColorValue;
  textMuted: ColorValue;
  border: ColorValue;
  brand: ColorValue;
  brandPressed: ColorValue;
  onBrand: ColorValue;
  brandSoft: ColorValue;
  income: ColorValue;
  expense: ColorValue;
  budget: ColorValue;
  info: ColorValue;
  warning: ColorValue;
  warningSoft: ColorValue;
  danger: ColorValue;
  dangerSoft: ColorValue;
  overlay: ColorValue;
}

export interface ThemeTokens {
  name: ThemeName;
  dark: boolean;
  colors: ColorTokens;
}

export const spacing = {
  xxs: 4,
  xs: 8,
  sm: 12,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

export const radii = { sm: 8, md: 12, lg: 16, xl: 20, sheet: 24, round: 999 } as const;
export const touchTarget = Platform.OS === "ios" ? 44 : 48;

export const typography = {
  display: { fontSize: 34, lineHeight: 41, fontWeight: "700" as const },
  title: { fontSize: 22, lineHeight: 28, fontWeight: "700" as const },
  headline: { fontSize: 17, lineHeight: 22, fontWeight: "600" as const },
  body: { fontSize: 17, lineHeight: 24, fontWeight: "400" as const },
  callout: { fontSize: 16, lineHeight: 22, fontWeight: "400" as const },
  label: { fontSize: 14, lineHeight: 19, fontWeight: "600" as const },
  caption: { fontSize: 12, lineHeight: 16, fontWeight: "500" as const },
  money: {
    fontSize: 22,
    lineHeight: 28,
    fontWeight: "700" as const,
    fontVariant: ["tabular-nums"] as TextStyle["fontVariant"],
  },
} as const;

export const elevation = {
  card: Platform.select({
    ios: {
      shadowColor: "#12221e",
      shadowOpacity: 0.04,
      shadowRadius: 8,
      shadowOffset: { width: 0, height: 2 },
    },
    android: { elevation: 1 },
    default: {},
  }),
  dialog: Platform.select({
    ios: {
      shadowColor: "#000000",
      shadowOpacity: 0.22,
      shadowRadius: 32,
      shadowOffset: { width: 0, height: 18 },
    },
    android: { elevation: 12 },
    default: {},
  }),
} as const;

export const themes: Record<ThemeName, ThemeTokens> = {
  light: {
    name: "light",
    dark: false,
    colors: {
      canvas: "#f4f1e9",
      canvasMuted: "#faf8f2",
      surface: "#fffdf8",
      surfaceRaised: "#ffffff",
      text: "#17342e",
      textMuted: "#66706a",
      border: "#ddd8ce",
      brand: "#0f6b5b",
      brandPressed: "#06473d",
      onBrand: "#ffffff",
      brandSoft: "#d5f4ea",
      income: "#08776d",
      expense: "#a0441f",
      budget: "#6e4fc5",
      info: "#2f65c8",
      warning: "#745c21",
      warningSoft: "#fff8e6",
      danger: "#9b4945",
      dangerSoft: "#fff1ef",
      overlay: "rgba(18, 34, 30, 0.56)",
    },
  },
  dark: {
    name: "dark",
    dark: true,
    colors: {
      canvas: "#0f1115",
      canvasMuted: "#14171c",
      surface: "#171a20",
      surfaceRaised: "#1d2128",
      text: "#f2f4f7",
      textMuted: "#b2b8c2",
      border: "#2e3540",
      brand: "#67e0bc",
      brandPressed: "#a3f2d5",
      onBrand: "#102019",
      brandSoft: "#123f35",
      income: "#62ddcb",
      expense: "#ffad7b",
      budget: "#c2a6ff",
      info: "#8ab4ff",
      warning: "#e6c57d",
      warningSoft: "#3b311d",
      danger: "#f0a29c",
      dangerSoft: "#422522",
      overlay: "rgba(0, 0, 0, 0.74)",
    },
  },
  coffee: {
    name: "coffee",
    dark: false,
    colors: {
      canvas: "#efe4d2",
      canvasMuted: "#f8eddd",
      surface: "#fff9ef",
      surfaceRaised: "#fffdf7",
      text: "#3a2a23",
      textMuted: "#67574d",
      border: "#d2c1ad",
      brand: "#0f6b5b",
      brandPressed: "#06473d",
      onBrand: "#ffffff",
      brandSoft: "#d7efe6",
      income: "#08776d",
      expense: "#99441f",
      budget: "#6e4fc5",
      info: "#2f65c8",
      warning: "#745c21",
      warningSoft: "#f8edcf",
      danger: "#94433f",
      dangerSoft: "#f8dfda",
      overlay: "rgba(51, 35, 26, 0.62)",
    },
  },
};
