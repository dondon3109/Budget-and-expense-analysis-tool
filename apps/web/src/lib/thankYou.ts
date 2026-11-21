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
    eyebrow: "Membership",
    title: "Thank you for upgrading Zoption!",
    description:
      "Your plan now includes more AI actions and statement imports, automatic interest compounding, the interactive bill calendar, and direct support.",
  },
  review: {
    icon: Heart,
    eyebrow: "Customer Review",
    title: "Thank you for sharing your review!",
    description:
      "Your feedback helps others discover a private, integer-accurate way to track expenses and manage budgets without sharing online banking passwords.",
  },
};
