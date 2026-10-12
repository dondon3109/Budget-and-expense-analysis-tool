import type {
  AdminBugReport,
  CustomerReviewAdminDashboard,
  SponsoredProSeatSummary,
} from "@zoption/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowRight, LockKeyhole, RefreshCw } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";

import { useAuth } from "../auth/AuthProvider";
import { SponsoredProSeatsSettings } from "../components/account/SponsoredProSeatsSettings";
import { AppShell } from "../components/layout/AppShell";
import { Breadcrumbs } from "../components/navigation/Breadcrumbs";
import { useBillingSummary } from "../hooks/useBillingSummary";
import { getAdminBugReports, getAdminCustomerReviews, getSponsoredProSeats } from "../lib/api";
import type { getProviderHealth } from "../lib/api";
import { LANDING_REVIEW_LIMIT } from "../lib/customerReviews";
import { queryKeys } from "../lib/queryKeys";
import { userWorkspace } from "../lib/workspace";
import { providerHealthQueryOptions } from "../queries/admin-providers";
import "./AdminOverviewPage.css";

const REVIEW_SUMMARY_QUERY = { page: 1, pageSize: 1 } as const;

const OPEN_REPORT_STATUSES: AdminBugReport["status"][] = [
  "new",
  "triaged",
  "needs_info",
  "in_progress",
];

type ProviderHealthStatus = Awaited<ReturnType<typeof getProviderHealth>>["health"][number];

type PegTone = "clear" | "attention" | "checking" | "unavailable";

interface PegQuery {
  isPending: boolean;
  isError: boolean;
}

interface AreaSummary {
  tone: PegTone;
  flag: string;
  figure: ReactNode;
  detail?: string;
  actionTo: string;
  actionLabel: string;
}

function count(value: number, singular: string, plural = `${singular}s`): string {
  return `${value} ${value === 1 ? singular : plural}`;
}

/** Figures keep their words in Manrope and their numbers in the mono face the desks use. */
function FigureCount({
  value,
  singular,
  plural,
}: {
  value: number;
  singular: string;
  plural?: string;
}) {
  return (
    <>
      <span className="admin-hub-count">{value}</span>{" "}
      {value === 1 ? singular : (plural ?? `${singular}s`)}
    </>
  );
}

function unreadArea(query: PegQuery, actionTo: string, actionLabel: string) {
  if (query.isPending) {
    return {
      tone: "checking",
      flag: "Checking",
      figure: "Reading live state",
      actionTo,
      actionLabel,
    } satisfies AreaSummary;
  }

  return {
    tone: "unavailable",
    flag: "Unavailable",
    figure: "State could not be read",
    actionTo,
    actionLabel,
  } satisfies AreaSummary;
}

function seatsArea(summary: SponsoredProSeatSummary | undefined, query: PegQuery): AreaSummary {
  const actionTo = "#sponsored-pro-seats";
  const actionLabel = "Manage on this page";

  if (query.isPending || query.isError || !summary) {
    return unreadArea(query, actionTo, actionLabel);
  }

  const { activeCount, pendingCount, availableCount, capacity } = summary;
  return {
    tone: pendingCount > 0 ? "attention" : "clear",
    flag: pendingCount > 0 ? "Invitation waiting" : "Seats settled",
    figure:
      pendingCount > 0 ? (
        <>
          <FigureCount value={pendingCount} singular="invitation" /> pending
        </>
      ) : (
        <>
          <span className="admin-hub-count">{activeCount}</span> of{" "}
          <span className="admin-hub-count">{capacity}</span> seats in use
        </>
      ),
    detail: `${count(availableCount, "seat")} open`,
    actionTo,
    actionLabel,
  };
}

function reviewsArea(
  dashboard: CustomerReviewAdminDashboard | undefined,
  query: PegQuery,
): AreaSummary {
  const actionTo = "/app/admin/reviews";
  const actionLabel = "Open moderation desk";

  if (query.isPending || query.isError || !dashboard) {
    return unreadArea(query, actionTo, actionLabel);
  }

  const { pending, published, total, featured } = dashboard.summary;
  return {
    tone: pending > 0 ? "attention" : "clear",
    flag: pending > 0 ? "Needs moderation" : "Inbox clear",
    figure:
      pending > 0 ? (
        <>
          <FigureCount value={pending} singular="submission" /> awaiting review
        </>
      ) : (
        <>
          <span className="admin-hub-count">{published}</span> published
        </>
      ),
    detail: `${featured} of ${LANDING_REVIEW_LIMIT} landing slots filled, ${total} collected`,
    actionTo,
    actionLabel,
  };
}

function modelsArea(health: ProviderHealthStatus[] | undefined, query: PegQuery): AreaSummary {
  const actionTo = "/app/admin/provider-configs";
  const actionLabel = "Open model registry";

  if (query.isPending || query.isError || !health) {
    return unreadArea(query, actionTo, actionLabel);
  }

  const missing = health.filter((entry) => !entry.hasCredential);
  const assistant = health.find((entry) => entry.service === "assistant");
  const active =
    assistant?.displayName ??
    `${assistant?.provider ?? "Unknown"} / ${assistant?.model ?? "unknown"}`;

  return {
    tone: missing.length > 0 ? "attention" : "clear",
    flag: missing.length > 0 ? "Credential missing" : "Services resolve",
    figure:
      missing.length > 0 ? (
        <>
          <FigureCount value={missing.length} singular="service" /> without a credential
        </>
      ) : (
        <>
          <FigureCount value={health.length} singular="service" /> ready
        </>
      ),
    detail: `Assistant on ${active}`,
    actionTo,
    actionLabel,
  };
}

function reportsArea(reports: AdminBugReport[] | undefined, query: PegQuery): AreaSummary {
  const actionTo = "/app/support/reports?view=admin";
  const actionLabel = "Open report triage";

  if (query.isPending || query.isError || !reports) {
    return unreadArea(query, actionTo, actionLabel);
  }

  const fresh = reports.filter((report) => report.status === "new").length;
  const open = reports.filter((report) => OPEN_REPORT_STATUSES.includes(report.status)).length;

  return {
    tone: fresh > 0 ? "attention" : "clear",
    flag: fresh > 0 ? "Untriaged" : "Triaged",
    figure:
      fresh > 0 ? (
        <FigureCount value={fresh} singular="new report" />
      ) : (
        <>
          <span className="admin-hub-count">{open}</span> still open
        </>
      ),
    detail: `${reports.length} received in total`,
    actionTo,
    actionLabel,
  };
}

function AreaPeg({ name, area }: { name: string; area: AreaSummary }) {
  return (
    <li className={`admin-hub-peg tone-${area.tone}`}>
      <h3 className="admin-hub-peg-name">{name}</h3>
      <p className="admin-hub-peg-status">
        <span className="admin-hub-peg-light" aria-hidden="true" />
        <span className="admin-hub-peg-flag">{area.flag}</span>
      </p>
      <p className="admin-hub-peg-figure">{area.figure}</p>
      {area.detail && <p className="admin-hub-peg-detail">{area.detail}</p>}
      <div className="admin-hub-peg-foot">
        {area.actionTo.startsWith("#") ? (
          <a className="admin-hub-peg-action" href={area.actionTo}>
            {area.actionLabel}
            <ArrowDown size={14} aria-hidden="true" />
          </a>
        ) : (
          <Link className="admin-hub-peg-action" to={area.actionTo}>
            {area.actionLabel}
            <ArrowRight size={14} aria-hidden="true" />
          </Link>
        )}
      </div>
    </li>
  );
}

export function AdminOverviewPage() {
  const { user } = useAuth();
  const workspace = userWorkspace(user!);
  const queryClient = useQueryClient();
  const billing = useBillingSummary(workspace);
  const isAdmin = billing.data?.canManageSponsoredSeats === true;

  const seats = useQuery({
    queryKey: queryKeys.sponsoredProSeats(workspace),
    queryFn: () => getSponsoredProSeats(workspace),
    enabled: isAdmin,
  });
  const reviews = useQuery({
    queryKey: queryKeys.adminCustomerReviews(workspace, REVIEW_SUMMARY_QUERY),
    queryFn: () => getAdminCustomerReviews(workspace, REVIEW_SUMMARY_QUERY),
    enabled: isAdmin,
  });
  const models = useQuery({
    ...providerHealthQueryOptions(workspace),
    enabled: isAdmin,
  });
  const reports = useQuery({
    queryKey: queryKeys.adminBugReports(workspace),
    queryFn: () => getAdminBugReports(workspace),
    enabled: isAdmin,
  });

  const seatArea = seatsArea(seats.data, seats);
  const reviewArea = reviewsArea(reviews.data, reviews);
  const modelArea = modelsArea(models.data?.health, models);
  const reportArea = reportsArea(reports.data, reports);
  const refreshing = [seats, reviews, models, reports].some((query) => query.isFetching);

  async function refreshAreas() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.sponsoredProSeats(workspace) }),
      queryClient.invalidateQueries({
        queryKey: queryKeys.adminCustomerReviews(workspace, REVIEW_SUMMARY_QUERY),
      }),
      queryClient.invalidateQueries({ queryKey: queryKeys.providerHealth(workspace) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.adminBugReports(workspace) }),
    ]);
  }

  if (billing.isLoading) {
    return (
      <AppShell>
        <div className="admin-hub">
          <p className="admin-hub-state" role="status">
            Checking platform administrator access…
          </p>
        </div>
      </AppShell>
    );
  }

  if (billing.error && !billing.data) {
    return (
      <AppShell>
        <div className="admin-hub">
          <section className="admin-hub-access" role="alert">
            <LockKeyhole size={27} aria-hidden="true" />
            <h1>Administrator access could not be checked</h1>
            <p>
              Zoption could not verify your platform permissions. Your access has not been denied;
              try the check again.
            </p>
            <button
              className="button secondary"
              type="button"
              onClick={() => void billing.refetch()}
            >
              Try again
            </button>
          </section>
        </div>
      </AppShell>
    );
  }

  if (!isAdmin) {
    return (
      <AppShell>
        <div className="admin-hub">
          <section className="admin-hub-access">
            <LockKeyhole size={27} aria-hidden="true" />
            <h1>Platform administrator access required</h1>
            <p>
              Sponsored seats, customer reviews, AI models, and report triage are available only to
              the Zoption platform administrator.
            </p>
            <Link className="button secondary" to="/app">
              Return to dashboard
            </Link>
          </section>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="admin-hub">
        <Breadcrumbs items={[{ label: "Home", to: "/app" }, { label: "Admin console" }]} />

        <header className="admin-hub-header">
          <div>
            <p>Platform administration</p>
            <h1>Admin console</h1>
          </div>
          <div className="admin-hub-header-actions">
            <button
              className="button secondary"
              type="button"
              onClick={() => void refreshAreas()}
              disabled={refreshing}
            >
              <RefreshCw size={14} aria-hidden="true" />
              {refreshing ? "Refreshing…" : "Refresh all"}
            </button>
          </div>
        </header>

        <nav aria-labelledby="admin-hub-rail-title">
          <h2 className="admin-hub-rail-title" id="admin-hub-rail-title">
            Admin areas
          </h2>
          <ol className="admin-hub-rail">
            <AreaPeg name="Sponsored Pro seats" area={seatArea} />
            <AreaPeg name="Customer reviews" area={reviewArea} />
            <AreaPeg name="AI &amp; voice models" area={modelArea} />
            <AreaPeg name="Support reports" area={reportArea} />
          </ol>
        </nav>

        <div className="admin-hub-floor">
          <SponsoredProSeatsSettings workspace={workspace} />
        </div>
      </div>
    </AppShell>
  );
}
