CREATE TABLE `guild_settings` (
	`application_id` text NOT NULL,
	`guild_id` text NOT NULL,
	`enabled_modules` text DEFAULT '[]' NOT NULL,
	`owned_command_keys` text DEFAULT '[]' NOT NULL,
	`updated_at` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`application_id`, `guild_id`)
);
