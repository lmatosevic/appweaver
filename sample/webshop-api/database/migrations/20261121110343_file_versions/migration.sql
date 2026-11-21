-- AlterTable
ALTER TABLE "File" ADD COLUMN     "lineageId" VARCHAR(36),
ADD COLUMN     "supersededAt" TIMESTAMP(3),
ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 1;

-- CreateIndex
CREATE INDEX "File_lineageId_idx" ON "File"("lineageId");

