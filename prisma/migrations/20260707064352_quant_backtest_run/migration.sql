-- CreateTable
CREATE TABLE "BacktestRun" (
    "id" TEXT NOT NULL,
    "strategyId" TEXT,
    "symbol" TEXT NOT NULL,
    "market" "Market" NOT NULL,
    "fromDate" TIMESTAMP(3) NOT NULL,
    "toDate" TIMESTAMP(3) NOT NULL,
    "oosFraction" DECIMAL(4,3) NOT NULL,
    "metrics" JSONB NOT NULL,
    "implausible" BOOLEAN NOT NULL DEFAULT false,
    "pmSurrogateId" TEXT NOT NULL,
    "seed" INTEGER NOT NULL,
    "gitSha" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BacktestRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BacktestRun_strategyId_createdAt_idx" ON "BacktestRun"("strategyId", "createdAt");
