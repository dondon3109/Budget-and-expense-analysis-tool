import { Star } from "lucide-react";
import type { PublicCustomerReview } from "@zoption/shared";

/**
 * Rendered at build time from the published reviews, so crawlers read them as
 * HTML. A newly approved review appears with the next deploy.
 */
export function CustomerReviews({ reviews }: { reviews: readonly PublicCustomerReview[] }) {
  return (
    <section className="customer-reviews" id="reviews" aria-labelledby="reviews-title">
      <div className="reviews-intro">
        <p className="eyebrow">From real Zoption customers</p>
        <h2 id="reviews-title">Clearer money, in their own words.</h2>
        <p>
          Reviews come from signed-in customers who explicitly consent to sharing; Zoption selects
          which submissions appear here and does not rewrite their words with AI.
        </p>
      </div>

      {reviews.length > 0 ? (
        <div className="review-wall">
          {reviews.map((customerReview) => (
            <article
              className={
                customerReview.featuredOrder === 1 ? "customer-review featured" : "customer-review"
              }
              key={customerReview.id}
            >
              <div
                className="review-stars"
                role="img"
                aria-label={`${customerReview.rating} out of 5 stars`}
              >
                {[1, 2, 3, 4, 5].map((star) => (
                  <Star
                    key={star}
                    size={16}
                    fill="currentColor"
                    aria-hidden="true"
                    className={star <= customerReview.rating ? "filled" : ""}
                  />
                ))}
              </div>
              <blockquote>&ldquo;{customerReview.review}&rdquo;</blockquote>
              <footer>
                <strong>{customerReview.displayName}</strong>
                <span>Zoption customer</span>
              </footer>
            </article>
          ))}
        </div>
      ) : (
        <div className="reviews-empty">
          <MessageCircleReviewMark />
          <div>
            <strong>The first customer story starts here.</strong>
            <span>
              Signed-in customers can share a review after they have spent time with Zoption.
            </span>
          </div>
        </div>
      )}
    </section>
  );
}

function MessageCircleReviewMark() {
  return (
    <span className="reviews-empty-mark" aria-hidden="true">
      <Star size={22} fill="currentColor" />
    </span>
  );
}
