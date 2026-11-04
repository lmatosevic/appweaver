-- CreateTable
CREATE TABLE `TeamSeries` (
    `resourceId` INTEGER NOT NULL,
    `time` DATETIME(3) NOT NULL,
    `open` INTEGER NULL,
    `unassigned` INTEGER NULL,
    `overdue` INTEGER NULL,
    `firstResponseMinutes` DOUBLE NULL,
    `breached` BOOLEAN NULL,

    PRIMARY KEY (`resourceId`, `time`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `TeamSeries` ADD CONSTRAINT `TeamSeries_resourceId_fkey` FOREIGN KEY (`resourceId`) REFERENCES `Team`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
