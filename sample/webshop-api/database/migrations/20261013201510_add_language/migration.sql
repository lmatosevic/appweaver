-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "language" VARCHAR(8) NOT NULL DEFAULT 'en';

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "language" VARCHAR(8) NOT NULL DEFAULT 'en';

-- CreateTable
CREATE TABLE "_ApiKeyRolesRole" (
    "A" INTEGER NOT NULL,
    "B" INTEGER NOT NULL,

    CONSTRAINT "_ApiKeyRolesRole_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateTable
CREATE TABLE "_ApiKeyPermissionsPermission" (
    "A" INTEGER NOT NULL,
    "B" INTEGER NOT NULL,

    CONSTRAINT "_ApiKeyPermissionsPermission_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE INDEX "_ApiKeyRolesRole_B_index" ON "_ApiKeyRolesRole"("B");

-- CreateIndex
CREATE INDEX "_ApiKeyPermissionsPermission_B_index" ON "_ApiKeyPermissionsPermission"("B");

-- AddForeignKey
ALTER TABLE "_ApiKeyRolesRole" ADD CONSTRAINT "_ApiKeyRolesRole_A_fkey" FOREIGN KEY ("A") REFERENCES "ApiKey"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ApiKeyRolesRole" ADD CONSTRAINT "_ApiKeyRolesRole_B_fkey" FOREIGN KEY ("B") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ApiKeyPermissionsPermission" ADD CONSTRAINT "_ApiKeyPermissionsPermission_A_fkey" FOREIGN KEY ("A") REFERENCES "ApiKey"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ApiKeyPermissionsPermission" ADD CONSTRAINT "_ApiKeyPermissionsPermission_B_fkey" FOREIGN KEY ("B") REFERENCES "Permission"("id") ON DELETE CASCADE ON UPDATE CASCADE;
