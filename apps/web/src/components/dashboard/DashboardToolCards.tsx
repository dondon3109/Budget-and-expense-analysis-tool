import { DEFAULT_OFW_EXCHANGE_RATES } from "@zoption/shared";
import { ChevronRight, Coins } from "lucide-react";
import { Link } from "react-router-dom";

import "./DashboardToolCards.css";

/**
 * The dashboard doorway into the remittance calculator, which the mobile home screen also
 * surfaces. Safe to spend lives in its own hero card above, so it is not repeated here.
 */
export function DashboardToolCards() {
  const usdMidMarketRate = DEFAULT_OFW_EXCHANGE_RATES.USD.midMarketRate.toFixed(2);

  return (
    <div className="dashboard-tool-cards">
      <Link className="dashboard-tool-card" to="/app/plan#remittance-calculator">
        <span className="dashboard-tool-card-icon">
          <Coins size={14} aria-hidden="true" />
        </span>
        <h3 className="dashboard-tool-card-title">Remittance calculator</h3>
        <ChevronRight className="dashboard-tool-card-chevron" size={16} aria-hidden="true" />
        <strong className="dashboard-tool-card-value">1 USD = ₱{usdMidMarketRate}</strong>
        <p className="dashboard-tool-card-copy">
          Compare provider fees and what your recipient actually receives.
        </p>
      </Link>
    </div>
  );
}
