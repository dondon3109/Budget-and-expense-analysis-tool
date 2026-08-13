import { z } from "zod";

export const emailSchema = z.string().trim().email("Enter a valid email address.");

export const passwordPolicy = {
  minLength: 12,
  summary: "Use 12+ characters with uppercase, lowercase, a number, and a special character.",
} as const;

export function validateNewPassword(password: string): string | null {
  if (password.length < passwordPolicy.minLength) return passwordPolicy.summary;
  if (!/[a-z]/.test(password)) return passwordPolicy.summary;
  if (!/[A-Z]/.test(password)) return passwordPolicy.summary;
  if (!/\d/.test(password)) return passwordPolicy.summary;
  if (!/[^\p{L}\p{N}\s]/u.test(password)) return passwordPolicy.summary;
  return null;
}

export function authErrorMessage(error: unknown, fallback: string): string {
  if (!(error instanceof Error)) return fallback;
  if (/invalid login credentials/i.test(error.message)) return "Email or password is incorrect.";
  if (/network request failed|failed to fetch|networkerror/i.test(error.message)) {
    return "Zoption could not reach the sign-in service. Check your connection and try again.";
  }
  return error.message || fallback;
}
