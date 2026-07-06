/*
  Warnings:

  - You are about to alter the column `shares` on the `PortfolioItem` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(18,6)`.
  - You are about to alter the column `balance` on the `SavingsJar` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(18,4)`.
  - You are about to alter the column `amount` on the `Transaction` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(18,4)`.

*/
-- AlterTable
ALTER TABLE "PortfolioItem" ALTER COLUMN "shares" SET DATA TYPE DECIMAL(18,6);

-- AlterTable
ALTER TABLE "SavingsJar" ALTER COLUMN "balance" SET DATA TYPE DECIMAL(18,4);

-- AlterTable
ALTER TABLE "Transaction" ALTER COLUMN "amount" SET DATA TYPE DECIMAL(18,4);

-- CreateIndex
CREATE INDEX "QuizAttempt_userId_createdAt_idx" ON "QuizAttempt"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "Transaction_userId_createdAt_idx" ON "Transaction"("userId", "createdAt");
