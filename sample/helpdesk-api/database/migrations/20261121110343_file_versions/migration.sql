-- AlterTable
ALTER TABLE `File` ADD COLUMN `lineageId` VARCHAR(36) NULL,
    ADD COLUMN `supersededAt` DATETIME(3) NULL,
    ADD COLUMN `version` INTEGER NOT NULL DEFAULT 1;

-- CreateIndex
CREATE INDEX `File_lineageId_idx` ON `File`(`lineageId`);

