CREATE TABLE `content_reports` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`targetType` enum('chat','image','video') NOT NULL,
	`targetId` varchar(128),
	`reason` text NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `content_reports_id` PRIMARY KEY(`id`)
);
