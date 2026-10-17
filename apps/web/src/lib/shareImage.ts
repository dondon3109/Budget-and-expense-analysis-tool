import type { ShareSnapshot } from "@zoption/shared";

import { formatMoney } from "./formatters";

const WIDTH = 1080;
const HEIGHT = 1080;

function formatDate(date: string): string {
  return new Intl.DateTimeFormat("en-PH", { dateStyle: "medium", timeZone: "UTC" }).format(
    new Date(`${date}T00:00:00Z`),
  );
}

/** The card's text, top to bottom: eyebrow, amount, then optional detail lines. */
export function shareCardLines(snapshot: ShareSnapshot, sharerName: string | null) {
  const sharer = sharerName ?? "A Zoption user";
  if (snapshot.kind === "balance") {
    return {
      eyebrow: `${sharer} shared a balance`,
      amount: formatMoney(snapshot.amountMinor, snapshot.currency),
      details: [`As of ${formatDate(snapshot.asOf)}`],
    };
  }
  const income = snapshot.direction === "income";
  return {
    eyebrow: `${sharer} shared ${income ? "money in" : "a spend"}`,
    amount: `${income ? "+" : "−"}${formatMoney(snapshot.amountMinor, snapshot.currency)}`,
    details: [
      snapshot.description,
      snapshot.categoryName,
      snapshot.date && formatDate(snapshot.date),
      snapshot.note,
    ].filter((line): line is string => Boolean(line)),
  };
}

function token(name: string, fallback: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}

/**
 * Draws the snapshot as a square PNG in the current theme. It has no link in it, so it is the
 * most private way to share: nothing about it can be revoked or followed back.
 */
export async function renderShareImage(
  snapshot: ShareSnapshot,
  sharerName: string | null,
): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("This browser cannot draw the share image.");
  await document.fonts?.ready;

  const lines = shareCardLines(snapshot, sharerName);
  context.fillStyle = token("--surface", "#ffffff");
  context.fillRect(0, 0, WIDTH, HEIGHT);
  context.textAlign = "center";

  context.fillStyle = token("--brand", "#0a7556");
  context.font = '500 34px "Geist Mono", ui-monospace, monospace';
  context.fillText(lines.eyebrow.toUpperCase(), WIDTH / 2, 380, WIDTH - 120);

  context.fillStyle = token("--ink", "#0c1512");
  context.font = '500 132px "Bricolage Grotesque", "Geist", sans-serif';
  context.fillText(lines.amount, WIDTH / 2, 540, WIDTH - 120);

  context.fillStyle = token("--muted", "#545f5a");
  context.font = '400 40px "Geist", ui-sans-serif, sans-serif';
  lines.details.slice(0, 4).forEach((line, index) => {
    context.fillText(line, WIDTH / 2, 640 + index * 58, WIDTH - 160);
  });

  context.fillStyle = token("--brand", "#0a7556");
  context.font = '600 36px "Bricolage Grotesque", "Geist", sans-serif';
  context.fillText("zoption.site", WIDTH / 2, HEIGHT - 90);

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("The share image could not be made."))),
      "image/png",
    );
  });
}
