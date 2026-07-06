-- AlterEnum
ALTER TYPE "TransactionType" ADD VALUE 'PROFIT_SHARE';

-- AlterTable
ALTER TABLE "SavingsJar" ADD COLUMN     "profitShareRatioBps" INTEGER NOT NULL DEFAULT 7000;
