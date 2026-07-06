-- CreateEnum
CREATE TYPE "AgentKind" AS ENUM ('QUANT_CORE', 'NEWS_CATALYST', 'TECHNICAL', 'PATTERN_ANALOG', 'SHARIA', 'FUNDAMENTAL', 'RESEARCH', 'PORTFOLIO_MANAGER');

-- CreateEnum
CREATE TYPE "Stance" AS ENUM ('BULLISH', 'BEARISH', 'NEUTRAL');

-- CreateEnum
CREATE TYPE "AutonomyTier" AS ENUM ('HUMAN_APPROVE', 'AUTO_PAPER', 'AUTO_REAL');

-- CreateEnum
CREATE TYPE "DecisionMode" AS ENUM ('HUMAN_APPROVE', 'AUTO_PAPER', 'AUTO_REAL');

-- CreateEnum
CREATE TYPE "DecisionStatus" AS ENUM ('PROPOSED', 'APPROVED', 'REJECTED', 'EXECUTED', 'VETOED');

-- CreateEnum
CREATE TYPE "OrderSide" AS ENUM ('BUY', 'SELL');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('NEW', 'PARTIAL', 'FILLED', 'CANCELLED', 'REJECTED');

-- CreateEnum
CREATE TYPE "BrokerKind" AS ENUM ('ALPACA_PAPER', 'INTERNAL_SIM');

-- CreateTable
CREATE TABLE "Strategy" (
    "id" TEXT NOT NULL,
    "ownerUserId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "market" "Market" NOT NULL,
    "config" JSONB NOT NULL,
    "autonomyTier" "AutonomyTier" NOT NULL DEFAULT 'HUMAN_APPROVE',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Strategy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Decision" (
    "id" TEXT NOT NULL,
    "strategyId" TEXT,
    "userId" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "market" "Market" NOT NULL,
    "asOf" TIMESTAMP(3) NOT NULL,
    "proposedAction" TEXT NOT NULL,
    "proposedQty" DECIMAL(18,6) NOT NULL,
    "finalAction" TEXT NOT NULL,
    "finalQty" DECIMAL(18,6) NOT NULL,
    "shariaGate" JSONB NOT NULL,
    "riskAdjustments" JSONB NOT NULL,
    "debateTranscript" JSONB NOT NULL,
    "pmModelId" TEXT,
    "temperature" DECIMAL(4,3) NOT NULL,
    "seed" INTEGER NOT NULL,
    "gitSha" TEXT,
    "mode" "DecisionMode" NOT NULL,
    "status" "DecisionStatus" NOT NULL DEFAULT 'PROPOSED',
    "costCents" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Decision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnalystSignalRecord" (
    "id" TEXT NOT NULL,
    "decisionId" TEXT NOT NULL,
    "agent" "AgentKind" NOT NULL,
    "symbol" TEXT NOT NULL,
    "stance" "Stance" NOT NULL,
    "conviction" DECIMAL(5,4) NOT NULL,
    "horizonDays" INTEGER NOT NULL,
    "rationaleEn" TEXT NOT NULL,
    "rationaleAr" TEXT NOT NULL,
    "evidence" JSONB NOT NULL,
    "determinism" TEXT NOT NULL,
    "modelId" TEXT,
    "failureMode" TEXT NOT NULL,
    "costCents" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "AnalystSignalRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Order" (
    "id" TEXT NOT NULL,
    "decisionId" TEXT NOT NULL,
    "brokerRef" TEXT,
    "symbol" TEXT NOT NULL,
    "market" "Market" NOT NULL,
    "side" "OrderSide" NOT NULL,
    "qty" DECIMAL(18,6) NOT NULL,
    "limitPrice" DECIMAL(18,6),
    "filledQty" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "avgFillPrice" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "status" "OrderStatus" NOT NULL DEFAULT 'NEW',
    "broker" "BrokerKind" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PortfolioSnapshot" (
    "id" TEXT NOT NULL,
    "strategyId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "asOf" TIMESTAMP(3) NOT NULL,
    "cashVirtual" DECIMAL(18,4) NOT NULL,
    "currency" "Currency" NOT NULL DEFAULT 'SAR',
    "positions" JSONB NOT NULL,
    "nav" DECIMAL(18,4) NOT NULL,

    CONSTRAINT "PortfolioSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Strategy_ownerUserId_idx" ON "Strategy"("ownerUserId");

-- CreateIndex
CREATE INDEX "Decision_userId_createdAt_idx" ON "Decision"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "AnalystSignalRecord_decisionId_idx" ON "AnalystSignalRecord"("decisionId");

-- CreateIndex
CREATE UNIQUE INDEX "Order_decisionId_key" ON "Order"("decisionId");

-- CreateIndex
CREATE INDEX "Order_status_idx" ON "Order"("status");

-- CreateIndex
CREATE INDEX "PortfolioSnapshot_strategyId_asOf_idx" ON "PortfolioSnapshot"("strategyId", "asOf");

-- AddForeignKey
ALTER TABLE "Strategy" ADD CONSTRAINT "Strategy_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Decision" ADD CONSTRAINT "Decision_strategyId_fkey" FOREIGN KEY ("strategyId") REFERENCES "Strategy"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Decision" ADD CONSTRAINT "Decision_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnalystSignalRecord" ADD CONSTRAINT "AnalystSignalRecord_decisionId_fkey" FOREIGN KEY ("decisionId") REFERENCES "Decision"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_decisionId_fkey" FOREIGN KEY ("decisionId") REFERENCES "Decision"("id") ON DELETE CASCADE ON UPDATE CASCADE;
