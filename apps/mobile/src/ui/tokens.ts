import { Platform, type BoxShadowValue, type ColorValue, type TextStyle } from "react-native";

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
  /** Primary action fill: near-black ink in light themes, mint in dark. */
  solid: ColorValue;
  solidPressed: ColorValue;
  onSolid: ColorValue;
  /** The mint stroke from the Z mark, used for small selection accents. */
  mint: ColorValue;
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

/**
 * Claymorphism: soft puffy surfaces lit from the top left. `raised` is a lifted slab, `well` an
 * inset dent for inputs and pressed controls. Needs RN boxShadow (inset), so it replaces `elevation`.
 */
export interface ClayTokens {
  raised: BoxShadowValue[];
  well: BoxShadowValue[];
}

export interface ThemeTokens {
  name: ThemeName;
  dark: boolean;
  colors: ColorTokens;
  clay: ClayTokens;
}

function clay(light: string, shade: string, inner: string, innerLight: string): ClayTokens {
  return {
    raised: [
      { offsetX: -5, offsetY: -5, blurRadius: 10, color: light },
      { offsetX: 6, offsetY: 8, blurRadius: 16, color: shade },
      { offsetX: -3, offsetY: -3, blurRadius: 6, color: inner, inset: true },
      { offsetX: 3, offsetY: 3, blurRadius: 6, color: innerLight, inset: true },
    ],
    well: [
      { offsetX: 3, offsetY: 3, blurRadius: 6, color: shade, inset: true },
      { offsetX: -3, offsetY: -3, blurRadius: 6, color: light, inset: true },
    ],
  };
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

export const radii = { sm: 12, md: 18, lg: 26, xl: 32, sheet: 32, round: 999 } as const;

/**
 * Headings use Bricolage Grotesque, embedded at build time by the expo-font
 * config plugin. The files are named after their PostScript names, which is the family name iOS
 * resolves, and Android resolves the file name, so one string works on both. Body text and money
 * stay on the system face for native rendering and true tabular figures. Each face is a single weight, so these styles leave
 * fontWeight at normal; a bold weight on a single-face family makes Android synthesize bold.
 */
export const fonts = {
  heading: "BricolageGrotesque-SemiBold",
  headingBold: "BricolageGrotesque-Bold",
} as const;
export const touchTarget = Platform.OS === "ios" ? 44 : 48;

export const typography = {
  display: {
    fontFamily: fonts.headingBold,
    fontSize: 28,
    lineHeight: 33,
    fontWeight: "normal" as const,
    letterSpacing: -0.8,
  },
  title: {
    fontFamily: fonts.heading,
    fontSize: 21,
    lineHeight: 26,
    fontWeight: "normal" as const,
    letterSpacing: -0.4,
  },
  headline: { fontSize: 16, lineHeight: 21, fontWeight: "600" as const },
  body: { fontSize: 15, lineHeight: 22, fontWeight: "400" as const },
  callout: { fontSize: 14, lineHeight: 20, fontWeight: "400" as const },
  label: { fontSize: 14, lineHeight: 19, fontWeight: "600" as const },
  caption: { fontSize: 12, lineHeight: 16, fontWeight: "500" as const },
  money: {
    fontSize: 24,
    lineHeight: 30,
    fontWeight: "700" as const,
    letterSpacing: -0.5,
    fontVariant: ["tabular-nums"] as TextStyle["fontVariant"],
  },
} as const;

export const elevation = {
  card: Platform.select({
    ios: {
      shadowColor: "#0c1512",
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
      canvas: "#e4eae7",
      canvasMuted: "#dde4e0",
      surface: "#eef3f0",
      surfaceRaised: "#f1f6f3",
      text: "#0c1512",
      textMuted: "#545f5a",
      border: "rgba(12, 21, 18, 0.07)",
      brand: "#0a7556",
      brandPressed: "#054a37",
      onBrand: "#ffffff",
      brandSoft: "#dcf5eb",
      solid: "#0c1512",
      solidPressed: "#22302b",
      onSolid: "#ffffff",
      mint: "#3ddca6",
      income: "#06734f",
      expense: "#b8461a",
      budget: "#6546e8",
      info: "#2459d8",
      warning: "#8f5a00",
      warningSoft: "#fff4d6",
      danger: "#c0352b",
      dangerSoft: "#fdecea",
      overlay: "rgba(8, 14, 12, 0.5)",
    },
    clay: clay(
      "rgba(255,255,255,0.95)",
      "rgba(52,74,64,0.28)",
      "rgba(52,74,64,0.10)",
      "rgba(255,255,255,0.7)",
    ),
  },
  dark: {
    name: "dark",
    dark: true,
    colors: {
      canvas: "#0d1211",
      canvasMuted: "#0e1312",
      surface: "#161d1b",
      surfaceRaised: "#19211f",
      text: "#edf2f0",
      textMuted: "#a3adaa",
      border: "rgba(255, 255, 255, 0.07)",
      brand: "#5fe3b8",
      brandPressed: "#a4f2d7",
      onBrand: "#04140e",
      brandSoft: "#0f3a2d",
      solid: "#5fe3b8",
      solidPressed: "#8eeccc",
      onSolid: "#04140e",
      mint: "#5fe3b8",
      income: "#5fe3b8",
      expense: "#ff8f63",
      budget: "#ad9bff",
      info: "#86aaff",
      warning: "#f2c56b",
      warningSoft: "#3a2e14",
      danger: "#ff8b82",
      dangerSoft: "#45201d",
      overlay: "rgba(0, 0, 0, 0.7)",
    },
    clay: clay(
      "rgba(255,255,255,0.06)",
      "rgba(0,0,0,0.6)",
      "rgba(0,0,0,0.25)",
      "rgba(255,255,255,0.05)",
    ),
  },
  coffee: {
    name: "coffee",
    dark: false,
    colors: {
      canvas: "#e6dac8",
      canvasMuted: "#f3ebdf",
      surface: "#f4ebdd",
      surfaceRaised: "#f7efe3",
      text: "#2a1c15",
      textMuted: "#65554b",
      border: "rgba(42, 28, 21, 0.08)",
      brand: "#0c6e52",
      brandPressed: "#064634",
      onBrand: "#ffffff",
      brandSoft: "#d8eee2",
      solid: "#2a1c15",
      solidPressed: "#453126",
      onSolid: "#fbf6ee",
      mint: "#3ddca6",
      income: "#066b50",
      expense: "#9a3c12",
      budget: "#6546c8",
      info: "#2d5cc0",
      warning: "#775400",
      warningSoft: "#f7ebc9",
      danger: "#b23a2e",
      dangerSoft: "#f7dfd9",
      overlay: "rgba(42, 28, 21, 0.56)",
    },
    clay: clay(
      "rgba(255,252,245,0.9)",
      "rgba(96,66,40,0.30)",
      "rgba(96,66,40,0.12)",
      "rgba(255,252,245,0.7)",
    ),
  },
};
