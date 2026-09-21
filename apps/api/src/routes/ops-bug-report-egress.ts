/**
 * BOUNDARY RULE:
 * This endpoint (/api/ops/bug-reports) is the ONLY path the outbound automation may call.
 *
 * The existing admin bug-report routes (/api/app/admin/bug-reports) return raw content and the
 * reporter's email, and sit behind Supabase admin auth. They must NEVER be used by this flow.
 * Do not point the outbound automation at the admin route under any circumstances.
 */

import { redactBugReport } from "@zoption/shared";
import { Hono } from "hono";

import type { BugReportEgressAuditRepository } from "../db/bug-report-egress-audit";
import type { BugReportRepository } from "../db/bug-reports";
import type { AppEnvironment } from "../types";

const EGRESS_FIELDS = ["title", "actualBehavior", "expectedBehavior", "stepsToReproduce"] as const;
const EGRESS_READ_LIMIT = 100;

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

export function createBugReportEgressRoutes(
  bugReports: BugReportRepository,
  egressAudit: BugReportEgressAuditRepository,
  redact: typeof redactBugReport = redactBugReport,
) {
  const routes = new Hono<AppEnvironment>();

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

    const candidateReports = await bugReports.listForEgress(context.env, EGRESS_READ_LIMIT);

    const cleanReports: Array<{
      id: string;
      createdAt: string;
      text: string;
      fields: string[];
      redactedClasses: string[];
    }> = [];

    const blockedReports: Array<{
      id: string;
      createdAt: string;
      detectorHits: string[];
    }> = [];

    for (const report of candidateReports) {
      try {
        const outcome = redact({
          title: report.title,
          actualBehavior: report.actualBehavior,
          expectedBehavior: report.expectedBehavior,
          stepsToReproduce: report.stepsToReproduce,
        });

        if (outcome.status === "clean" && typeof outcome.text === "string") {
          await egressAudit.record(context.env, {
            bugReportId: report.id,
            outcome: "clean",
            fieldsSent: EGRESS_FIELDS,
            redactedClasses: outcome.redacted,
            detectorHits: outcome.detectorHits,
          });

          cleanReports.push({
            id: report.id,
            createdAt: report.createdAt,
            text: outcome.text,
            fields: [...EGRESS_FIELDS],
            redactedClasses: outcome.redacted,
          });
        } else {
          const hits =
            outcome.detectorHits && outcome.detectorHits.length > 0
              ? outcome.detectorHits
              : ["blocked"];

          await egressAudit.record(context.env, {
            bugReportId: report.id,
            outcome: "blocked",
            fieldsSent: [],
            redactedClasses: outcome.redacted ?? [],
            detectorHits: hits,
          });

          blockedReports.push({
            id: report.id,
            createdAt: report.createdAt,
            detectorHits: hits,
          });
        }
      } catch {
        // Redaction error or exception is a block, not a crash and not a pass
        const hits = ["error"];
        try {
          await egressAudit.record(context.env, {
            bugReportId: report.id,
            outcome: "blocked",
            fieldsSent: [],
            redactedClasses: [],
            detectorHits: hits,
          });
        } catch {
          // Prevent audit recording failure from crashing the endpoint
        }

        blockedReports.push({
          id: report.id,
          createdAt: report.createdAt,
          detectorHits: hits,
        });
      }
    }

    return context.json({
      reports: cleanReports,
      blocked: blockedReports,
      counts: {
        clean: cleanReports.length,
        blocked: blockedReports.length,
      },
    });
  });

  return routes;
}
