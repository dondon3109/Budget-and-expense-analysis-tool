import type {
  CustomerReview,
  CustomerReviewAdminDashboard,
  CustomerReviewInput,
  CustomerReviewModerationStatus,
  CustomerReviewState,
  PublicCustomerReview,
} from "@zoption/shared";

import type { AuthenticatedWorkspace } from "../workspace";
import { ApiRequestError } from "./errors";
import { apiUrl, requestJson } from "./transport";

export async function getPublicCustomerReviews(
  signal?: AbortSignal,
): Promise<PublicCustomerReview[]> {
  const response = await fetch(`${apiUrl}/api/reviews`, {
    headers: { Accept: "application/json" },
    signal,
  });
  if (!response.ok) {
    throw new ApiRequestError(
      "Customer reviews could not be loaded.",
      response.status,
      "reviews_unavailable",
    );
  }
  const payload = (await response.json()) as { items?: PublicCustomerReview[] };
  return Array.isArray(payload.items) ? payload.items : [];
}

export function getCustomerReviewState(
  workspace: AuthenticatedWorkspace,
): Promise<CustomerReviewState> {
  return requestJson(workspace, "/api/app/reviews/me");
}

export function saveCustomerReview(
  workspace: AuthenticatedWorkspace,
  input: CustomerReviewInput,
): Promise<CustomerReview> {
  return requestJson(workspace, "/api/app/reviews/me", {
    method: "PUT",
    body: JSON.stringify(input),
  });
}

export function deleteCustomerReview(workspace: AuthenticatedWorkspace): Promise<void> {
  return requestJson(workspace, "/api/app/reviews/me", { method: "DELETE" });
}

export function getAdminCustomerReviews(
  workspace: AuthenticatedWorkspace,
  query: {
    page: number;
    pageSize: number;
    status?: CustomerReviewModerationStatus;
    rating?: number;
    search?: string;
  },
): Promise<CustomerReviewAdminDashboard> {
  const params = new URLSearchParams({
    page: String(query.page),
    pageSize: String(query.pageSize),
  });
  if (query.status) params.set("status", query.status);
  if (query.rating) params.set("rating", String(query.rating));
  if (query.search) params.set("search", query.search);
  return requestJson(workspace, `/api/app/admin/reviews?${params.toString()}`);
}

export function updateAdminCustomerReviewStatus(
  workspace: AuthenticatedWorkspace,
  id: string,
  status: Exclude<CustomerReviewModerationStatus, "pending">,
): Promise<CustomerReviewAdminDashboard> {
  return requestJson(workspace, `/api/app/admin/reviews/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify({ status }),
  });
}

export function updateAdminCustomerReviewLineup(
  workspace: AuthenticatedWorkspace,
  reviewIds: string[],
): Promise<CustomerReviewAdminDashboard> {
  return requestJson(workspace, "/api/app/admin/reviews/lineup", {
    method: "PUT",
    body: JSON.stringify({ reviewIds }),
  });
}
