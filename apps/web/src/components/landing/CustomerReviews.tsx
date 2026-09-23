import { Star } from "lucide-react";
import { useEffect, useState } from "react";
import type { PublicCustomerReview } from "@zoption/shared";

import { getPublicCustomerReviews } from "../../lib/api";

export function CustomerReviews() {
  const [reviews, setReviews] = useState<PublicCustomerReview[]>([]);
  const [reviewsLoaded, setReviewsLoaded] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    getPublicCustomerReviews(controller.signal)
      .then(setReviews)
      .catch(() => undefined)
      .finally(() => setReviewsLoaded(true));
    return () => controller.abort();
  }, []);

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
        <div className="review-wall" aria-live="polite">
          {reviews.map((customerReview) => (
            <article
              className={
                customerReview.featuredOrder === 1 ? "customer-review featured" : "customer-review"
              }
              key={customerReview.id}
            >
              <div className="review-stars" aria-label={`${customerReview.rating} out of 5 stars`}>
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
        <div className="reviews-empty" aria-live="polite">
          <MessageCircleReviewMark />
          <div>
            <strong>
              {reviewsLoaded
                ? "The first customer story starts here."
                : "Loading customer stories…"}
            </strong>
            <span>
              {reviewsLoaded
                ? "Signed-in customers can share a review after they have spent time with Zoption."
                : "Only reviews customers explicitly publish are shown."}
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
