import { Coffee, Moon, Sparkles, Sun, type LucideIcon } from "lucide-react";

import type { Theme } from "./ThemeProvider";

/** Every theme as the pickers show it: the first-visit dialog, the menu, and onboarding. */
export const THEME_OPTIONS = [
  {
    value: "light",
    label: "Light",
    description: "Bright, warm surfaces for daytime use.",
    icon: Sun,
  },
  {
    value: "dark",
    label: "Dark",
    description: "Neutral, low-glare surfaces for lower light.",
    icon: Moon,
  },
  {
    value: "coffee",
    label: "Coffee",
    description: "Cream and coffee tones with Zoption green accents.",
    icon: Coffee,
  },
  {
    value: "fun",
    label: "Fun",
    description: "Playful candy colors and puffy clay surfaces that match your pet.",
    icon: Sparkles,
  },
] as const satisfies ReadonlyArray<{
  value: Theme;
  label: string;
  description: string;
  icon: LucideIcon;
}>;
