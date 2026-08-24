import type { CustomerReviewModerationStatus } from "@zoption/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  ExternalLink,
  Eye,
  EyeOff,
  LockKeyhole,
  MessageSquareQuote,
  RefreshCw,
  Search,
  Star,
} from "lucide-react";
import { useDeferredValue, useEffect, useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";

import { useAuth } from "../auth/AuthProvider";
import { AppShell } from "../components/layout/AppShell";
import { useBillingSummary } from "../hooks/useBillingSummary";
import {
  getAdminCustomerReviews,
  updateAdminCustomerReviewLineup,
  updateAdminCustomerReviewStatus,
} from "../lib/api";
import { queryKeys } from "../lib/queryKeys";
import { userWorkspace } from "../lib/workspace";
import "./AdminCustomerReviewsPage.css";

const LANDING_REVIEW_LIMIT = 6;
const INBOX_REFRESH_INTERVAL_MS = 30_000;

const STATUS_LABELS: Record<CustomerReviewModerationStatus, string> = {
  pending: "Awaiting review",
  published: "Published",
  hidden: "Hidden",
};

const DIRECTION_CONTRACT = `<!--
THESIS: Landing-page trust is curated as a finite visible lineup, not buried in a generic table.
OWN-WORLD: Zoption paper surfaces, deep green actions, quiet rules, Newsreader headings, and dense Manrope controls.
STORY: See the live lineup, find a submission, inspect immutable words, publish or hide, then place or reorder.
FIRST VIEWPORT: Title and preview action, six numbered lineup slots, then inbox and detail beginning together below.
FORM: Grounded structure 6, finite editorial tray above source inbox and detail pane; seed 3e908755.
-->`;

function displayDate(value: string): string {
  return new Intl.DateTimeFormat("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "Asia/Manila",
  }).format(new Date(value));
}

function ReviewStars({ rating }: { rating: number }) {
  return (
    <span className="admin-review-stars" aria-label={`${rating} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((value) => (
        <Star
          key={value}
          size={14}
          fill="currentColor"
          className={value <= rating ? "filled" : ""}
          aria-hidden="true"
        />
      ))}
    </span>
  );
}

function moderationClass(status: CustomerReviewModerationStatus): string {
  return `admin-review-status status-${status}`;
}

export function AdminCustomerReviewsPage() {
  const { user } = useAuth();
  const workspace = userWorkspace(user!);
  const queryClient = useQueryClient();
  const billing = useBillingSummary(workspace);
  const isAdmin = billing.data?.canManageSponsoredSeats === true;
  const [selectedId, setSelectedId] = useState<string>();
  const [statusFilter, setStatusFilter] = useState<"all" | CustomerReviewModerationStatus>("all");
  const [ratingFilter, setRatingFilter] = useState<"all" | number>("all");
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search.trim());
  const [page, setPage] = useState(1);
  const [feedback, setFeedback] = useState<string>();

  const reviewQuery = useMemo(
    () => ({
      page,
      pageSize: 50,
      ...(statusFilter === "all" ? {} : { status: statusFilter }),
      ...(ratingFilter === "all" ? {} : { rating: ratingFilter }),
      ...(deferredSearch ? { search: deferredSearch } : {}),
    }),
    [deferredSearch, page, ratingFilter, statusFilter],
  );

  const reviews = useQuery({
    queryKey: queryKeys.adminCustomerReviews(workspace, reviewQuery),
    queryFn: () => getAdminCustomerReviews(workspace, reviewQuery),
    enabled: isAdmin,
    refetchInterval: isAdmin ? INBOX_REFRESH_INTERVAL_MS : false,
  });

  const dashboard = reviews.data;
  const filteredReviews = dashboard?.items ?? [];

  useEffect(() => {
    setPage(1);
  }, [deferredSearch, ratingFilter, statusFilter]);

  useEffect(() => {
    if (
      selectedId &&
      (dashboard?.items.some((review) => review.id === selectedId) ||
        dashboard?.lineup.some((review) => review.id === selectedId))
    ) {
      return;
    }
    setSelectedId(filteredReviews[0]?.id ?? dashboard?.items[0]?.id);
  }, [dashboard?.items, dashboard?.lineup, filteredReviews, selectedId]);

  const fallbackSelected = filteredReviews[0] ?? dashboard?.items[0];
  const selected =
    (selectedId
      ? dashboard?.items.find((review) => review.id === selectedId) ??
        dashboard?.lineup.find((review) => review.id === selectedId)
      : undefined) ?? fallbackSelected;

  async function refreshDashboard() {
    await queryClient.invalidateQueries({
      queryKey: [...queryKeys.workspace(workspace), "admin", "customer-reviews"],
    });
  }

  const statusMutation = useMutation({
    mutationFn: ({
      id,
      status,
    }: {
      id: string;
      status: Exclude<CustomerReviewModerationStatus, "pending">;
    }) => updateAdminCustomerReviewStatus(workspace, id, status),
    onSuccess: async (_next, variables) => {
      await refreshDashboard();
      setFeedback(
        variables.status === "published"
          ? "Review published. Add it to the lineup when it should appear on the landing page."
          : "Review hidden and removed from the landing lineup.",
      );
    },
  });

  const lineupMutation = useMutation({
    mutationFn: (reviewIds: string[]) => updateAdminCustomerReviewLineup(workspace, reviewIds),
    onSuccess: async () => {
      await refreshDashboard();
      setFeedback("Landing lineup updated.");
    },
  });

  const busy = statusMutation.isPending || lineupMutation.isPending;
  const mutationError = statusMutation.error ?? lineupMutation.error;

  function applyStatusFilter(status: "all" | CustomerReviewModerationStatus) {
    setStatusFilter(status);
    setFeedback(undefined);
  }

  function updateLineup(reviewIds: string[]) {
    setFeedback(undefined);
    lineupMutation.mutate(reviewIds);
  }

  function moveReview(id: string, offset: -1 | 1) {
    if (!dashboard) return;
    const reviewIds = dashboard.lineup.map((review) => review.id);
    const currentIndex = reviewIds.indexOf(id);
    const nextIndex = currentIndex + offset;
    if (currentIndex < 0 || nextIndex < 0 || nextIndex >= reviewIds.length) return;
    [reviewIds[currentIndex], reviewIds[nextIndex]] = [
      reviewIds[nextIndex]!,
      reviewIds[currentIndex]!,
    ];
    updateLineup(reviewIds);
  }

  function renderPage(content: ReactNode) {
    return (
      <AppShell>
        <div className="admin-reviews-page">
          <span
            hidden
            aria-hidden="true"
            dangerouslySetInnerHTML={{ __html: DIRECTION_CONTRACT }}
          />
          {content}
        </div>
      </AppShell>
    );
  }

  if (billing.isLoading) {
    return renderPage(
      <p className="admin-reviews-state" role="status">
        Checking platform administrator access…
      </p>,
    );
  }

  if (billing.error && !billing.data) {
    return renderPage(
      <section className="admin-reviews-access" role="alert">
        <LockKeyhole size={27} aria-hidden="true" />
        <h1>Administrator access could not be checked</h1>
        <p>
          Zoption could not verify your platform permissions. Your access has not been denied; try
          the check again.
        </p>
        <button className="button secondary" type="button" onClick={() => void billing.refetch()}>
          Try again
        </button>
      </section>,
    );
  }

  if (!isAdmin) {
    return renderPage(
      <section className="admin-reviews-access">
        <LockKeyhole size={27} aria-hidden="true" />
        <h1>Platform administrator access required</h1>
        <p>This review inbox is available only to trusted Zoption platform administrators.</p>
        <Link className="button secondary" to="/app/settings">
          <ArrowLeft size={16} aria-hidden="true" /> Back to settings
        </Link>
      </section>,
    );
  }

  return renderPage(
    <>
      <header className="admin-reviews-header">
        <div>
          <p>Platform administration</p>
          <h1>Customer reviews</h1>
          <span>
            Review customer submissions, approve public wording, then choose which reviews appear on
            the landing page. The inbox checks for new submissions every 30 seconds.
          </span>
        </div>
        <div className="admin-reviews-header-actions">
          <button
            className="refresh-button"
            type="button"
            onClick={() => void reviews.refetch()}
            disabled={reviews.isFetching}
          >
            <RefreshCw
              size={15}
              className={reviews.isFetching ? "spinning" : ""}
              aria-hidden="true"
            />
            {reviews.isFetching ? "Refreshing…" : "Refresh inbox"}
          </button>
          <a className="button secondary" href="/#reviews" target="_blank" rel="noreferrer">
            Preview landing page <ExternalLink size={15} aria-hidden="true" />
          </a>
        </div>
      </header>

      {reviews.isLoading && (
        <p className="admin-reviews-state" role="status">
          Loading customer reviews…
        </p>
      )}
      {reviews.error && (
        <p className="page-error admin-reviews-state" role="alert">
          {reviews.error instanceof Error
            ? reviews.error.message
            : "Customer reviews could not be loaded."}
        </p>
      )}

      {dashboard && (
        <>
          <div
            className="admin-reviews-summary"
            role="group"
            aria-label="Filter review inbox by moderation status"
          >
            <button
              type="button"
              className={statusFilter === "all" ? "current" : ""}
              aria-pressed={statusFilter === "all"}
              onClick={() => applyStatusFilter("all")}
            >
              <span>All reviews</span>
              <strong>{dashboard.summary.total}</strong>
            </button>
            <button
              type="button"
              className={`${statusFilter === "pending" ? "current" : ""}${
                dashboard.summary.pending > 0 ? " needs-attention" : ""
              }`.trim()}
              aria-pressed={statusFilter === "pending"}
              onClick={() => applyStatusFilter("pending")}
            >
              <span>Needs review</span>
              <strong>{dashboard.summary.pending}</strong>
            </button>
            <button
              type="button"
              className={statusFilter === "published" ? "current" : ""}
              aria-pressed={statusFilter === "published"}
              onClick={() => applyStatusFilter("published")}
            >
              <span>Published</span>
              <strong>{dashboard.summary.published}</strong>
            </button>
            <button
              type="button"
              className={statusFilter === "hidden" ? "current" : ""}
              aria-pressed={statusFilter === "hidden"}
              onClick={() => applyStatusFilter("hidden")}
            >
              <span>Hidden</span>
              <strong>{dashboard.summary.hidden}</strong>
            </button>
            <div>
              <span>On landing</span>
              <strong>
                {dashboard.summary.featured}/{LANDING_REVIEW_LIMIT}
              </strong>
            </div>
          </div>

          <section className="admin-review-lineup" aria-labelledby="landing-lineup-title">
            <div className="admin-review-section-heading">
              <div>
                <h2 id="landing-lineup-title">Landing lineup</h2>
                <p>
                  These reviews appear publicly in this exact order. Move them with the controls,
                  never by editing their words.
                </p>
              </div>
              <span>
                {dashboard.lineup.length} of {LANDING_REVIEW_LIMIT} selected
              </span>
            </div>

            <div className="admin-review-lineup-grid">
              {Array.from({ length: LANDING_REVIEW_LIMIT }, (_, index) => {
                const review = dashboard.lineup[index];
                if (!review) {
                  return (
                    <div className="admin-review-lineup-empty" key={`empty-${index + 1}`}>
                      <span>{index + 1}</span>
                      <p>Empty landing slot</p>
                    </div>
                  );
                }
                return (
                  <article className="admin-review-lineup-card" key={review.id}>
                    <button
                      className="admin-review-lineup-select"
                      type="button"
                      onClick={() => setSelectedId(review.id)}
                      aria-label={`View review ${index + 1} from ${review.displayName}`}
                    >
                      <span className="admin-review-order">{index + 1}</span>
                      <ReviewStars rating={review.rating} />
                      <blockquote>{review.review}</blockquote>
                      <strong>{review.displayName}</strong>
                    </button>
                    <div className="admin-review-order-actions">
                      <button
                        type="button"
                        onClick={() => moveReview(review.id, -1)}
                        disabled={busy || index === 0}
                        aria-label={`Move ${review.displayName} earlier`}
                      >
                        <ArrowUp size={14} aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        onClick={() => moveReview(review.id, 1)}
                        disabled={busy || index === dashboard.lineup.length - 1}
                        aria-label={`Move ${review.displayName} later`}
                      >
                        <ArrowDown size={14} aria-hidden="true" />
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>

          <div className="admin-review-workspace">
            <section className="admin-review-inbox" aria-labelledby="review-inbox-title">
              <div className="admin-review-section-heading">
                <div>
                  <h2 id="review-inbox-title">Review inbox</h2>
                  <p>
                    {dashboard.summary.pending > 0
                      ? `${dashboard.summary.pending} submission${dashboard.summary.pending === 1 ? "" : "s"} awaiting your decision.`
                      : "No submissions are waiting for a moderation decision."}
                  </p>
                </div>
                <span>{dashboard.totalFiltered} matching</span>
              </div>

              <div className="admin-review-filters">
                <label className="admin-review-search">
                  <span className="sr-only">Search reviews</span>
                  <Search size={16} aria-hidden="true" />
                  <input
                    type="search"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Search name or review"
                  />
                </label>
                <label>
                  <span>Status</span>
                  <select
                    value={statusFilter}
                    onChange={(event) =>
                      setStatusFilter(event.target.value as "all" | CustomerReviewModerationStatus)
                    }
                  >
                    <option value="all">All statuses</option>
                    <option value="pending">Awaiting review</option>
                    <option value="published">Published</option>
                    <option value="hidden">Hidden</option>
                  </select>
                </label>
                <label>
                  <span>Rating</span>
                  <select
                    value={ratingFilter}
                    onChange={(event) =>
                      setRatingFilter(
                        event.target.value === "all" ? "all" : Number(event.target.value),
                      )
                    }
                  >
                    <option value="all">All ratings</option>
                    {[5, 4, 3, 2, 1].map((rating) => (
                      <option value={rating} key={rating}>
                        {rating} star{rating === 1 ? "" : "s"}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              {filteredReviews.length === 0 ? (
                <div className="admin-review-empty">
                  <MessageSquareQuote size={22} aria-hidden="true" />
                  <strong>
                    {dashboard.summary.total === 0 ? "No submitted reviews" : "No matches"}
                  </strong>
                  <p>
                    {dashboard.summary.total === 0
                      ? "Customer submissions will appear here after they consent to possible publication."
                      : "Clear or adjust the filters to see more reviews."}
                  </p>
                </div>
              ) : (
                <ul className="admin-review-list">
                  {filteredReviews.map((review) => (
                    <li key={review.id}>
                      <button
                        type="button"
                        className={selected?.id === review.id ? "current" : ""}
                        onClick={() => setSelectedId(review.id)}
                        aria-pressed={selected?.id === review.id}
                      >
                        <span className="admin-review-list-heading">
                          <strong>{review.displayName}</strong>
                          <span className={moderationClass(review.moderationStatus)}>
                            {review.featuredOrder !== null
                              ? `Landing ${review.featuredOrder}`
                              : STATUS_LABELS[review.moderationStatus]}
                          </span>
                        </span>
                        <ReviewStars rating={review.rating} />
                        <span className="admin-review-excerpt">{review.review}</span>
                        <small>Updated {displayDate(review.updatedAt)}</small>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {dashboard.totalPages > 1 && (
                <nav className="admin-review-pagination" aria-label="Review pages">
                  <button
                    type="button"
                    disabled={dashboard.page === 1 || reviews.isFetching}
                    onClick={() => setPage((current) => Math.max(1, current - 1))}
                  >
                    Previous
                  </button>
                  <span>
                    Page {dashboard.page} of {dashboard.totalPages}
                  </span>
                  <button
                    type="button"
                    disabled={dashboard.page === dashboard.totalPages || reviews.isFetching}
                    onClick={() => setPage((current) => current + 1)}
                  >
                    Next
                  </button>
                </nav>
              )}
            </section>

            <section className="admin-review-detail" aria-labelledby="review-detail-title">
              {selected ? (
                <>
                  <header>
                    <div>
                      <span>Selected submission</span>
                      <h2 id="review-detail-title">{selected.displayName}</h2>
                    </div>
                    <span className={moderationClass(selected.moderationStatus)}>
                      {STATUS_LABELS[selected.moderationStatus]}
                    </span>
                  </header>
                  <ReviewStars rating={selected.rating} />
                  <blockquote>&ldquo;{selected.review}&rdquo;</blockquote>
                  <p className="admin-review-immutable">
                    <LockKeyhole size={15} aria-hidden="true" />
                    Customer wording is immutable. Zoption does not rewrite it with AI; the customer
                    can replace or remove it from their own account.
                  </p>
                  <div className="admin-review-next-step" role="status">
                    <span>Current state</span>
                    {selected.featuredOrder !== null ? (
                      <>
                        <strong>Live on the landing page</strong>
                        <p>This review is publicly visible in position {selected.featuredOrder}.</p>
                      </>
                    ) : selected.moderationStatus === "published" ? (
                      <>
                        <strong>Approved, not yet public</strong>
                        <p>
                          Add this review to the lineup when it should appear on the landing page.
                        </p>
                      </>
                    ) : selected.moderationStatus === "hidden" ? (
                      <>
                        <strong>Hidden from public view</strong>
                        <p>Publish it again to make it eligible for the landing lineup.</p>
                      </>
                    ) : (
                      <>
                        <strong>Waiting for your decision</strong>
                        <p>
                          Publishing approves the wording; it will stay private until added to the
                          lineup.
                        </p>
                      </>
                    )}
                  </div>
                  <dl>
                    <div>
                      <dt>Submitted</dt>
                      <dd>{displayDate(selected.createdAt)}</dd>
                    </div>
                    <div>
                      <dt>Last updated</dt>
                      <dd>{displayDate(selected.updatedAt)}</dd>
                    </div>
                    <div>
                      <dt>Landing placement</dt>
                      <dd>
                        {selected.featuredOrder === null
                          ? "Not selected"
                          : `Position ${selected.featuredOrder}`}
                      </dd>
                    </div>
                  </dl>

                  <div className="admin-review-detail-actions">
                    {selected.moderationStatus !== "published" ? (
                      <button
                        className="button primary"
                        type="button"
                        disabled={busy}
                        onClick={() =>
                          statusMutation.mutate({ id: selected.id, status: "published" })
                        }
                      >
                        <Eye size={16} aria-hidden="true" />
                        {statusMutation.isPending ? "Publishing…" : "Publish review"}
                      </button>
                    ) : (
                      <button
                        className="button danger"
                        type="button"
                        disabled={busy}
                        onClick={() => statusMutation.mutate({ id: selected.id, status: "hidden" })}
                      >
                        <EyeOff size={16} aria-hidden="true" />
                        {statusMutation.isPending ? "Hiding…" : "Hide review"}
                      </button>
                    )}

                    {selected.featuredOrder !== null ? (
                      <button
                        className="button secondary"
                        type="button"
                        disabled={busy}
                        onClick={() =>
                          updateLineup(
                            dashboard.lineup
                              .filter((review) => review.id !== selected.id)
                              .map((review) => review.id),
                          )
                        }
                      >
                        Remove from landing
                      </button>
                    ) : (
                      <button
                        className="button secondary"
                        type="button"
                        disabled={
                          busy ||
                          selected.moderationStatus !== "published" ||
                          dashboard.lineup.length >= LANDING_REVIEW_LIMIT
                        }
                        onClick={() =>
                          updateLineup([
                            ...dashboard.lineup.map((review) => review.id),
                            selected.id,
                          ])
                        }
                      >
                        Add to landing lineup
                      </button>
                    )}
                  </div>
                  {selected.moderationStatus !== "published" && (
                    <p className="admin-review-action-help">
                      Publish this review before adding it to the landing lineup.
                    </p>
                  )}
                  {selected.featuredOrder === null &&
                    dashboard.lineup.length >= LANDING_REVIEW_LIMIT &&
                    selected.moderationStatus === "published" && (
                      <p className="admin-review-action-help">
                        The lineup is full. Remove one review before adding another.
                      </p>
                    )}
                </>
              ) : (
                <div className="admin-review-empty">
                  <MessageSquareQuote size={22} aria-hidden="true" />
                  <strong>Select a review</strong>
                  <p>Choose an inbox item to inspect its complete immutable submission.</p>
                </div>
              )}
            </section>
          </div>

          <div className="admin-review-feedback" aria-live="polite">
            {feedback && <p role="status">{feedback}</p>}
            {mutationError && (
              <p className="page-error" role="alert">
                {mutationError instanceof Error
                  ? mutationError.message
                  : "The review update could not be completed."}
              </p>
            )}
          </div>
        </>
      )}
    </>,
  );
}
