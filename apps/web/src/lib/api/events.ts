import type {
  CalendarEventInput,
  CalendarEventMonth,
  CalendarEventRecord,
  CalendarEventUpdate,
} from "@zoption/shared";

import type { AuthenticatedWorkspace } from "../workspace";
import { requestJson } from "./transport";

export function getCalendarEvents(
  workspace: AuthenticatedWorkspace,
  month: string,
): Promise<CalendarEventMonth> {
  return requestJson(workspace, `/api/app/events?month=${encodeURIComponent(month)}`);
}

export function createCalendarEvent(
  workspace: AuthenticatedWorkspace,
  input: CalendarEventInput,
): Promise<CalendarEventRecord> {
  return requestJson(workspace, "/api/app/events", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function updateCalendarEvent(
  workspace: AuthenticatedWorkspace,
  args: { id: string; input: CalendarEventUpdate },
): Promise<CalendarEventRecord> {
  return requestJson(workspace, `/api/app/events/${args.id}`, {
    method: "PATCH",
    body: JSON.stringify(args.input),
  });
}

export function deleteCalendarEvent(workspace: AuthenticatedWorkspace, id: string): Promise<void> {
  return requestJson(workspace, `/api/app/events/${id}`, { method: "DELETE" });
}
