import { ArrowRight } from "lucide-react";
import { useEffect, useRef, type CSSProperties } from "react";
import { Link } from "react-router-dom";

import { useReducedMotion } from "../../hooks/useReducedMotion";

import receiptPile768 from "../../assets/receipt-pile-768.webp";
import receiptPile1536 from "../../assets/receipt-pile-1536.webp";

/**
 * Loose receipts that fly into one ledger as the visitor scrolls. `dx`/`dy`/`r` are the
 * scattered offsets from each row's resting place in the ledger, in frame widths (cqw),
 * so the choreography scales with the image instead of the viewport.
 */
const RECEIPTS = [
  { label: "Rent", amount: "₱18,000", dx: -50, dy: 34, r: -8 },
  { label: "Groceries", amount: "₱6,500", dx: -22, dy: 37, r: 6 },
  { label: "Utilities", amount: "₱4,200", dx: -48, dy: 6, r: 5 },
  { label: "School", amount: "₱4,000", dx: -12, dy: 18, r: -5 },
  { label: "Transportation", amount: "₱3,200", dx: -38, dy: -14, r: -10 },
  { label: "Debt", amount: "₱3,700", dx: -30, dy: 13, r: 9 },
];

export function ReceiptPileScroll() {
  const sectionRef = useRef<HTMLElement>(null);
  const reduceMotion = useReducedMotion();

  // Publishes scroll progress through the pinned stage as `--p` (0 to 1); the stylesheet
  // derives every motion from it. Reduced motion keeps the stylesheet's resting `--p: 1`.
  useEffect(() => {
    const section = sectionRef.current;
    if (!section) return;
    if (reduceMotion) {
      section.style.removeProperty("--p");
      return;
    }

    let frame = 0;
    const update = () => {
      frame = 0;
      const rect = section.getBoundingClientRect();
      const travel = rect.height - window.innerHeight;
      const progress = travel > 0 ? Math.min(1, Math.max(0, -rect.top / travel)) : 1;
      section.style.setProperty("--p", progress.toFixed(4));
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };

    update();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
    };
  }, [reduceMotion]);

  return (
    <section className="receipt-scroll" ref={sectionRef} aria-labelledby="receipt-scroll-title">
      <div className="receipt-scroll-stage">
        <div className="receipt-scroll-copy">
          <p className="eyebrow">Sound familiar?</p>
          <h2 id="receipt-scroll-title">End the month-end money scramble.</h2>
          {/* data-scroll-fade tells the accessibility scan these beats cross-fade with scroll,
              so it measures each one only where it is fully shown. */}
          <div className="receipt-scroll-beats">
            <p className="receipt-scroll-beat receipt-scroll-beat-1" data-scroll-fade>
              <strong>Receipts everywhere.</strong> A notebook total, a spreadsheet that never
              matches, and cash you can&rsquo;t account for.
            </p>
            <p className="receipt-scroll-beat receipt-scroll-beat-2" data-scroll-fade>
              <strong>Zoption sorts the pile.</strong> Snap a receipt, say an expense, or import a
              statement, and every amount lands in its budget.
            </p>
            <p className="receipt-scroll-beat receipt-scroll-beat-3" data-scroll-fade>
              <strong>One clear month.</strong> Exact totals against your budget, so the next
              decision is obvious instead of stressful.
            </p>
          </div>
          <ol className="receipt-scroll-steps" aria-hidden="true">
            <li>Scattered</li>
            <li>Sorted</li>
            <li>Clear</li>
          </ol>
          <Link className="button primary" to="/signup">
            Clear the pile for free <ArrowRight size={17} aria-hidden="true" />
          </Link>
        </div>

        <div className="receipt-scroll-frame">
          <img
            src={receiptPile1536}
            srcSet={`${receiptPile768} 768w, ${receiptPile1536} 1536w`}
            sizes="(max-width: 900px) 100vw, 680px"
            width={1536}
            height={1024}
            loading="lazy"
            decoding="async"
            alt="A stressed woman at her desk with her head in her hand, surrounded by receipts, cash, a calculator, a handwritten list of monthly expenses, and a laptop spreadsheet."
          />
          <div className="receipt-scroll-veil" aria-hidden="true" />
          <div className="receipt-scroll-ledger" aria-hidden="true">
            <div className="receipt-scroll-ledger-head">
              <span>Monthly expenses</span>
              <small>Sorted by Zoption</small>
            </div>
            {RECEIPTS.map((receipt, index) => (
              <div
                className="receipt-scroll-chip"
                key={receipt.label}
                style={
                  {
                    "--dx": `${receipt.dx}cqw`,
                    "--dy": `${receipt.dy}cqw`,
                    "--r": `${receipt.r}deg`,
                    "--start": 0.24 + index * 0.06,
                  } as CSSProperties
                }
              >
                <span>{receipt.label}</span>
                <b>{receipt.amount}</b>
              </div>
            ))}
            <div className="receipt-scroll-ledger-total">
              <div>
                <span>Spent</span>
                <b>₱39,600</b>
                <small>of ₱44,000 budget</small>
              </div>
              <span className="receipt-scroll-meter">
                <span />
              </span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
