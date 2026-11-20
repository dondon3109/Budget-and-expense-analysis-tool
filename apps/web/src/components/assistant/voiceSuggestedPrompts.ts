import {
  goalConfigFor,
  preferenceStarterPrompt,
  type MoneyPreferences,
  type PrimaryGoal,
} from "@zoption/shared";

export const VOICE_SUGGESTED_PROMPTS = [
  "How much did I spend this month?",
  "What is my biggest expense category?",
  "How are my budgets looking?",
  "Which debt should I pay first?",
] as const;

export const VOICE_SUGGESTED_PROMPTS_TAGALOG = [
  "Magkano ang nagastos ko ngayong buwan?",
  "Ano ang pinakamalaking kategorya ng gastos ko?",
  "Kumusta ang mga budget ko?",
  "Aling utang ang dapat kong unahing bayaran?",
] as const;

/**
 * Suggestions for the empty state; the goal's starter prompt leads when a goal is set, then the
 * money preferences' one.
 */
export function voiceSuggestedPrompts(
  voiceLanguage: string,
  goal: PrimaryGoal | null | undefined,
  preferences?: MoneyPreferences | null,
): readonly string[] {
  // Auto and Tagalog interleave both languages so a short list still shows each.
  const defaults =
    voiceLanguage === "en"
      ? VOICE_SUGGESTED_PROMPTS
      : VOICE_SUGGESTED_PROMPTS_TAGALOG.flatMap((tagalog, index) => [
          VOICE_SUGGESTED_PROMPTS[index]!,
          tagalog,
        ]);
  const starters = [goalConfigFor(goal).starterPrompt, preferenceStarterPrompt(preferences)].filter(
    (starter): starter is string => Boolean(starter),
  );
  if (starters.length === 0) return defaults;
  return [...new Set([...starters, ...defaults])];
}
