import { ArrowRight, CheckCircle2, MessageSquareCheck, ShieldCheck } from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";

import { LegalFooter } from "../components/legal/LegalFooter";
import { Breadcrumbs } from "../components/navigation/Breadcrumbs";
import { PublicHeader } from "../components/navigation/PublicHeader";
import { siteUrl } from "../lib/siteUrl";
import { thankYouCopy } from "../lib/thankYou";
import "./ThankYouPage.css";

interface FlowContent {
  icon: typeof CheckCircle2;
  eyebrow: string;
  title: string;
  description: string;
  primaryAction: { label: string; to: string };
  secondaryAction?: { label: string; to: string };
  note?: string;
}

export function ThankYouPage() {
  const [searchParams] = useSearchParams();
  const flow = searchParams.get("flow")?.toLowerCase();

  const content: FlowContent = (() => {
    switch (flow) {
      case "pro":
        return {
          ...thankYouCopy.pro,
          primaryAction: { label: "Go to your workspace", to: "/app" },
          secondaryAction: { label: "Manage Plan & Billing", to: "/app/settings#plan-and-billing" },
          note: "Priority support response turnaround is typically within 24 hours.",
        };
      case "report":
        return {
          icon: MessageSquareCheck,
          eyebrow: "Feedback Received",
          title: "Thank you for your bug report",
          description:
            "We have received your diagnostic details and steps to reproduce. Our engineering team reviews all submitted reports within 24 to 48 hours.",
          primaryAction: { label: "Track your reports", to: "/app/support/reports" },
          secondaryAction: { label: "Return to workspace", to: "/app" },
          note: "You will be notified once our team triages and updates your report.",
        };
      case "review":
        return {
          ...thankYouCopy.review,
          primaryAction: { label: "Return to workspace", to: "/app" },
          secondaryAction: { label: "View customer reviews", to: "/#reviews" },
        };
      case "signup":
        return {
          ...thankYouCopy.signup,
          primaryAction: { label: "Open your workspace", to: "/app" },
          secondaryAction: { label: "Read the FAQ", to: siteUrl("/faq") },
          note: "No bank passwords required. Your data starts empty and stays private.",
        };
      default:
        return {
          icon: ShieldCheck,
          eyebrow: "Thank you",
          title: "Thank you for choosing Zoption",
          description:
            "We are committed to building a calm, integer-accurate financial workspace with zero credential harvesting, zero ads, and transparent math.",
          primaryAction: { label: "Go to workspace", to: "/app" },
          secondaryAction: { label: "Return to Home", to: "/" },
        };
    }
  })();

  const IconComponent = content.icon;

  return (
    <div className="thank-you-page">
      <PublicHeader />

      <main className="thank-you-main" id="main-content" tabIndex={-1}>
        <div className="thank-you-container">
          <Breadcrumbs items={[{ label: "Home", to: "/" }, { label: "Thank You" }]} />

          <article className="thank-you-card">
            <div className="thank-you-icon-wrap" aria-hidden="true">
              <IconComponent size={32} />
            </div>

            <p className="eyebrow">{content.eyebrow}</p>
            <h1>{content.title}</h1>
            <p className="thank-you-description">{content.description}</p>

            <div className="thank-you-actions">
              <Link className="button primary" to={content.primaryAction.to}>
                {content.primaryAction.label} <ArrowRight size={16} aria-hidden="true" />
              </Link>
              {content.secondaryAction && (
                <Link className="button secondary" to={content.secondaryAction.to}>
                  {content.secondaryAction.label}
                </Link>
              )}
            </div>

            {content.note && (
              <p className="thank-you-note">
                <CheckCircle2 size={15} aria-hidden="true" />
                <span>{content.note}</span>
              </p>
            )}
          </article>
        </div>
      </main>

      <LegalFooter />
    </div>
  );
}
