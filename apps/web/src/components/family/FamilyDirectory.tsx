import {
  FAMILY_SEAT_LIMIT,
  familyCreateSchema,
  type FamilyInvitation,
  type WorkspaceSummary,
} from "@zoption/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";

import {
  acceptFamilyInvitation,
  createFamily,
  declineFamilyInvitation,
  leaveFamily,
} from "../../lib/api";
import { invalidateAfterMembershipChange, useFamilyInvitations } from "../../queries/families";
import { ConfirmDialog } from "../common/ConfirmDialog";
import { useActiveWorkspace } from "../layout/ActiveWorkspaceProvider";
import { ROLE_LABELS, formatFamilyDate } from "./familyLabels";
import { SeatRulesDialog } from "./SeatRulesDialog";

type Pending =
  | { kind: "create"; name: string }
  | { kind: "accept"; invitation: FamilyInvitation }
  | { kind: "leave"; family: WorkspaceSummary };

/**
 * The person's side of families, shown in their personal workspace: invitations addressed to
 * them, the families they are in, and creating one.
 */
export function FamilyDirectory() {
  const { personal, workspaces, familiesAvailable, switchTo } = useActiveWorkspace();
  const queryClient = useQueryClient();
  const invitations = useFamilyInvitations(personal);
  const families = workspaces.filter((workspace) => workspace.kind === "family");
  const ownsFamily = families.some((family) => family.role === "owner");
  const [name, setName] = useState("");
  const [nameError, setNameError] = useState<string>();
  const [pending, setPending] = useState<{ action: Pending; opener: HTMLElement | null }>();

  const action = useMutation({
    mutationFn: async (next: Pending): Promise<string | null> => {
      if (next.kind === "create") return (await createFamily(personal, next.name)).id;
      if (next.kind === "accept") {
        await acceptFamilyInvitation(personal, next.invitation.id);
        return next.invitation.familyId;
      }
      await leaveFamily(personal, next.family.id);
      return null;
    },
    onSuccess: async (openFamilyId) => {
      await invalidateAfterMembershipChange(queryClient, personal);
      setPending(undefined);
      setName("");
      if (openFamilyId) switchTo(openFamilyId);
    },
  });
  const decline = useMutation({
    mutationFn: (invitationId: string) => declineFamilyInvitation(personal, invitationId),
    onSuccess: () => invalidateAfterMembershipChange(queryClient, personal),
  });

  function startCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = familyCreateSchema.shape.name.safeParse(name);
    if (!parsed.success) {
      setNameError("Name the family in 60 characters or fewer.");
      return;
    }
    setNameError(undefined);
    const opener = event.currentTarget.querySelector<HTMLElement>("button[type=submit]");
    setPending({ action: { kind: "create", name: parsed.data }, opener });
  }

  function close() {
    setPending(undefined);
    action.reset();
  }

  const actionError = action.error instanceof Error ? action.error.message : undefined;

  return (
    <>
      <section className="family-section" aria-labelledby="family-invitations-title">
        <h2 id="family-invitations-title">Invitations</h2>
        {invitations.isPending && <p className="family-muted">Loading invitations…</p>}
        {invitations.error && (
          <p className="page-error" role="alert">
            {invitations.error.message}
          </p>
        )}
        {invitations.data?.length === 0 && (
          <p className="family-muted">No one has invited you to a family.</p>
        )}
        <ul className="family-list">
          {invitations.data?.map((invitation) => (
            <li key={invitation.id}>
              <div>
                <strong>{invitation.familyName}</strong>
                <span>
                  {ROLE_LABELS[invitation.role]}
                  {invitation.invitedBy ? ` · from ${invitation.invitedBy}` : ""} · until{" "}
                  {formatFamilyDate(invitation.expiresAt)}
                </span>
              </div>
              <div className="family-row-actions">
                <button
                  type="button"
                  className="button secondary compact"
                  disabled={decline.isPending}
                  onClick={() => decline.mutate(invitation.id)}
                >
                  Decline
                </button>
                <button
                  type="button"
                  className="button primary compact"
                  onClick={(event) =>
                    setPending({
                      action: { kind: "accept", invitation },
                      opener: event.currentTarget,
                    })
                  }
                >
                  Accept
                </button>
              </div>
            </li>
          ))}
        </ul>
        {decline.error && (
          <p className="page-error" role="alert">
            {decline.error.message}
          </p>
        )}
      </section>

      <section className="family-section" aria-labelledby="family-list-title">
        <h2 id="family-list-title">Your families</h2>
        {families.length === 0 && <p className="family-muted">You are not in a family yet.</p>}
        <ul className="family-list">
          {families.map((family) => (
            <li key={family.id}>
              <div>
                <strong>{family.name}</strong>
                <span>{ROLE_LABELS[family.role]}</span>
              </div>
              <div className="family-row-actions">
                {family.role !== "owner" && (
                  <button
                    type="button"
                    className="button secondary compact"
                    onClick={(event) =>
                      setPending({ action: { kind: "leave", family }, opener: event.currentTarget })
                    }
                  >
                    Leave
                  </button>
                )}
                <button
                  type="button"
                  className="button primary compact"
                  onClick={() => switchTo(family.id)}
                >
                  Open
                </button>
              </div>
            </li>
          ))}
        </ul>
      </section>

      {familiesAvailable && !ownsFamily && (
        <section className="family-section" aria-labelledby="family-create-title">
          <h2 id="family-create-title">Start a family</h2>
          <p className="family-muted">
            Share one budget with up to {FAMILY_SEAT_LIMIT - 1} other people. Your personal budget
            stays private.
          </p>
          <form className="family-inline-form" onSubmit={startCreate} noValidate>
            <label>
              <span>Family name</span>
              <input
                value={name}
                maxLength={60}
                onChange={(event) => setName(event.target.value)}
                aria-invalid={Boolean(nameError)}
                aria-describedby={nameError ? "family-name-error" : undefined}
              />
            </label>
            <button type="submit" className="button primary">
              Create family
            </button>
          </form>
          {nameError && (
            <p id="family-name-error" className="form-error" role="alert">
              {nameError}
            </p>
          )}
        </section>
      )}

      {pending?.action.kind === "leave" ? (
        <ConfirmDialog
          title={`Leave ${pending.action.family.name}?`}
          consequence="You lose access right away. What you added stays in the family, and you can only rejoin if the owner invites you again."
          confirmLabel="Leave family"
          busyLabel="Leaving…"
          busy={action.isPending}
          error={actionError}
          returnFocus={pending.opener}
          onConfirm={() => action.mutate(pending.action)}
          onClose={close}
        />
      ) : pending ? (
        <SeatRulesDialog
          title={
            pending.action.kind === "create"
              ? `Create ${pending.action.name}`
              : `Join ${pending.action.invitation.familyName}`
          }
          confirmLabel={pending.action.kind === "create" ? "Create family" : "Join family"}
          busy={action.isPending}
          error={actionError}
          returnFocus={pending.opener}
          onConfirm={() => action.mutate(pending.action)}
          onClose={close}
        />
      ) : null}
    </>
  );
}
