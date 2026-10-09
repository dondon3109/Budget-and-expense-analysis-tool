import { calendarEventInputSchema } from "@zoption/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { PartyPopper, Plus } from "lucide-react";
import { useState, type FormEvent } from "react";

import { createCalendarEvent } from "../../lib/api";
import { formatCalendarDate } from "../../lib/calendar";
import { formatMoney } from "../../lib/formatters";
import { queryKeys } from "../../lib/queryKeys";
import type { AuthenticatedWorkspace } from "../../lib/workspace";
import { useBudgetOccasions } from "../../queries/budgets";
import "./BudgetScopes.css";

/**
 * The occasions dated in a month, and a form that starts one. An occasion is a calendar event;
 * its limits are edited like any other plan once it exists.
 */
export function BudgetOccasions({
  workspace,
  monthStart,
  onOpen,
}: {
  workspace: AuthenticatedWorkspace;
  /** The month shown, `YYYY-MM-01`; a new occasion defaults to its first day. */
  monthStart: string;
  onOpen: (eventId: string) => void;
}) {
  const queryClient = useQueryClient();
  const occasions = useBudgetOccasions(workspace, monthStart);
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(monthStart);
  const [error, setError] = useState<string>();

  const createMutation = useMutation({
    mutationFn: (input: { title: string; date: string }) => createCalendarEvent(workspace, input),
    onSuccess: async (event) => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.allEvents(workspace) });
      setTitle("");
      onOpen(event.id);
    },
  });

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const parsed = calendarEventInputSchema.safeParse({ title, date });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Check the name and date.");
      return;
    }
    setError(undefined);
    createMutation.mutate({ title: parsed.data.title, date: parsed.data.date });
  }

  return (
    <section className="budget-occasions" aria-label="Occasion budgets">
      <form className="budget-occasion-form" onSubmit={handleSubmit}>
        <label>
          <span>Occasion</span>
          <input
            value={title}
            maxLength={120}
            placeholder="Mia's birthday party"
            onChange={(event) => setTitle(event.target.value)}
          />
        </label>
        <label>
          <span>Date</span>
          <input type="date" value={date} onChange={(event) => setDate(event.target.value)} />
        </label>
        <button className="button primary" type="submit" disabled={createMutation.isPending}>
          <Plus size={17} aria-hidden="true" />
          {createMutation.isPending ? "Creating…" : "New occasion"}
        </button>
      </form>
      {(error || createMutation.isError) && (
        <p className="page-error" role="alert">
          {error ?? createMutation.error?.message}
        </p>
      )}

      {occasions.isError && (
        <p className="page-error" role="alert">
          {occasions.error.message}
        </p>
      )}
      {occasions.data?.length === 0 && (
        <p className="budget-occasions-empty">
          No occasion budgets this month. Plan a birthday, trip, or holiday with its own limits.
        </p>
      )}
      <ul className="budget-occasion-list">
        {occasions.data?.map((occasion) => {
          const remaining = occasion.totalLimitMinor - occasion.totalSpentMinor;
          return (
            <li key={occasion.eventId}>
              <button type="button" onClick={() => onOpen(occasion.eventId)}>
                <PartyPopper size={18} aria-hidden="true" />
                <span>
                  <strong>{occasion.title}</strong>
                  <small>{formatCalendarDate(occasion.date)}</small>
                </span>
                <span className={remaining < 0 ? "over" : undefined}>
                  <strong>{formatMoney(Math.abs(remaining))}</strong>
                  <small>{remaining < 0 ? "over" : "left"}</small>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
