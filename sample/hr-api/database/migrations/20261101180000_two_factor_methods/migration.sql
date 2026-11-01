-- CreateTable
CREATE TABLE "TwoFactorMethod" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "type" TEXT NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "secret" TEXT,
    "confirmedAt" DATETIME,
    "lastUsedStep" INTEGER,
    "employeeId" TEXT NOT NULL,
    "updatedAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" DATETIME,
    "deletedById" TEXT,
    CONSTRAINT "TwoFactorMethod_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TwoFactorMethod_deletedById_fkey" FOREIGN KEY ("deletedById") REFERENCES "Employee" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Employee" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "employeeNumber" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "employmentType" TEXT NOT NULL DEFAULT 'FullTime',
    "status" TEXT NOT NULL DEFAULT 'Active',
    "hireDate" DATETIME NOT NULL,
    "terminatedAt" DATETIME,
    "passwordHash" TEXT,
    "verifiedEmail" BOOLEAN NOT NULL DEFAULT false,
    "phoneNumber" TEXT,
    "verifiedPhone" BOOLEAN NOT NULL DEFAULT false,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "logoutAt" DATETIME,
    "departmentId" INTEGER,
    "positionId" INTEGER,
    "managerId" TEXT,
    "avatarId" INTEGER,
    "updatedAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT,
    "deletedAt" DATETIME,
    "deletedById" TEXT,
    CONSTRAINT "Employee_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Employee_positionId_fkey" FOREIGN KEY ("positionId") REFERENCES "Position" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Employee_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "Employee" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Employee_avatarId_fkey" FOREIGN KEY ("avatarId") REFERENCES "File" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Employee_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "Employee" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Employee_deletedById_fkey" FOREIGN KEY ("deletedById") REFERENCES "Employee" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Employee" ("avatarId", "createdAt", "createdById", "deletedAt", "deletedById", "departmentId", "email", "employeeNumber", "employmentType", "enabled", "firstName", "hireDate", "id", "lastName", "logoutAt", "managerId", "passwordHash", "phone", "positionId", "status", "terminatedAt", "updatedAt", "verifiedEmail") SELECT "avatarId", "createdAt", "createdById", "deletedAt", "deletedById", "departmentId", "email", "employeeNumber", "employmentType", "enabled", "firstName", "hireDate", "id", "lastName", "logoutAt", "managerId", "passwordHash", "phone", "positionId", "status", "terminatedAt", "updatedAt", "verifiedEmail" FROM "Employee";
DROP TABLE "Employee";
ALTER TABLE "new_Employee" RENAME TO "Employee";
CREATE UNIQUE INDEX "Employee_employeeNumber_key" ON "Employee"("employeeNumber");
CREATE UNIQUE INDEX "Employee_email_key" ON "Employee"("email");
CREATE UNIQUE INDEX "Employee_avatarId_key" ON "Employee"("avatarId");
CREATE INDEX "Employee_deletedAt_createdAt_id_idx" ON "Employee"("deletedAt", "createdAt" DESC, "id");
CREATE INDEX "Employee_lastName_firstName_idx" ON "Employee"("lastName", "firstName");
CREATE INDEX "Employee_departmentId_idx" ON "Employee"("departmentId");
CREATE INDEX "Employee_positionId_idx" ON "Employee"("positionId");
CREATE INDEX "Employee_managerId_idx" ON "Employee"("managerId");
CREATE INDEX "Employee_createdById_idx" ON "Employee"("createdById");
CREATE INDEX "Employee_deletedById_idx" ON "Employee"("deletedById");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "TwoFactorMethod_deletedById_idx" ON "TwoFactorMethod"("deletedById");

-- CreateIndex
CREATE UNIQUE INDEX "TwoFactorMethod_employeeId_type_key" ON "TwoFactorMethod"("employeeId", "type");

