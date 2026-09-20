-- Outbound egress audit log for bug reports. Redaction is an all-or-nothing binary
-- gate: either the report is verified clean and safe to leave Zoption ('clean'), or
-- sensitive data was detected and egress was halted ('blocked'). Only those two outcomes
-- ever exist. To keep the audit trail durable without leaking sensitive data, this table
-- stores only redaction metadata (field names, detected classes, and hits) and never the
-- user-authored content itself.
CREATE TABLE `bug_report_egress_audit` (
	`id` text PRIMARY KEY NOT NULL,
	`bug_report_id` text NOT NULL,
	`outcome` text NOT NULL CHECK (`outcome` IN ('clean', 'blocked')),
	`fields_sent` text NOT NULL,
	`redacted_classes` text NOT NULL,
	`detector_hits` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `bug_report_egress_audit_bug_report_created_idx` ON `bug_report_egress_audit` (`bug_report_id`, `created_at` DESC);
