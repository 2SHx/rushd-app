-- AlterTable
ALTER TABLE "PortfolioItem" ADD COLUMN     "costBasis" DECIMAL(18,4);

-- AlterTable
ALTER TABLE "PortfolioSnapshot" ADD COLUMN     "benchmarkNavSpus" DECIMAL(18,4) NOT NULL DEFAULT 100.0,
ADD COLUMN     "benchmarkNavSpy" DECIMAL(18,4) NOT NULL DEFAULT 100.0;

-- CreateTable
CREATE TABLE "PurificationEntry" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "amount" DECIMAL(18,4) NOT NULL,
    "ratio" DECIMAL(6,4) NOT NULL,
    "profit" DECIMAL(18,4) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PurificationEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PurificationEntry_userId_createdAt_idx" ON "PurificationEntry"("userId" ASC, "createdAt" ASC);

-- AddForeignKey
ALTER TABLE "PurificationEntry" ADD CONSTRAINT "PurificationEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

