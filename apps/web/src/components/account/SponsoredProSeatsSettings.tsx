import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router-dom";

import {
  addSponsoredProSeat,
  getSponsoredProSeats,
  inviteSponsoredProRecipient,
  isApiRequestError,
  resendSponsoredProInvitation,
  replaceSponsoredProSeat,
  revokeSponsoredProSeat,
} from "../../lib/api";
import { queryKeys } from "../../lib/queryKeys";
import type { AuthenticatedWorkspace } from "../../lib/workspace";
import "./SponsoredProSeatsSettings.css";

function displayDate(value: string | null): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

export function SponsoredProSeatsSettings({ workspace }: { workspace: AuthenticatedWorkspace }) {
  const queryClient = useQueryClient();
  const [email, setEmail] = useState("");
  const [inviteEmail, setInviteEmail] = useState<string>();
  const [replacementEmails, setReplacementEmails] = useState<Record<number, string>>({});
  const [revokeSlot, setRevokeSlot] = useState<number>();
  const [feedback, setFeedback] = useState<string>();

  const seats = useQuery({
    queryKey: queryKeys.sponsoredProSeats(workspace),
    queryFn: () => getSponsoredProSeats(workspace),
  });

  async function refresh() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.sponsoredProSeats(workspace) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.billing(workspace) }),
    ]);
  }

  const add = useMutation({
    mutationFn: () => addSponsoredProSeat(workspace, email),
    onSuccess: async () => {
      setEmail("");
      setInviteEmail(undefined);
      setFeedback("Sponsored Pro seat added.");
      await refresh();
    },
    onError: (error) => {
      if (isApiRequestError(error) && error.code === "recipient_must_sign_in") {
        setInviteEmail(email);
        setFeedback(
          "This person has not signed in yet. Send a secure sign-in invitation to reserve a seat.",
        );
        return;
      }
      setFeedback(
        error instanceof Error ? error.message : "The sponsored seat could not be added.",
      );
    },
  });

  const invite = useMutation({
    mutationFn: () => inviteSponsoredProRecipient(workspace, inviteEmail ?? email),
    onSuccess: async () => {
      setEmail("");
      setInviteEmail(undefined);
      setFeedback("Invitation sent. The seat is reserved until the recipient signs in.");
      await refresh();
    },
    onError: (error) =>
      setFeedback(error instanceof Error ? error.message : "The invitation could not be sent."),
  });

  const replace = useMutation({
    mutationFn: ({ slotNumber, nextEmail }: { slotNumber: number; nextEmail: string }) =>
      replaceSponsoredProSeat(workspace, slotNumber, nextEmail),
    onSuccess: async (_seat, variables) => {
      setReplacementEmails((current) => ({ ...current, [variables.slotNumber]: "" }));
      setFeedback(
        "Sponsored Pro seat replaced. The former recipient lost sponsored access immediately.",
      );
      await refresh();
    },
    onError: (error) =>
      setFeedback(error instanceof Error ? error.message : "The seat could not be replaced."),
  });

  const revoke = useMutation({
    mutationFn: (slotNumber: number) => revokeSponsoredProSeat(workspace, slotNumber),
    onSuccess: async () => {
      setRevokeSlot(undefined);
      setFeedback("Sponsored Pro seat revoked and freed immediately.");
      await refresh();
    },
    onError: (error) =>
      setFeedback(error instanceof Error ? error.message : "The seat could not be revoked."),
  });

  const resend = useMutation({
    mutationFn: (slotNumber: number) => resendSponsoredProInvitation(workspace, slotNumber),
    onSuccess: async () => {
      setFeedback("Invitation sent again.");
      await refresh();
    },
    onError: (error) =>
      setFeedback(error instanceof Error ? error.message : "The invitation could not be sent."),
  });

  const busy =
    add.isPending || invite.isPending || replace.isPending || revoke.isPending || resend.isPending;

  return (
    <section
      id="sponsored-pro-seats"
      className="settings-section sponsored-pro-seats"
      aria-labelledby="sponsored-pro-seats-title"
    >
      <div className="settings-section-heading">
        <div>
          <h2 id="sponsored-pro-seats-title">Sponsored Pro seats</h2>
          <p>Manage five complimentary Pro seats without accessing anyone&apos;s financial data.</p>
        </div>
        <div className="sponsored-pro-seats-admin-actions">
          <Link className="button secondary compact" to="/app/admin/reviews">
            Manage reviews
          </Link>
          <span>{seats.data ? `${seats.data.activeCount} of 5 active` : "Loading"}</span>
        </div>
      </div>

      <form
        className="sponsored-pro-seats-add"
        onSubmit={(event) => {
          event.preventDefault();
          setFeedback(undefined);
          void add.mutateAsync();
        }}
      >
        <div className="sponsored-pro-seats-add-heading">
          <h3>Add a sponsored recipient</h3>
          <p>Assign one available complimentary Pro seat to a recipient.</p>
        </div>
        <label htmlFor="sponsored-seat-email">Recipient email</label>
        <div>
          <input
            id="sponsored-seat-email"
            type="email"
            autoComplete="email"
            aria-describedby="sponsored-seat-email-help"
            value={email}
            onChange={(event) => {
              setEmail(event.target.value);
              setInviteEmail(undefined);
            }}
            required
            disabled={busy}
          />
          <button className="button primary compact" type="submit" disabled={busy || !email.trim()}>
            {add.isPending ? "Adding…" : "Add seat"}
          </button>
        </div>
        <small id="sponsored-seat-email-help">
          A person must sign in and confirm their email before a seat can be active. Their email is
          never shown in this list.
        </small>
      </form>

      {inviteEmail && (
        <div className="sponsored-pro-seats-invite" role="status">
          <p>Reserve one available seat and email a sign-in invitation to this recipient?</p>
          <button
            className="button secondary compact"
            type="button"
            disabled={busy}
            onClick={() => void invite.mutateAsync()}
          >
            {invite.isPending ? "Sending…" : "Send invitation"}
          </button>
          <button
            className="button ghost compact"
            type="button"
            disabled={busy}
            onClick={() => setInviteEmail(undefined)}
          >
            Cancel
          </button>
        </div>
      )}

      {seats.data && (
        <div className="sponsored-pro-seats-list" aria-label="Sponsored Pro seats">
          <p className="sponsored-pro-seats-capacity">
            {seats.data.activeCount} active, {seats.data.pendingCount} pending,{" "}
            {seats.data.availableCount} available
          </p>
          {seats.data.seats.length === 0 ? (
            <p className="settings-helper">No sponsored seats are currently reserved.</p>
          ) : (
            seats.data.seats.map((seat) => (
              <article className="sponsored-pro-seat" key={seat.slotNumber}>
                <div>
                  <strong>Seat {seat.slotNumber}</strong>
                  <p>
                    {seat.state === "active"
                      ? `Active for ${seat.beneficiaryUserId}`
                      : `Invitation pending since ${displayDate(seat.invitedAt)}`}
                  </p>
                  {seat.state === "active" && (
                    <small>Assigned {displayDate(seat.assignedAt)}</small>
                  )}
                </div>
                <div className="sponsored-pro-seat-actions">
                  {seat.state === "pending" && (
                    <button
                      className="button secondary compact"
                      type="button"
                      disabled={busy || !seat.canResendInvitation}
                      onClick={() => void resend.mutateAsync(seat.slotNumber)}
                    >
                      {resend.isPending ? "Sending…" : "Resend invitation"}
                    </button>
                  )}
                  {seat.state === "active" && (
                    <form
                      onSubmit={(event) => {
                        event.preventDefault();
                        void replace.mutateAsync({
                          slotNumber: seat.slotNumber,
                          nextEmail: replacementEmails[seat.slotNumber] ?? "",
                        });
                      }}
                    >
                      <label
                        className="sr-only"
                        htmlFor={`replace-sponsored-seat-${seat.slotNumber}`}
                      >
                        Replacement recipient email for seat {seat.slotNumber}
                      </label>
                      <input
                        id={`replace-sponsored-seat-${seat.slotNumber}`}
                        type="email"
                        placeholder="Replacement email"
                        value={replacementEmails[seat.slotNumber] ?? ""}
                        onChange={(event) =>
                          setReplacementEmails((current) => ({
                            ...current,
                            [seat.slotNumber]: event.target.value,
                          }))
                        }
                        required
                        disabled={busy}
                      />
                      <button
                        className="button secondary compact"
                        type="submit"
                        disabled={busy || !replacementEmails[seat.slotNumber]?.trim()}
                      >
                        Replace
                      </button>
                    </form>
                  )}
                  {revokeSlot === seat.slotNumber ? (
                    <div className="sponsored-pro-seat-confirm" role="alert">
                      <span>Revoke immediately?</span>
                      <button
                        className="button danger compact"
                        type="button"
                        disabled={busy}
                        onClick={() => void revoke.mutateAsync(seat.slotNumber)}
                      >
                        Confirm revoke
                      </button>
                      <button
                        className="button ghost compact"
                        type="button"
                        disabled={busy}
                        onClick={() => setRevokeSlot(undefined)}
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      className="button danger compact"
                      type="button"
                      disabled={busy}
                      onClick={() => setRevokeSlot(seat.slotNumber)}
                    >
                      Revoke
                    </button>
                  )}
                </div>
              </article>
            ))
          )}
        </div>
      )}

      {(feedback || seats.error) && (
        <p className="form-error" role="alert">
          {feedback ??
            (seats.error instanceof Error ? seats.error.message : "Seats could not be loaded.")}
        </p>
      )}
    </section>
  );
}
