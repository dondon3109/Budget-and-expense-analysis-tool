import { ArrowDownLeft, ArrowUpRight, LinkIcon, Wallet } from "lucide-react";
import { useEffect, useState } from "react";

import {
  fetchPublicShare,
  formatCheckedAt,
  formatShareDate,
  formatShareMoney,
  tokenFromHash,
  type PublicShare,
} from "../../lib/share";
import "./ShareCard.css";

type CardState =
  | { status: "loading" }
  | { status: "unavailable" }
  | { status: "failed" }
  | { status: "ready"; share: PublicShare };

/** How often an open page re-reads a live balance link. */
const LIVE_REFRESH_MS = 60_000;

/**
 * The share page's only island: it reads the token from the fragment, fetches the share, and
 * renders it. Nothing about the share is in the static HTML, so a link-preview crawler only ever
 * sees the generic page. A live balance link is re-read every minute while the page is visible,
 * so a revoke or expiry also takes the open page down.
 */
export function ShareCard() {
  const [state, setState] = useState<CardState>({ status: "loading" });

  useEffect(() => {
    const token = tokenFromHash(window.location.hash);
    if (!token) {
      setState({ status: "unavailable" });
      return;
    }
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const load = (refresh: boolean) => {
      fetchPublicShare(token)
        .then((share) => {
          if (!active) return;
          setState(share ? { status: "ready", share } : { status: "unavailable" });
          if (share?.live) timer = setTimeout(refreshWhenVisible, LIVE_REFRESH_MS);
        })
        .catch(() => {
          if (!active) return;
          // A failed refresh keeps the last balance; its "Updated" time shows how old it is.
          if (!refresh) {
            setState({ status: "failed" });
            return;
          }
          timer = setTimeout(refreshWhenVisible, LIVE_REFRESH_MS);
        });
    };
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") {
        load(true);
        return;
      }
      document.addEventListener("visibilitychange", () => load(true), { once: true });
    };
    load(false);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, []);

  if (state.status === "loading") {
    return (
      <section className="share-card share-card-quiet" aria-busy="true">
        <p>Opening shared snapshot…</p>
      </section>
    );
  }

  if (state.status !== "ready") {
    return (
      <section className="share-card share-card-quiet" role="alert">
        <LinkIcon size={24} aria-hidden="true" />
        <h1>
          {state.status === "failed" ? "We couldn't load this link" : "This link is unavailable"}
        </h1>
        <p>
          {state.status === "failed"
            ? "Check your connection and refresh the page."
            : "It may have expired, been turned off by the person who shared it, or been copied incompletely."}
        </p>
      </section>
    );
  }

  const { snapshot, live, sharerName } = state.share;
  const sharer = sharerName ?? "A Zoption user";

  if (snapshot.kind === "balance" && live) {
    return (
      <section className="share-card" aria-labelledby="share-card-title">
        <p className="eyebrow">{sharer} shared a balance</p>
        <div className="share-card-icon" aria-hidden="true">
          <Wallet size={22} />
        </div>
        <h1 id="share-card-title" className="share-card-amount">
          {formatShareMoney(live.amountMinor, live.currency)}
        </h1>
        <p className="share-card-meta">
          Current balance · Updated {formatCheckedAt(live.checkedAt)}
        </p>
        <dl className="share-card-details">
          <div>
            <dt>When shared, {formatShareDate(snapshot.asOf)}</dt>
            <dd>{formatShareMoney(snapshot.amountMinor, snapshot.currency)}</dd>
          </div>
        </dl>
      </section>
    );
  }

  if (snapshot.kind === "balance") {
    return (
      <section className="share-card" aria-labelledby="share-card-title">
        <p className="eyebrow">{sharer} shared a balance</p>
        <div className="share-card-icon" aria-hidden="true">
          <Wallet size={22} />
        </div>
        <h1 id="share-card-title" className="share-card-amount">
          {formatShareMoney(snapshot.amountMinor, snapshot.currency)}
        </h1>
        <p className="share-card-meta">As of {formatShareDate(snapshot.asOf)}</p>
      </section>
    );
  }

  const income = snapshot.direction === "income";
  const details = [
    snapshot.categoryName && { label: "Category", value: snapshot.categoryName },
    snapshot.date && { label: "Date", value: formatShareDate(snapshot.date) },
    snapshot.note && { label: "Note", value: snapshot.note },
  ].filter((detail): detail is { label: string; value: string } => Boolean(detail));

  return (
    <section className="share-card" aria-labelledby="share-card-title">
      <p className="eyebrow">
        {sharer} shared {income ? "money in" : "a spend"}
      </p>
      <div className={`share-card-icon ${income ? "is-income" : "is-expense"}`} aria-hidden="true">
        {income ? <ArrowDownLeft size={22} /> : <ArrowUpRight size={22} />}
      </div>
      <h1 id="share-card-title" className="share-card-amount">
        {income ? "+" : "−"}
        {formatShareMoney(snapshot.amountMinor, snapshot.currency)}
      </h1>
      {snapshot.description && <p className="share-card-title">{snapshot.description}</p>}
      {details.length > 0 && (
        <dl className="share-card-details">
          {details.map((detail) => (
            <div key={detail.label}>
              <dt>{detail.label}</dt>
              <dd>{detail.value}</dd>
            </div>
          ))}
        </dl>
      )}
    </section>
  );
}
