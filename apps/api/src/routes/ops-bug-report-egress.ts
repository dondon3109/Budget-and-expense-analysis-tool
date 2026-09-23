/**
 * BOUNDARY RULE:
 * This endpoint (/api/ops/bug-reports) is the ONLY path the outbound automation may call.
 *
 * The existing admin bug-report routes (/api/app/admin/bug-reports) return raw content and the
 * reporter's email, and sit behind Supabase admin auth. They must NEVER be used by this flow.
 * Do not point the outbound automation at the admin route under any circumstances.
 */

import { redactBugReport, resourceIdSchema } from "@zoption/shared";
import { Hono } from "hono";

import type { BugReportEgressAuditRepository } from "../db/bug-report-egress-audit";
import type { BugReportEgressCandidate, BugReportRepository } from "../db/bug-reports";
import { HttpError } from "../errors";
import { parseInput } from "../request";
import type { AppEnvironment, Bindings } from "../types";

const EGRESS_FIELDS = ["title", "actualBehavior", "expectedBehavior", "stepsToReproduce"] as const;
const EGRESS_READ_LIMIT = 100;
const LIMIT_PATTERN = /^\d+$/;

const DUMMY_SECRET = "ops_egress_dummy_constant_time_comparison_secret_token";

async function constantTimeCompare(provided: string, expected: string): Promise<boolean> {
  const encoder = new TextEncoder();
  const [hashProvided, hashExpected] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(provided)),
    crypto.subtle.digest("SHA-256", encoder.encode(expected)),
  ]);
  const viewProvided = new Uint8Array(hashProvided);
  const viewExpected = new Uint8Array(hashExpected);
  let mismatch = 0;
  for (let i = 0; i < 32; i++) {
    mismatch |= viewProvided[i]! ^ viewExpected[i]!;
  }
  return mismatch === 0;
}

interface CleanEgressReport {
  id: string;
  createdAt: string;
  text: string;
  fields: string[];
  redactedClasses: string[];
}

interface BlockedEgressReport {
  id: string;
  createdAt: string;
  detectorHits: string[];
}

// Exactly one side of a crossing is ever populated, so a caller reads the outcome from which
// list the report appears in rather than from a separate status field.
interface EgressCrossing {
  clean: CleanEgressReport | null;
  blocked: BlockedEgressReport | null;
}

function toResponseBody(crossings: EgressCrossing[]) {
  const reports = crossings.flatMap((crossing) => (crossing.clean ? [crossing.clean] : []));
  const blocked = crossings.flatMap((crossing) => (crossing.blocked ? [crossing.blocked] : []));
  return { reports, blocked, counts: { clean: reports.length, blocked: blocked.length } };
}

export function createBugReportEgressRoutes(
  bugReports: BugReportRepository,
  egressAudit: BugReportEgressAuditRepository,
  redact: typeof redactBugReport = redactBugReport,
) {
  const routes = new Hono<AppEnvironment>();

  // Redact one report, record the outcome, and return the entry the caller may see. A redaction
  // error is a block, never a crash and never a pass.
  async function crossReport(
    env: Bindings,
    report: BugReportEgressCandidate,
  ): Promise<EgressCrossing> {
    try {
      const outcome = redact({
        title: report.title,
        actualBehavior: report.actualBehavior,
        expectedBehavior: report.expectedBehavior,
        stepsToReproduce: report.stepsToReproduce,
      });

      if (outcome.status === "clean" && typeof outcome.text === "string") {
        await egressAudit.record(env, {
          bugReportId: report.id,
          outcome: "clean",
          fieldsSent: EGRESS_FIELDS,
          redactedClasses: outcome.redacted,
          detectorHits: outcome.detectorHits,
        });

        return {
          clean: {
            id: report.id,
            createdAt: report.createdAt,
            text: outcome.text,
            fields: [...EGRESS_FIELDS],
            redactedClasses: outcome.redacted,
          },
          blocked: null,
        };
      }

      const hits =
        outcome.detectorHits && outcome.detectorHits.length > 0
          ? outcome.detectorHits
          : ["blocked"];

      await egressAudit.record(env, {
        bugReportId: report.id,
        outcome: "blocked",
        fieldsSent: [],
        redactedClasses: outcome.redacted ?? [],
        detectorHits: hits,
      });

      return {
        clean: null,
        blocked: { id: report.id, createdAt: report.createdAt, detectorHits: hits },
      };
    } catch {
      const hits = ["error"];
      try {
        await egressAudit.record(env, {
          bugReportId: report.id,
          outcome: "blocked",
          fieldsSent: [],
          redactedClasses: [],
          detectorHits: hits,
        });
      } catch {
        // Prevent audit recording failure from crashing the endpoint
      }

      return {
        clean: null,
        blocked: { id: report.id, createdAt: report.createdAt, detectorHits: hits },
      };
    }
  }

  routes.use("*", async (context, next) => {
    context.header("Cache-Control", "no-store");
    await next();
  });

  routes.get("/", async (context) => {
    const authorization = context.req.header("Authorization");
    const match = authorization?.match(/^Bearer\s+(\S+)$/i);
    const providedToken = match?.[1];
    const expectedToken = context.env?.OPS_EGRESS_TOKEN?.trim();

    // Constant-time comparison on hashes to prevent timing side-channels and avoid leaking token presence or length
    const matches = await constantTimeCompare(
      providedToken || DUMMY_SECRET,
      expectedToken || DUMMY_SECRET,
    );

    if (!providedToken || !expectedToken || !matches) {
      context.header("WWW-Authenticate", 'Bearer realm="ops-egress"');
      return context.json({ error: "unauthorized" }, 401);
    }

    // Single report mode exists because the caller claims a report through the list, then a
    // later step needs that same report by id. It re-runs redaction, so raw text still never
    // leaves, and the response keeps the list shape with exactly one entry on one side.
    const requestedId = context.req.query("id");
    if (requestedId !== undefined) {
      const input = parseInput(resourceIdSchema, requestedId, "Use a valid report identifier.");

      const report = await bugReports.findForEgress(context.env, input);
      if (!report) {
        return context.json({ error: "not_found" }, 404);
      }

      return context.json(toResponseBody([await crossReport(context.env, report)]));
    }

    // The list claims every report it returns, so a caller that cannot handle them all in one go
    // asks for fewer. Whatever it does not ask for stays unclaimed for the next poll.
    const requestedLimit = context.req.query("limit");
    let readLimit = EGRESS_READ_LIMIT;
    if (requestedLimit !== undefined) {
      const parsedLimit = LIMIT_PATTERN.test(requestedLimit) ? Number(requestedLimit) : Number.NaN;
      if (!Number.isInteger(parsedLimit) || parsedLimit < 1 || parsedLimit > EGRESS_READ_LIMIT) {
        throw new HttpError(
          400,
          "invalid_request",
          `Use a limit between 1 and ${EGRESS_READ_LIMIT}.`,
        );
      }
      readLimit = parsedLimit;
    }

    const candidateReports = await bugReports.listForEgress(context.env, readLimit);

    const crossings: EgressCrossing[] = [];
    for (const report of candidateReports) {
      crossings.push(await crossReport(context.env, report));
    }

    return context.json(toResponseBody(crossings));
  });

  return routes;
}
