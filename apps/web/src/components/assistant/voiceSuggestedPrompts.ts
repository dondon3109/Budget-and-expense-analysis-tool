import { goalConfigFor, type PrimaryGoal } from "@zoption/shared";

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

/** Suggestions for the empty state; the goal's starter prompt leads when a goal is set. */
export function voiceSuggestedPrompts(
  voiceLanguage: string,
  goal: PrimaryGoal | null | undefined,
): readonly string[] {
  // Auto and Tagalog interleave both languages so a short list still shows each.
  const defaults =
    voiceLanguage === "en"
      ? VOICE_SUGGESTED_PROMPTS
      : VOICE_SUGGESTED_PROMPTS_TAGALOG.flatMap((tagalog, index) => [
          VOICE_SUGGESTED_PROMPTS[index]!,
          tagalog,
        ]);
  const starter = goalConfigFor(goal).starterPrompt;
  return starter ? [starter, ...defaults.filter((prompt) => prompt !== starter)] : defaults;
}
