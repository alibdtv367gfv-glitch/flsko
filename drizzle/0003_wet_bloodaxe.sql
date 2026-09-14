CREATE TABLE `user_profiles` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`displayName` varchar(120),
	`gender` enum('male','female','unspecified') NOT NULL DEFAULT 'unspecified',
	`avatarUrl` text,
	`about` text,
	`governorate` varchar(80),
	`chatBackground` varchar(16) NOT NULL DEFAULT '#F4F8F7',
	`voiceGender` enum('male','female') NOT NULL DEFAULT 'female',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `user_profiles_id` PRIMARY KEY(`id`),
	CONSTRAINT `user_profiles_userId_unique` UNIQUE(`userId`)
);
