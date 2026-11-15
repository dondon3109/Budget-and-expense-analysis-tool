/**
 * Built-in assistant skills: one-tap check-ups the chat offers as starter chips. A chip sends
 * its prompt as an ordinary message, and the Worker recognizes that exact text to run the
 * skill's fixed reads and period (apps/api/src/assistant/skills.ts), so the wording here is
 * the contract between the clients and the Worker.
 */
export const assistantSkills = [
  {
    id: "monthly_checkin",
    title: "Monthly check-in",
    prompt: "Give me a check-in on this month's money.",
  },
  {
    id: "last_month_review",
    title: "Review last month",
    prompt: "Review how my money went last month.",
  },
  {
    id: "bills_due",
    title: "Bills due soon",
    prompt: "What bills are due in the next 30 days?",
  },
  {
    id: "find_savings",
    title: "Find savings",
    prompt: "Where can I cut back on spending?",
  },
  {
    id: "goals_checkup",
    title: "Goals and debt check-up",
    prompt: "How are my goals and debts doing?",
  },
] as const;

export type AssistantSkill = (typeof assistantSkills)[number];
export type AssistantSkillId = AssistantSkill["id"];

function normalizedPrompt(value: string): string {
  const collapsed = value.trim().replace(/\s+/g, " ");
  // Trim end marks with a loop: an anchored /[.?!]+$/ backtracks quadratically on user input.
  let end = collapsed.length;
  while (end > 0 && ".?!".includes(collapsed[end - 1] ?? "")) end -= 1;
  return collapsed.slice(0, end).toLowerCase();
}

/** The skill a message runs: only its exact prompt, ignoring case, spacing, and end marks. */
export function assistantSkillForMessage(message: string): AssistantSkill | undefined {
  const wanted = normalizedPrompt(message);
  return assistantSkills.find((skill) => normalizedPrompt(skill.prompt) === wanted);
}
