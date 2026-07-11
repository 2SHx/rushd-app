-- CreateEnum
CREATE TYPE "IntradaySession" AS ENUM ('PRE', 'REGULAR', 'POST');

-- CreateTable
CREATE TABLE "IntradayBar" (
    "id" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "market" "Market" NOT NULL,
    "ts" TIMESTAMP(3) NOT NULL,
    "open" DECIMAL(18,6) NOT NULL,
    "high" DECIMAL(18,6) NOT NULL,
    "low" DECIMAL(18,6) NOT NULL,
    "close" DECIMAL(18,6) NOT NULL,
    "volume" DECIMAL(24,4) NOT NULL,
    "session" "IntradaySession" NOT NULL,
    "source" "DataSource" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IntradayBar_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SymbolSnapshot" (
    "id" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "market" "Market" NOT NULL,
    "asOf" TIMESTAMP(3) NOT NULL,
    "mcap" DECIMAL(24,4),
    "float" DECIMAL(24,4),
    "premarketMovePct" DECIMAL(9,4),
    "cumVolume" DECIMAL(24,4) NOT NULL,
    "source" "DataSource" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SymbolSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "IntradayBar_symbol_market_ts_idx" ON "IntradayBar"("symbol", "market", "ts");

-- CreateIndex
CREATE UNIQUE INDEX "IntradayBar_symbol_market_ts_key" ON "IntradayBar"("symbol", "market", "ts");

-- CreateIndex
CREATE INDEX "SymbolSnapshot_symbol_market_asOf_idx" ON "SymbolSnapshot"("symbol", "market", "asOf");

-- CreateIndex
CREATE UNIQUE INDEX "SymbolSnapshot_symbol_market_asOf_key" ON "SymbolSnapshot"("symbol", "market", "asOf");

