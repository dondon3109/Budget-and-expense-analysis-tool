import { publicCustomerReviewsResponseSchema, type PublicCustomerReview } from "@zoption/shared";

import { API_URL, REQUEST_TIMEOUT_MS } from "./api";

/**
 * Build-time read of the published review lineup. Production fails the build
 * rather than ship a page that silently lost its reviews; preview and local
 * builds, whose API may be unreachable, render the empty state instead.
 */
export async function fetchPublicReviews(
  failClosed: boolean,
): Promise<readonly PublicCustomerReview[]> {
  try {
    const response = await fetch(`${API_URL}/api/reviews`, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!response.ok) throw new Error(`GET /api/reviews returned ${response.status}.`);
    return publicCustomerReviewsResponseSchema.parse(await response.json()).items;
  } catch (error) {
    if (failClosed) throw error;
    console.warn(`Rendering without customer reviews: ${String(error)}`);
    return [];
  }
}
