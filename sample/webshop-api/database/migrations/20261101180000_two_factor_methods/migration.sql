-- CreateEnum
CREATE TYPE "TwoFactorMethodType" AS ENUM ('email', 'sms', 'totp');

-- AlterTable
ALTER TABLE "User" DROP COLUMN "twoFactorAuth",
ADD COLUMN     "phoneNumber" VARCHAR(16),
ADD COLUMN     "verifiedPhone" BOOLEAN NOT NULL DEFAULT false;

-- DropEnum
DROP TYPE "UserTwoFactorAuth";

-- CreateTable
CREATE TABLE "TwoFactorMethod" (
    "id" SERIAL NOT NULL,
    "type" "TwoFactorMethodType" NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "secret" TEXT,
    "confirmedAt" TIMESTAMP(3),
    "lastUsedStep" INTEGER,
    "userId" INTEGER NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TwoFactorMethod_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TwoFactorMethod_userId_type_key" ON "TwoFactorMethod"("userId", "type");

-- AddForeignKey
ALTER TABLE "TwoFactorMethod" ADD CONSTRAINT "TwoFactorMethod_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

