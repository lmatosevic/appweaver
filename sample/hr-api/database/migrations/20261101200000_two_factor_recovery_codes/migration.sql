-- CreateTable
CREATE TABLE "TwoFactorRecoveryCode" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "codeHash" TEXT NOT NULL,
    "usedAt" DATETIME,
    "employeeId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" DATETIME,
    "deletedById" TEXT,
    CONSTRAINT "TwoFactorRecoveryCode_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TwoFactorRecoveryCode_deletedById_fkey" FOREIGN KEY ("deletedById") REFERENCES "Employee" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "TwoFactorRecoveryCode_codeHash_key" ON "TwoFactorRecoveryCode"("codeHash");

-- CreateIndex
CREATE INDEX "TwoFactorRecoveryCode_employeeId_idx" ON "TwoFactorRecoveryCode"("employeeId");

-- CreateIndex
CREATE INDEX "TwoFactorRecoveryCode_deletedById_idx" ON "TwoFactorRecoveryCode"("deletedById");

