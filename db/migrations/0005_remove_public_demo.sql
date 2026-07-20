DELETE FROM `import_previews` WHERE `tenant_id` = 'demo';
--> statement-breakpoint
DELETE FROM `imports` WHERE `tenant_id` = 'demo';
--> statement-breakpoint
DELETE FROM `budgets` WHERE `tenant_id` = 'demo';
--> statement-breakpoint
DELETE FROM `transactions` WHERE `tenant_id` = 'demo';
--> statement-breakpoint
DELETE FROM `accounts` WHERE `tenant_id` = 'demo';
--> statement-breakpoint
DELETE FROM `categories` WHERE `tenant_id` = 'demo';
--> statement-breakpoint
DELETE FROM `user_tenants` WHERE `tenant_id` = 'demo';
--> statement-breakpoint
DELETE FROM `tenants` WHERE `id` = 'demo' AND `kind` = 'demo';
