CREATE TABLE `jumble_library_items` (
	`discord_user_id` text NOT NULL,
	`kind` text NOT NULL,
	`identity_key` text NOT NULL,
	`candidate` text NOT NULL,
	`rank` integer NOT NULL,
	`refresh_version` text NOT NULL,
	`synced_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `jumble_library_items_generation_identity_idx` ON `jumble_library_items` (`discord_user_id`,`kind`,`refresh_version`,`identity_key`);--> statement-breakpoint
CREATE INDEX `jumble_library_items_generation_rank_idx` ON `jumble_library_items` (`discord_user_id`,`kind`,`refresh_version`,`rank`);--> statement-breakpoint
CREATE TABLE `jumble_library_metadata` (
	`discord_user_id` text NOT NULL,
	`kind` text NOT NULL,
	`canonical_username` text NOT NULL,
	`identity_key` text NOT NULL,
	`candidate` text NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `jumble_library_metadata_identity_idx` ON `jumble_library_metadata` (`discord_user_id`,`kind`,`canonical_username`,`identity_key`);--> statement-breakpoint
CREATE TABLE `jumble_library_sync` (
	`discord_user_id` text NOT NULL,
	`kind` text NOT NULL,
	`canonical_username` text NOT NULL,
	`refreshed_at` integer,
	`refresh_after` integer NOT NULL,
	`active_refresh_version` text,
	`lease_owner` text,
	`lease_expires_at` integer,
	`failure_count` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `jumble_library_sync_user_kind_idx` ON `jumble_library_sync` (`discord_user_id`,`kind`);--> statement-breakpoint
CREATE INDEX `jumble_library_sync_refresh_idx` ON `jumble_library_sync` (`refresh_after`);