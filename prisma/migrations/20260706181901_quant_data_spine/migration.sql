-- CreateEnum
CREATE TYPE "BarInterval" AS ENUM ('DAY', 'HOUR', 'MINUTE');

-- CreateEnum
CREATE TYPE "DataSource" AS ENUM ('MOCK', 'YAHOO', 'ALPACA', 'SAHMK', 'TWELVEDATA', 'ZOYA', 'FUNDAMENTALS');

-- CreateTable
CREATE TABLE "MarketBar" (
    "id" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "market" "Market" NOT NULL,
    "interval" "BarInterval" NOT NULL DEFAULT 'DAY',
    "ts" TIMESTAMP(3) NOT NULL,
    "open" DECIMAL(18,6) NOT NULL,
    "high" DECIMAL(18,6) NOT NULL,
    "low" DECIMAL(18,6) NOT NULL,
    "close" DECIMAL(18,6) NOT NULL,
    "volume" DECIMAL(24,4) NOT NULL,
    "source" "DataSource" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MarketBar_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Fundamentals" (
    "id" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "market" "Market" NOT NULL,
    "asOf" TIMESTAMP(3) NOT NULL,
    "releasedAt" TIMESTAMP(3) NOT NULL,
    "metrics" JSONB NOT NULL,
    "source" "DataSource" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Fundamentals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NewsItem" (
    "id" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "market" "Market" NOT NULL,
    "publishedAt" TIMESTAMP(3) NOT NULL,
    "headline" TEXT NOT NULL,
    "summary" TEXT,
    "url" TEXT,
    "sentiment" DECIMAL(4,3),
    "source" "DataSource" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NewsItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MarketBar_symbol_market_interval_ts_idx" ON "MarketBar"("symbol", "market", "interval", "ts");

-- CreateIndex
CREATE UNIQUE INDEX "MarketBar_symbol_market_interval_ts_key" ON "MarketBar"("symbol", "market", "interval", "ts");

-- CreateIndex
CREATE INDEX "Fundamentals_symbol_market_releasedAt_idx" ON "Fundamentals"("symbol", "market", "releasedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Fundamentals_symbol_market_asOf_key" ON "Fundamentals"("symbol", "market", "asOf");

-- CreateIndex
CREATE INDEX "NewsItem_symbol_market_publishedAt_idx" ON "NewsItem"("symbol", "market", "publishedAt");
