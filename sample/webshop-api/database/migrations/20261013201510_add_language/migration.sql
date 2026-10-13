-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "language" VARCHAR(8) NOT NULL DEFAULT 'en';

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "language" VARCHAR(8) NOT NULL DEFAULT 'en';
