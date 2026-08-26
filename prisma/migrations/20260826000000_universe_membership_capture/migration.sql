-- CreateTable
CREATE TABLE "UniverseMembershipCapture" (
    "id" TEXT NOT NULL,
    "captureDate" DATE NOT NULL,
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "symbol" TEXT NOT NULL,
    "cik" TEXT,
    "market" "Market" NOT NULL,
    "included" BOOLEAN NOT NULL,
    "tier" TEXT,
    "provenance" TEXT,
    "sourceAsOf" TEXT,
    "purificationRatioBps" INTEGER,
    "reasonCodes" TEXT[],
    "exclusionReason" TEXT,
    "contentHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "UniverseMembershipCapture_pkey" PRIMARY KEY ("id")
);
-- CreateIndex
CREATE INDEX "UniverseMembershipCapture_captureDate_idx" ON "UniverseMembershipCapture"("captureDate");
-- CreateIndex
CREATE INDEX "UniverseMembershipCapture_symbol_capturedAt_idx" ON "UniverseMembershipCapture"("symbol", "capturedAt");
-- CreateIndex
CREATE UNIQUE INDEX "UniverseMembershipCapture_captureDate_symbol_market_key" ON "UniverseMembershipCapture"("captureDate", "symbol", "market");
