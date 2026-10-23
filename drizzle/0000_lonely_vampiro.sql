CREATE TABLE `room_members` (
	`room_id` text NOT NULL,
	`token_hash` text NOT NULL,
	`name` text NOT NULL,
	`game` text NOT NULL,
	PRIMARY KEY(`room_id`, `token_hash`),
	FOREIGN KEY (`room_id`) REFERENCES `rooms`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `rooms` (
	`id` text PRIMARY KEY NOT NULL,
	`case_id` text NOT NULL,
	`host_hash` text NOT NULL,
	`started` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL
);
