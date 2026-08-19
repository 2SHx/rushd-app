/*
  Warnings:

  - A unique constraint covering the columns `[symbol,market,asOf,period]` on the table `Fundamentals` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "FundamentalsPeriod" AS ENUM ('ANNUAL', 'QUARTERLY');

-- DropIndex
DROP INDEX "Fundamentals_symbol_market_asOf_key";

-- AlterTable
ALTER TABLE "Fundamentals" ADD COLUMN     "period" "FundamentalsPeriod" NOT NULL DEFAULT 'ANNUAL';

-- CreateIndex
CREATE UNIQUE INDEX "Fundamentals_symbol_market_asOf_period_key" ON "Fundamentals"("symbol", "market", "asOf", "period");
