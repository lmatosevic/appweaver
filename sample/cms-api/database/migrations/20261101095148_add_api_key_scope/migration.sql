-- CreateTable
CREATE TABLE "_ApiKeyRolesRole" (
    "A" INTEGER NOT NULL,
    "B" INTEGER NOT NULL,
    CONSTRAINT "_ApiKeyRolesRole_A_fkey" FOREIGN KEY ("A") REFERENCES "ApiKey" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "_ApiKeyRolesRole_B_fkey" FOREIGN KEY ("B") REFERENCES "Role" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "_ApiKeyPermissionsPermission" (
    "A" INTEGER NOT NULL,
    "B" INTEGER NOT NULL,
    CONSTRAINT "_ApiKeyPermissionsPermission_A_fkey" FOREIGN KEY ("A") REFERENCES "ApiKey" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "_ApiKeyPermissionsPermission_B_fkey" FOREIGN KEY ("B") REFERENCES "Permission" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "_ApiKeyRolesRole_AB_unique" ON "_ApiKeyRolesRole"("A", "B");

-- CreateIndex
CREATE INDEX "_ApiKeyRolesRole_B_index" ON "_ApiKeyRolesRole"("B");

-- CreateIndex
CREATE UNIQUE INDEX "_ApiKeyPermissionsPermission_AB_unique" ON "_ApiKeyPermissionsPermission"("A", "B");

-- CreateIndex
CREATE INDEX "_ApiKeyPermissionsPermission_B_index" ON "_ApiKeyPermissionsPermission"("B");
