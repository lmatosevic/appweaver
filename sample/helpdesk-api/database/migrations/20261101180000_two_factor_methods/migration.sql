-- AlterTable
ALTER TABLE `User` DROP COLUMN `twoFactorAuth`,
    ADD COLUMN `phoneNumber` VARCHAR(16) NULL,
    ADD COLUMN `verifiedPhone` BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE `TwoFactorMethod` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `type` ENUM('email', 'sms', 'totp') NOT NULL,
    `priority` INTEGER NOT NULL DEFAULT 0,
    `secret` VARCHAR(191) NULL,
    `confirmedAt` DATETIME(3) NULL,
    `lastUsedStep` INTEGER NULL,
    `userId` INTEGER NOT NULL,
    `updatedAt` DATETIME(3) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `TwoFactorMethod_userId_type_key`(`userId`, `type`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `TwoFactorMethod` ADD CONSTRAINT `TwoFactorMethod_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

