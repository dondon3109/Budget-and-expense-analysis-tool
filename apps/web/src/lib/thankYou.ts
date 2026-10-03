import { CheckCircle2, Heart, Sparkles, type LucideIcon } from "lucide-react";

interface ThankYouContent {
  icon: LucideIcon;
  eyebrow: string;
  title: string;
  description: string;
}

/** One message per finished task, shared by the in-app thank-you dialog and the /thank-you page. */
export type ThankYouFlow = "signup" | "pro" | "review";

export const thankYouCopy: Record<ThankYouFlow, ThankYouContent> = {
  signup: {
    icon: CheckCircle2,
    eyebrow: "Welcome to Zoption",
    title: "Thank you for creating your account",
    description:
      "Your private financial workspace is ready. Start by logging an expense with voice, snapping a receipt, or mapping your first bank statement.",
  },
  pro: {
    icon: Sparkles,
    eyebrow: "Pro Membership",
    title: "Thank you for upgrading to Zoption Pro!",
    description:
      "Your workspace now includes 10 statement imports per month, automatic interest compounding, the interactive renewal calendar, and direct priority support.",
  },
  review: {
    icon: Heart,
    eyebrow: "Customer Review",
    title: "Thank you for sharing your review!",
    description:
      "Your feedback helps others discover a private, integer-accurate way to track expenses and manage budgets without sharing online banking passwords.",
  },
};

// Set on the browser that created the account so the first workspace visit, even after the
// email-confirmation round trip, shows the welcome once.
const SIGNUP_PENDING_KEY = "zoption:thank-you:signup";

export function markSignupThankYouPending(): void {
  try {
    window.localStorage.setItem(SIGNUP_PENDING_KEY, "1");
  } catch {
    // Storage can be blocked; the welcome is optional.
  }
}

export function isSignupThankYouPending(): boolean {
  try {
    return window.localStorage.getItem(SIGNUP_PENDING_KEY) === "1";
  } catch {
    return false;
  }
}

export function clearSignupThankYouPending(): void {
  try {
    window.localStorage.removeItem(SIGNUP_PENDING_KEY);
  } catch {
    // See markSignupThankYouPending.
  }
}
