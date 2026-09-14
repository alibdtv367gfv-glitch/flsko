CREATE TABLE `music_generations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`prompt` text NOT NULL,
	`provider` varchar(128),
	`status` enum('queued','completed','failed') NOT NULL DEFAULT 'queued',
	`assetUrl` text,
	`errorMessage` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `music_generations_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `user_files` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`name` varchar(255) NOT NULL,
	`mimeType` varchar(160) NOT NULL,
	`kind` enum('image','video','document','audio','other') NOT NULL,
	`sizeBytes` int NOT NULL DEFAULT 0,
	`storageUrl` text NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `user_files_id` PRIMARY KEY(`id`)
);
