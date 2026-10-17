import type { ShareLink } from "@zoption/shared";
import { LinkIcon, LoaderCircle } from "lucide-react";

import { formatMoney } from "../../lib/formatters";
import type { AuthenticatedWorkspace } from "../../lib/workspace";
import { useRevokeShareLink, useShareLinks } from "../../queries/shares";
import "./SharedLinksSettings.css";

const dateFormatter = new Intl.DateTimeFormat("en-PH", { dateStyle: "medium" });

function describe(link: ShareLink): string {
  const { snapshot } = link;
  if (snapshot.kind === "balance") {
    return `Balance · ${formatMoney(snapshot.amountMinor, snapshot.currency)}`;
  }
  const sign = snapshot.direction === "income" ? "+" : "−";
  const label = snapshot.description ?? snapshot.categoryName ?? "Transaction";
  return `${label} · ${sign}${formatMoney(snapshot.amountMinor, snapshot.currency)}`;
}

function lifetime(link: ShareLink): string {
  const created = `Shared ${dateFormatter.format(new Date(link.createdAt))}`;
  return link.expiresAt
    ? `${created} · ends ${dateFormatter.format(new Date(link.expiresAt))}`
    : `${created} · no end date`;
}

/** Lists the workspace's active public links; turning one off deletes its snapshot. */
export function SharedLinksSettings({ workspace }: { workspace: AuthenticatedWorkspace }) {
  const linksQuery = useShareLinks(workspace);
  const revokeMutation = useRevokeShareLink(workspace);
  const links = linksQuery.data ?? [];

  return (
    <section id="shared-links" className="settings-section" aria-labelledby="shared-links-title">
      <div className="settings-section-heading">
        <div>
          <h2 id="shared-links-title">Shared links</h2>
        </div>
      </div>
      <p className="shared-links-lead">
        Links you created to a single transaction or balance. Anyone holding one sees only that
        snapshot. Turning a link off stops it working at once.
      </p>
      {linksQuery.isPending && <p className="shared-links-empty">Loading links…</p>}
      {linksQuery.isError && (
        <div className="form-error" role="alert">
          Shared links could not be loaded.
        </div>
      )}
      {linksQuery.isSuccess && links.length === 0 && (
        <p className="shared-links-empty">You have no active links.</p>
      )}
      {revokeMutation.error && (
        <div className="form-error" role="alert">
          {revokeMutation.error.message}
        </div>
      )}
      {links.length > 0 && (
        <ul className="shared-links-list">
          {links.map((link) => {
            const revoking = revokeMutation.isPending && revokeMutation.variables === link.id;
            return (
              <li key={link.id}>
                <LinkIcon size={16} aria-hidden="true" />
                <div>
                  <strong>{describe(link)}</strong>
                  <span>{lifetime(link)}</span>
                </div>
                <button
                  type="button"
                  className="button secondary compact"
                  disabled={revoking}
                  onClick={() => revokeMutation.mutate(link.id)}
                >
                  {revoking ? <LoaderCircle className="spin" size={15} aria-hidden="true" /> : null}
                  Turn off
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
