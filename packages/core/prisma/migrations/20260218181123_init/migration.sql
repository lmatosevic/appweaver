-- CreateTable
CREATE TABLE "File" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "title" TEXT,
    "description" TEXT,
    "resourceField" TEXT,
    "resourceName" TEXT,
    "resourceId" INTEGER,
    "updatedAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" INTEGER,
    CONSTRAINT "File_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "Identity" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Role" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "updatedAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" INTEGER,
    CONSTRAINT "Role_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "Identity" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Permission" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "updatedAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" INTEGER,
    CONSTRAINT "Permission_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "Identity" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Identity" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "username" TEXT NOT NULL,
    "passwordHash" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "logoutAt" DATETIME,
    "updatedAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" INTEGER,
    CONSTRAINT "Identity_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "Identity" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "_RolePermissionsPermission" (
    "A" INTEGER NOT NULL,
    "B" INTEGER NOT NULL,
    CONSTRAINT "_RolePermissionsPermission_A_fkey" FOREIGN KEY ("A") REFERENCES "Permission" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "_RolePermissionsPermission_B_fkey" FOREIGN KEY ("B") REFERENCES "Role" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "_IdentityRolesRole" (
    "A" INTEGER NOT NULL,
    "B" INTEGER NOT NULL,
    CONSTRAINT "_IdentityRolesRole_A_fkey" FOREIGN KEY ("A") REFERENCES "Identity" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "_IdentityRolesRole_B_fkey" FOREIGN KEY ("B") REFERENCES "Role" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "File_name_key" ON "File"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Role_name_key" ON "Role"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Permission_name_key" ON "Permission"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Identity_username_key" ON "Identity"("username");

-- CreateIndex
CREATE UNIQUE INDEX "_RolePermissionsPermission_AB_unique" ON "_RolePermissionsPermission"("A", "B");

-- CreateIndex
CREATE INDEX "_RolePermissionsPermission_B_index" ON "_RolePermissionsPermission"("B");

-- CreateIndex
CREATE UNIQUE INDEX "_IdentityRolesRole_AB_unique" ON "_IdentityRolesRole"("A", "B");

-- CreateIndex
CREATE INDEX "_IdentityRolesRole_B_index" ON "_IdentityRolesRole"("B");
