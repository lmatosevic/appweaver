-- CreateTable
CREATE TABLE `_ApiKeyRolesRole` (
    `A` INTEGER NOT NULL,
    `B` INTEGER NOT NULL,

    UNIQUE INDEX `_ApiKeyRolesRole_AB_unique`(`A`, `B`),
    INDEX `_ApiKeyRolesRole_B_index`(`B`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `_ApiKeyPermissionsPermission` (
    `A` INTEGER NOT NULL,
    `B` INTEGER NOT NULL,

    UNIQUE INDEX `_ApiKeyPermissionsPermission_AB_unique`(`A`, `B`),
    INDEX `_ApiKeyPermissionsPermission_B_index`(`B`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `_ApiKeyRolesRole` ADD CONSTRAINT `_ApiKeyRolesRole_A_fkey` FOREIGN KEY (`A`) REFERENCES `ApiKey`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `_ApiKeyRolesRole` ADD CONSTRAINT `_ApiKeyRolesRole_B_fkey` FOREIGN KEY (`B`) REFERENCES `Role`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `_ApiKeyPermissionsPermission` ADD CONSTRAINT `_ApiKeyPermissionsPermission_A_fkey` FOREIGN KEY (`A`) REFERENCES `ApiKey`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `_ApiKeyPermissionsPermission` ADD CONSTRAINT `_ApiKeyPermissionsPermission_B_fkey` FOREIGN KEY (`B`) REFERENCES `Permission`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
