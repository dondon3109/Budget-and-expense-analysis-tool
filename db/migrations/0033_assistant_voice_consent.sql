ALTER TABLE `assistant_preferences` ADD `voice_consented_at` text;--> statement-breakpoint
ALTER TABLE `assistant_preferences` ADD `voice_consent_version` integer NOT NULL DEFAULT 0;
