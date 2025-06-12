CREATE TABLE `cache` (
	`id` text PRIMARY KEY NOT NULL,
	`type` text NOT NULL,
	`name` text NOT NULL,
	`hash` text NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`updated_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `cache_type_name_unique` ON `cache` (`type`,`name`);--> statement-breakpoint
CREATE TABLE `projects` (
	`id` text PRIMARY KEY NOT NULL,
	`identifier` text NOT NULL,
	`order` integer NOT NULL,
	`branch` text NOT NULL,
	`season` integer NOT NULL,
	`date` text NOT NULL,
	`creator` text,
	`link` text NOT NULL,
	`description` text NOT NULL,
	`screenshot` text,
	`creator_lower` text,
	`link_lower` text NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`updated_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `projects_identifier_unique` ON `projects` (`identifier`);--> statement-breakpoint
CREATE INDEX `creator_lower_idx_for_search` ON `projects` (`creator_lower`);--> statement-breakpoint
CREATE INDEX `link_lower_idx_for_search` ON `projects` (`link_lower`);--> statement-breakpoint
CREATE TABLE `subscribers` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`deleted_at` text
);
