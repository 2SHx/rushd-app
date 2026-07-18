-- CreateTable
CREATE TABLE "AllocationDecision" (
    "id" TEXT NOT NULL,
    "asOf" TIMESTAMP(3) NOT NULL,
    "windowDays" INTEGER NOT NULL DEFAULT 63,
    "seed" INTEGER NOT NULL,
    "gitSha" TEXT,
    "inputs" JSONB NOT NULL,
    "scores" JSONB NOT NULL,
    "allocations" JSONB NOT NULL,
    "benched" TEXT[],
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AllocationDecision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BookEvaluation" (
    "id" TEXT NOT NULL,
    "bookId" TEXT NOT NULL,
    "asOf" TIMESTAMP(3) NOT NULL,
    "nav" DECIMAL(18,4) NOT NULL,
    "dailyPnl" DECIMAL(18,4) NOT NULL,
    "drawdown" DECIMAL(8,6) NOT NULL,
    "trackingError" DECIMAL(8,6) NOT NULL,
    "benchFlags" TEXT[],
    "benched" BOOLEAN NOT NULL DEFAULT false,
    "requiresRevalidation" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BookEvaluation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AllocationDecision_asOf_key" ON "AllocationDecision"("asOf");

-- CreateIndex
CREATE INDEX "BookEvaluation_bookId_asOf_idx" ON "BookEvaluation"("bookId", "asOf");

-- CreateIndex
CREATE UNIQUE INDEX "BookEvaluation_bookId_asOf_key" ON "BookEvaluation"("bookId", "asOf");
