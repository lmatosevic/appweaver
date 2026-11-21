-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_File" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "checksum" TEXT NOT NULL,
    "title" TEXT,
    "description" TEXT,
    "resourceField" TEXT,
    "resourceName" TEXT,
    "resourceId" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "lineageId" TEXT,
    "supersededAt" DATETIME,
    "updatedAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" INTEGER,
    "deletedAt" DATETIME,
    "deletedById" INTEGER,
    CONSTRAINT "File_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "File_deletedById_fkey" FOREIGN KEY ("deletedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_File" ("checksum", "createdAt", "createdById", "deletedAt", "deletedById", "description", "id", "mimeType", "name", "originalName", "resourceField", "resourceId", "resourceName", "sizeBytes", "title", "updatedAt") SELECT "checksum", "createdAt", "createdById", "deletedAt", "deletedById", "description", "id", "mimeType", "name", "originalName", "resourceField", "resourceId", "resourceName", "sizeBytes", "title", "updatedAt" FROM "File";
DROP TABLE "File";
ALTER TABLE "new_File" RENAME TO "File";
CREATE UNIQUE INDEX "File_name_key" ON "File"("name");
CREATE INDEX "File_resourceName_resourceId_resourceField_idx" ON "File"("resourceName", "resourceId", "resourceField");
CREATE INDEX "File_lineageId_idx" ON "File"("lineageId");
CREATE INDEX "File_createdById_idx" ON "File"("createdById");
CREATE INDEX "File_deletedById_idx" ON "File"("deletedById");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
