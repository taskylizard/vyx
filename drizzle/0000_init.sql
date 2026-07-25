CREATE TABLE `jumble_answers` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`session_id` text NOT NULL,
	`discord_user_id` text NOT NULL,
	`raw_answer` text NOT NULL,
	`normalized_answer` text NOT NULL,
	`correct` integer NOT NULL,
	`answered_at` integer NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `jumble_sessions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `jumble_answers_session_idx` ON `jumble_answers` (`session_id`,`answered_at`);--> statement-breakpoint
CREATE TABLE `jumble_hints` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`session_id` text NOT NULL,
	`kind` text NOT NULL,
	`content` text NOT NULL,
	`shown` integer DEFAULT false NOT NULL,
	`hint_order` integer,
	FOREIGN KEY (`session_id`) REFERENCES `jumble_sessions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `jumble_hints_session_idx` ON `jumble_hints` (`session_id`,`hint_order`);--> statement-breakpoint
CREATE TABLE `jumble_profiles` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`discord_user_id` text NOT NULL,
	`lastfm_username` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `jumble_profiles_discord_user_idx` ON `jumble_profiles` (`discord_user_id`);--> statement-breakpoint
CREATE TABLE `jumble_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`starter_user_id` text NOT NULL,
	`guild_id` text,
	`channel_id` text NOT NULL,
	`message_id` text,
	`kind` text NOT NULL,
	`source_username` text NOT NULL,
	`answer` text NOT NULL,
	`artist_name` text,
	`album_name` text,
	`image_url` text,
	`metadata` text NOT NULL,
	`started_at` integer NOT NULL,
	`ended_at` integer,
	`outcome` text,
	`blur_stage` integer DEFAULT 0 NOT NULL,
	`reshuffle_count` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE INDEX `jumble_sessions_channel_active_idx` ON `jumble_sessions` (`channel_id`,`ended_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `jumble_sessions_one_active_channel_idx` ON `jumble_sessions` (`channel_id`) WHERE "jumble_sessions"."ended_at" IS NULL;--> statement-breakpoint
CREATE INDEX `jumble_sessions_user_kind_idx` ON `jumble_sessions` (`starter_user_id`,`kind`,`started_at`);