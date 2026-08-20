-- CreateEnum
CREATE TYPE "ShadowPaperRunStatus" AS ENUM ('STARTED', 'PREFLIGHT_BLOCKED', 'GATE_BLOCKED', 'DRY_RUN', 'SUBMITTED', 'RECONCILED', 'FAILED');

-- CreateEnum
CREATE TYPE "ShadowPaperOrderPurpose" AS ENUM ('PROBE_CANCEL', 'PROBE_FILL', 'FLATTEN');

-- CreateTable
CREATE TABLE "ShadowPaperRun" (
    "id" TEXT NOT NULL,
    "bookId" TEXT NOT NULL,
    "strategyVersion" TEXT NOT NULL,
    "asOf" TIMESTAMP(3) NOT NULL,
    "adapter" "BrokerKind" NOT NULL,
    "accountFingerprint" TEXT NOT NULL,
    "preflight" JSONB NOT NULL,
    "status" "ShadowPaperRunStatus" NOT NULL DEFAULT 'STARTED',
    "requestedNotional" DECIMAL(18,4) NOT NULL,
    "evidence" JSONB NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "ShadowPaperRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShadowPaperOrder" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "decisionId" TEXT,
    "clientOrderId" TEXT NOT NULL,
    "brokerRef" TEXT,
    "symbol" TEXT NOT NULL,
    "side" "OrderSide" NOT NULL,
    "qty" DECIMAL(18,6) NOT NULL,
    "filledQty" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "avgFillPrice" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "status" "OrderStatus" NOT NULL DEFAULT 'NEW',
    "purpose" "ShadowPaperOrderPurpose" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShadowPaperOrder_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ShadowPaperRun_bookId_strategyVersion_asOf_adapter_key" ON "ShadowPaperRun"("bookId", "strategyVersion", "asOf", "adapter");

-- CreateIndex
CREATE UNIQUE INDEX "ShadowPaperOrder_clientOrderId_key" ON "ShadowPaperOrder"("clientOrderId");

-- CreateIndex
CREATE INDEX "ShadowPaperOrder_runId_idx" ON "ShadowPaperOrder"("runId");

-- AddForeignKey
ALTER TABLE "ShadowPaperOrder" ADD CONSTRAINT "ShadowPaperOrder_runId_fkey" FOREIGN KEY ("runId") REFERENCES "ShadowPaperRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
