-- CreateTable
CREATE TABLE "StrategyLearningAttempt" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "setupId" TEXT NOT NULL,
    "setupVersion" TEXT NOT NULL,
    "questionSetVersion" TEXT NOT NULL,
    "policyVersion" TEXT NOT NULL,
    "policyHash" TEXT NOT NULL,
    "complianceTag" TEXT NOT NULL,
    "attemptNumber" INTEGER NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "answers" JSONB NOT NULL,
    "compiledPolicy" JSONB NOT NULL,
    "replayConfig" JSONB NOT NULL,
    "dataProvenance" JSONB NOT NULL,
    "retryOfId" TEXT,
    "sealedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StrategyLearningAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StrategyLearningResult" (
    "id" TEXT NOT NULL,
    "attemptId" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StrategyLearningResult_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StrategyLearningAttempt_userId_createdAt_idx" ON "StrategyLearningAttempt"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "StrategyLearningAttempt_retryOfId_idx" ON "StrategyLearningAttempt"("retryOfId");

-- CreateIndex
CREATE UNIQUE INDEX "StrategyLearningAttempt_userId_idempotencyKey_key" ON "StrategyLearningAttempt"("userId", "idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "StrategyLearningAttempt_userId_setupId_attemptNumber_key" ON "StrategyLearningAttempt"("userId", "setupId", "attemptNumber");

-- CreateIndex
CREATE UNIQUE INDEX "StrategyLearningResult_attemptId_key" ON "StrategyLearningResult"("attemptId");

-- AddForeignKey
ALTER TABLE "StrategyLearningAttempt" ADD CONSTRAINT "StrategyLearningAttempt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StrategyLearningAttempt" ADD CONSTRAINT "StrategyLearningAttempt_retryOfId_fkey" FOREIGN KEY ("retryOfId") REFERENCES "StrategyLearningAttempt"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StrategyLearningResult" ADD CONSTRAINT "StrategyLearningResult_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "StrategyLearningAttempt"("id") ON DELETE CASCADE ON UPDATE CASCADE;
