import {
  FAMILY_CLOSING_DAYS,
  familyInviteSchema,
  familyMemberRoles,
  type FamilyDetail,
  type FamilyMember,
  type FamilyMemberRole,
  type WorkspaceSummary,
} from "@zoption/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";

import {
  closeFamily,
  inviteFamilyMember,
  leaveFamily,
  removeFamilyMember,
  resendFamilyInvitation,
  revokeFamilyInvitation,
  setFamilyMemberRole,
  transferFamily,
} from "../../lib/api";
import {
  invalidateAfterFamilyWrite,
  invalidateAfterMembershipChange,
  useFamily,
} from "../../queries/families";
import { ConfirmDialog } from "../common/ConfirmDialog";
import { useActiveWorkspace } from "../layout/ActiveWorkspaceProvider";
import { ROLE_LABELS, formatFamilyDate } from "./familyLabels";
import { SeatRulesDialog } from "./SeatRulesDialog";

type Pending =
  | { kind: "remove"; member: FamilyMember }
  | { kind: "transfer"; member: FamilyMember }
  | { kind: "close" }
  | { kind: "leave" };

function memberName(member: FamilyMember): string {
  return member.email ?? "Member without a confirmed email";
}

/** The active family: members, seats, and invitations, with the owner's controls. */
export function FamilyManager({ family }: { family: WorkspaceSummary }) {
  const { personal, workspace, switchTo } = useActiveWorkspace();
  const queryClient = useQueryClient();
  const detail = useFamily(workspace);
  const [pending, setPending] = useState<{ action: Pending; opener: HTMLElement | null }>();

  // Small writes (invite, resend, revoke, role) share one mutation and one error line.
  const write = useMutation({
    mutationFn: (run: () => Promise<unknown>) => run(),
    onSuccess: () => invalidateAfterFamilyWrite(queryClient, workspace),
  });
  const confirmed = useMutation({
    mutationFn: async (next: Pending) => {
      if (next.kind === "remove") await removeFamilyMember(workspace, next.member.userId);
      else if (next.kind === "transfer") await transferFamily(workspace, next.member.userId);
      else if (next.kind === "close") await closeFamily(workspace);
      else await leaveFamily(personal, family.id);
    },
    onSuccess: async (_, next) => {
      setPending(undefined);
      if (next.kind === "leave") switchTo(null);
      await Promise.all([
        invalidateAfterFamilyWrite(queryClient, workspace),
        invalidateAfterMembershipChange(queryClient, personal),
      ]);
    },
  });

  function ask(action: Pending, opener: HTMLElement) {
    confirmed.reset();
    setPending({ action, opener });
  }

  if (detail.isPending) return <p className="family-muted">Loading the family…</p>;
  if (detail.error) {
    return (
      <p className="page-error" role="alert">
        {detail.error.message}
      </p>
    );
  }
  const data = detail.data;
  const owner = data.role === "owner";
  const closing = data.closesAt !== null;
  const canManage = owner && !closing;
  const writeError = write.error instanceof Error ? write.error.message : undefined;
  const confirmError = confirmed.error instanceof Error ? confirmed.error.message : undefined;

  return (
    <>
      {closing && (
        <p className="family-closing" role="status">
          This family closes on {formatFamilyDate(data.closesAt!)}. Until then everyone can view and
          export it, but nothing can change.
        </p>
      )}

      <section className="family-section" aria-labelledby="family-members-title">
        <h2 id="family-members-title">Members</h2>
        <SeatSummary detail={data} owner={owner} />
        <ul className="family-list">
          {data.members.map((member) => (
            <li key={member.userId}>
              <div>
                <strong>{memberName(member)}</strong>
                <span>
                  {ROLE_LABELS[member.role]} · joined {formatFamilyDate(member.joinedAt)}
                </span>
              </div>
              {canManage && member.role !== "owner" && (
                <div className="family-row-actions">
                  <label className="family-role-select">
                    <span className="sr-only">Role for {memberName(member)}</span>
                    <select
                      value={member.role}
                      disabled={write.isPending}
                      onChange={(event) => {
                        const role = event.target.value as FamilyMemberRole;
                        write.mutate(() => setFamilyMemberRole(workspace, member.userId, role));
                      }}
                    >
                      {familyMemberRoles.map((role) => (
                        <option key={role} value={role}>
                          {ROLE_LABELS[role]}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button
                    type="button"
                    className="button secondary compact"
                    onClick={(event) => ask({ kind: "transfer", member }, event.currentTarget)}
                  >
                    Make owner
                  </button>
                  <button
                    type="button"
                    className="button danger compact"
                    onClick={(event) => ask({ kind: "remove", member }, event.currentTarget)}
                  >
                    Remove
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      </section>

      {canManage && (
        <InvitationsSection
          detail={data}
          busy={write.isPending}
          onInvite={(input) => write.mutateAsync(() => inviteFamilyMember(workspace, input))}
          onResend={(id) => write.mutate(() => resendFamilyInvitation(workspace, id))}
          onRevoke={(id) => write.mutate(() => revokeFamilyInvitation(workspace, id))}
        />
      )}
      {writeError && (
        <p className="page-error" role="alert">
          {writeError}
        </p>
      )}

      <section className="family-section" aria-labelledby="family-end-title">
        <h2 id="family-end-title">{owner ? "Close the family" : "Leave the family"}</h2>
        {owner ? (
          <>
            <p className="family-muted">
              To hand the family on, make another member the owner. Closing keeps it read only for{" "}
              {FAMILY_CLOSING_DAYS} days so everyone can export it, then deletes it.
            </p>
            {!closing && (
              <button
                type="button"
                className="button danger"
                onClick={(event) => ask({ kind: "close" }, event.currentTarget)}
              >
                Close family
              </button>
            )}
          </>
        ) : (
          <button
            type="button"
            className="button secondary"
            onClick={(event) => ask({ kind: "leave" }, event.currentTarget)}
          >
            Leave family
          </button>
        )}
      </section>

      {pending?.action.kind === "remove" ? (
        <SeatRulesDialog
          title={`Remove ${memberName(pending.action.member)}`}
          confirmLabel="Remove member"
          busy={confirmed.isPending}
          error={confirmError}
          returnFocus={pending.opener}
          onConfirm={() => confirmed.mutate(pending.action)}
          onClose={() => setPending(undefined)}
        />
      ) : pending ? (
        <ConfirmDialog
          {...confirmCopy(pending.action, data.name)}
          busy={confirmed.isPending}
          error={confirmError}
          returnFocus={pending.opener}
          onConfirm={() => confirmed.mutate(pending.action)}
          onClose={() => setPending(undefined)}
        />
      ) : null}
    </>
  );
}

function confirmCopy(action: Exclude<Pending, { kind: "remove" }>, familyName: string) {
  if (action.kind === "transfer") {
    return {
      title: `Make ${memberName(action.member)} the owner?`,
      consequence:
        "They will manage members and billing for the family, and you become a member. Only they can give ownership back.",
      confirmLabel: "Make owner",
    };
  }
  if (action.kind === "close") {
    return {
      title: `Close ${familyName}?`,
      consequence: `Everyone keeps read-only access for ${FAMILY_CLOSING_DAYS} days to export it, then the family and everything in it is deleted. This cannot be undone.`,
      confirmLabel: "Close family",
    };
  }
  return {
    title: `Leave ${familyName}?`,
    consequence:
      "You lose access right away. What you added stays in the family, and you can only rejoin if the owner invites you again.",
    confirmLabel: "Leave family",
  };
}

function SeatSummary({ detail, owner }: { detail: FamilyDetail; owner: boolean }) {
  const { seats, swaps } = detail;
  return (
    <p className="family-muted">
      {seats.used} of {seats.limit} seats taken
      {seats.cooling > 0 ? ` · ${seats.cooling} cooling down` : ""}
      {owner ? ` · ${swaps.used} of ${swaps.limit} seat changes used this year` : ""}
    </p>
  );
}

function InvitationsSection({
  detail,
  busy,
  onInvite,
  onResend,
  onRevoke,
}: {
  detail: FamilyDetail;
  busy: boolean;
  onInvite: (input: { email: string; role: FamilyMemberRole }) => Promise<unknown>;
  onResend: (invitationId: string) => void;
  onRevoke: (invitationId: string) => void;
}) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<FamilyMemberRole>("member");
  const [emailError, setEmailError] = useState<string>();

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = familyInviteSchema.safeParse({ email, role });
    if (!parsed.success) {
      setEmailError("Enter an email address.");
      return;
    }
    setEmailError(undefined);
    try {
      await onInvite(parsed.data);
      setEmail("");
    } catch {
      // The shared error line under the section shows why.
    }
  }

  return (
    <section className="family-section" aria-labelledby="family-invite-title">
      <h2 id="family-invite-title">Invitations</h2>
      <ul className="family-list">
        {detail.invitations.map((invitation) => (
          <li key={invitation.id}>
            <div>
              <strong>{invitation.email}</strong>
              <span>
                {ROLE_LABELS[invitation.role]} · until {formatFamilyDate(invitation.expiresAt)}
              </span>
            </div>
            <div className="family-row-actions">
              <button
                type="button"
                className="button secondary compact"
                disabled={busy}
                onClick={() => onResend(invitation.id)}
              >
                Resend
              </button>
              <button
                type="button"
                className="button danger compact"
                disabled={busy}
                onClick={() => onRevoke(invitation.id)}
              >
                Revoke
              </button>
            </div>
          </li>
        ))}
      </ul>
      <form className="family-inline-form" onSubmit={submit} noValidate>
        <label>
          <span>Email</span>
          <input
            type="email"
            value={email}
            autoComplete="off"
            onChange={(event) => setEmail(event.target.value)}
            aria-invalid={Boolean(emailError)}
            aria-describedby={emailError ? "family-invite-error" : undefined}
          />
        </label>
        <label>
          <span>Role</span>
          <select
            value={role}
            onChange={(event) => setRole(event.target.value as FamilyMemberRole)}
          >
            {familyMemberRoles.map((option) => (
              <option key={option} value={option}>
                {ROLE_LABELS[option]}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className="button primary" disabled={busy}>
          Send invitation
        </button>
      </form>
      {emailError && (
        <p id="family-invite-error" className="form-error" role="alert">
          {emailError}
        </p>
      )}
    </section>
  );
}
