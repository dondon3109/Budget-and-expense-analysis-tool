import type { TransferFeeInsight } from "@zoption/shared";
import { Receipt } from "lucide-react";
import { Fragment } from "react";

import { formatMoney, formatMoneyParts } from "../../lib/formatters";
import "./TransferFeeInsightCard.css";

interface TransferFeeInsightCardProps {
  insight?: TransferFeeInsight;
}

function phpAmountParts(amountMinor: number) {
  return formatMoneyParts(amountMinor, "PHP").map((part, index) =>
    part.type === "currency" ? (
      <span className="transfer-fee-card-currency" key={`${part.type}-${index}`}>
        {part.value}
      </span>
    ) : (
      <Fragment key={`${part.type}-${index}`}>{part.value}</Fragment>
    ),
  );
}

export function TransferFeeInsightCard({ insight }: TransferFeeInsightCardProps) {
  if (!insight) return null;

  const hasUsdFees = insight.feesByCurrency.USD > 0;
  const transferNoun = insight.totalFeeChargedTransfers === 1 ? "transfer" : "transfers";

  return (
    <section className="transfer-fee-card" aria-label="Transfer fees overall">
      <span className="transfer-fee-card-heading">
        <span>Transfer fees (all time)</span>
        <span className="transfer-fee-card-icon">
          <Receipt size={16} aria-hidden="true" />
        </span>
      </span>
      <strong>{phpAmountParts(insight.feesByCurrency.PHP)}</strong>
      {hasUsdFees && (
        <div className="transfer-fee-card-secondary">
          <span>
            {formatMoney(insight.feesByCurrency.USD, "USD")}
            <em>USD</em>
          </span>
        </div>
      )}
      {insight.hasFees ? (
        <p>
          Across {insight.totalFeeChargedTransfers} fee-charged {transferNoun}
          {insight.totalTransfers > insight.totalFeeChargedTransfers
            ? ` of ${insight.totalTransfers} recorded transfers`
            : ""}
          .
        </p>
      ) : (
        <p>No transfer fees recorded yet.</p>
      )}
    </section>
  );
}
