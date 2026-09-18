-- Single-use, short-lived credentials for the assistant voice WebSocket. A browser cannot set an
-- Authorization header on a WebSocket handshake, so the stream carries a ticket in the query string
-- instead of the Supabase access token: the ticket is redeemable once, expires in 60 seconds, and is
-- useless against any other route. Rows are deleted on redemption and swept opportunistically at mint.
CREATE TABLE `assistant_voice_tickets` (
	`ticket` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`created_at` text NOT NULL,
	`expires_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `assistant_voice_tickets_expires_at_idx` ON `assistant_voice_tickets` (`expires_at`);
