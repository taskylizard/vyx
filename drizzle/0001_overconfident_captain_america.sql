CREATE TABLE `jumble_metadata_cache` (
	`cache_key` text PRIMARY KEY NOT NULL,
	`payload` text NOT NULL,
	`fetched_at` integer NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `jumble_metadata_cache_expiry_idx` ON `jumble_metadata_cache` (`expires_at`,`fetched_at`);