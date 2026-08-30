import type { AdminBugReport, BugReport, BugReportStatus } from "@zoption/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Bug, CheckCircle2, Clock3, RefreshCw, ShieldCheck } from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";

import { useAuth } from "../auth/AuthProvider";
import { AppShell } from "../components/layout/AppShell";
import { Breadcrumbs } from "../components/navigation/Breadcrumbs";
import { useBillingSummary } from "../hooks/useBillingSummary";
import { getAdminBugReports, getBugReports, updateAdminBugReportStatus } from "../lib/api";
import { queryKeys } from "../lib/queryKeys";
import { userWorkspace } from "../lib/workspace";
import "./SupportReportsPage.css";

const STATUS_LABELS: Record<BugReportStatus, string> = {
  new: "New",
  triaged: "Triaged",
  needs_info: "Needs information",
  in_progress: "In progress",
  resolved: "Resolved",
  closed: "Closed",
  duplicate: "Duplicate",
};

function reportDate(value: string): string {
  return new Intl.DateTimeFormat("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "Asia/Manila",
  }).format(new Date(value));
}

function ReportDetails({ report, admin }: { report: BugReport | AdminBugReport; admin: boolean }) {
  return (
    <article className="support-report-detail">
      <header>
        <div>
          <span className="support-report-reference">{report.reference}</span>
          <h2>{report.title}</h2>
          <p>
            Submitted {reportDate(report.createdAt)} · {report.pageContext} · {report.category}
          </p>
        </div>
        <span className={`support-report-status status-${report.status}`}>
          {STATUS_LABELS[report.status]}
        </span>
      </header>

      {admin && "reporterEmail" in report && (
        <p className="support-report-reporter">
          Reporter: {report.reporterEmail ?? report.reporterUserId} · Notification:{" "}
          {report.notificationStatus}
        </p>
      )}

      <section>
        <h3>What happened</h3>
        <p>{report.actualBehavior}</p>
      </section>
      <section>
        <h3>Expected behavior</h3>
        <p>{report.expectedBehavior}</p>
      </section>
      <section>
        <h3>Steps to reproduce</h3>
        <p>{report.stepsToReproduce}</p>
      </section>
      <details>
        <summary>
          <ShieldCheck size={15} /> Submitted diagnostics
        </summary>
        <p>
          {report.diagnostics.route} · Zoption {report.diagnostics.releaseVersion} ·{" "}
          {report.diagnostics.platform} · {report.diagnostics.displayMode} ·{" "}
          {report.diagnostics.viewportWidth}×{report.diagnostics.viewportHeight}
        </p>
      </details>
    </article>
  );
}

export function SupportReportsPage() {
  const { user } = useAuth();
  const workspace = userWorkspace(user!);
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const billing = useBillingSummary(workspace);
  const admin = billing.data?.canManageSponsoredSeats === true;
  const requestedAdmin = searchParams.get("view") === "admin" && admin;

  const ownReports = useQuery({
    queryKey: queryKeys.bugReports(workspace),
    queryFn: () => getBugReports(workspace),
  });
  const adminReports = useQuery({
    queryKey: queryKeys.adminBugReports(workspace),
    queryFn: () => getAdminBugReports(workspace),
    enabled: admin,
  });
  const activeReports = requestedAdmin ? adminReports.data : ownReports.data;
  const selectedId = searchParams.get("report");
  const selected = activeReports?.find((report) => report.id === selectedId) ?? activeReports?.[0];

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: BugReportStatus }) =>
      updateAdminBugReportStatus(workspace, id, status),
    onSuccess: (updated) => {
      queryClient.setQueryData<AdminBugReport[]>(queryKeys.adminBugReports(workspace), (current) =>
        current?.map((report) => (report.id === updated.id ? updated : report)),
      );
    },
  });

  function selectReport(id: string) {
    const next = new URLSearchParams(searchParams);
    next.set("report", id);
    setSearchParams(next);
  }

  const loading = ownReports.isLoading || (requestedAdmin && adminReports.isLoading);
  const error = ownReports.error || (requestedAdmin ? adminReports.error : undefined);

  return (
    <AppShell>
      <div className="dashboard-page support-reports-page">
        <Breadcrumbs
          items={[
            { label: "Overview", to: "/app" },
            { label: "Settings", to: "/app/settings" },
            { label: "Bug reports" },
          ]}
        />
        <header className="dashboard-header support-reports-header">
          <div>
            <p className="eyebrow">Help &amp; contact</p>
            <h1>{requestedAdmin ? "Bug report inbox" : "Your bug reports"}</h1>
            <p>
              {requestedAdmin
                ? "Triage confirmed user reports without exposing their financial workspace."
                : "Track problems you explicitly reviewed and submitted through Zoption Support."}
            </p>
          </div>
          <Link className="button secondary" to="/app/settings#help-and-contact">
            <ArrowLeft size={16} /> Back to support
          </Link>
        </header>

        {admin && (
          <div className="support-report-view-switch" aria-label="Report view">
            <button
              type="button"
              className={!requestedAdmin ? "current" : ""}
              onClick={() => setSearchParams({})}
            >
              My reports
            </button>
            <button
              type="button"
              className={requestedAdmin ? "current" : ""}
              onClick={() => setSearchParams({ view: "admin" })}
            >
              Admin inbox
            </button>
          </div>
        )}

        {loading && (
          <p className="support-reports-state" role="status">
            <RefreshCw className="spinning" size={18} /> Loading bug reports…
          </p>
        )}
        {error && (
          <p className="page-error" role="alert">
            {error instanceof Error ? error.message : "Bug reports could not be loaded."}
          </p>
        )}
        {!loading && !error && activeReports?.length === 0 && (
          <section className="support-reports-empty">
            <Bug size={25} aria-hidden="true" />
            <h2>{requestedAdmin ? "The inbox is clear" : "No submitted bug reports"}</h2>
            <p>
              {requestedAdmin
                ? "New confirmed reports will appear here."
                : "Open Zoption Support and choose “Report a problem” when something is not working."}
            </p>
          </section>
        )}

        {activeReports && activeReports.length > 0 && selected && (
          <div className="support-reports-workspace">
            <nav className="support-reports-list" aria-label="Bug reports">
              {activeReports.map((report) => (
                <button
                  type="button"
                  key={report.id}
                  className={selected.id === report.id ? "current" : ""}
                  onClick={() => selectReport(report.id)}
                >
                  <span>{report.reference}</span>
                  <strong>{report.title}</strong>
                  <small>
                    {report.status === "resolved" || report.status === "closed" ? (
                      <CheckCircle2 size={13} />
                    ) : (
                      <Clock3 size={13} />
                    )}
                    {STATUS_LABELS[report.status]} · {reportDate(report.createdAt)}
                  </small>
                </button>
              ))}
            </nav>

            <div>
              {requestedAdmin && (
                <label className="support-report-status-control">
                  <span>Status</span>
                  <select
                    value={selected.status}
                    disabled={statusMutation.isPending}
                    onChange={(event) =>
                      statusMutation.mutate({
                        id: selected.id,
                        status: event.target.value as BugReportStatus,
                      })
                    }
                  >
                    {(Object.keys(STATUS_LABELS) as BugReportStatus[]).map((status) => (
                      <option value={status} key={status}>
                        {STATUS_LABELS[status]}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <ReportDetails report={selected} admin={requestedAdmin} />
              {statusMutation.isError && (
                <p className="page-error" role="alert">
                  {statusMutation.error.message}
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
