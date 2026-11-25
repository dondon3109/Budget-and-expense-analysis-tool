import { calendarEventInputSchema } from "@zoption/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { PartyPopper, Plus } from "lucide-react";
import { useState, type FormEvent } from "react";
import {
  isAgentSubmit,
  readFormText,
  respondToAgent,
  webMcpFormProps,
  webMcpParamProps,
} from "@zoption/web-common/webmcp";

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

  async function runCreate(formData?: FormData) {
    const nextTitle = formData ? readFormText(formData, "title") : title;
    const nextDate = formData ? readFormText(formData, "date", monthStart) : date;

    if (formData) {
      setTitle(nextTitle);
      setDate(nextDate);
    }

    const parsed = calendarEventInputSchema.safeParse({ title: nextTitle, date: nextDate });
    if (!parsed.success) {
      const message = parsed.error.issues[0]?.message ?? "Check the name and date.";
      setError(message);
      return { error: message };
    }
    setError(undefined);
    try {
      const created = await createMutation.mutateAsync({
        title: parsed.data.title,
        date: parsed.data.date,
      });
      return { id: created.id, title: parsed.data.title, date: parsed.data.date };
    } catch (mutationError) {
      return {
        error:
          mutationError instanceof Error ? mutationError.message : "Could not create occasion.",
      };
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isAgentSubmit(event)) {
      const formData = new FormData(event.currentTarget);
      respondToAgent(event, runCreate(formData));
      return;
    }
    void runCreate();
  }

  return (
    <section className="budget-occasions" aria-label="Occasion budgets">
      <form
        className="budget-occasion-form"
        onSubmit={handleSubmit}
        {...webMcpFormProps({
          name: "create-budget-occasion",
          description:
            "Create a new occasion budget for a birthday, trip, or holiday. Requires user review before submitting.",
        })}
      >
        <label>
          <span>Occasion</span>
          <input
            name="title"
            value={title}
            maxLength={120}
            placeholder="Mia's birthday party"
            onChange={(event) => setTitle(event.target.value)}
          />
        </label>
        <label>
          <span>Date</span>
          <input
            name="date"
            type="date"
            value={date}
            onChange={(event) => setDate(event.target.value)}
            {...webMcpParamProps("Occasion date in YYYY-MM-DD format.")}
          />
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
