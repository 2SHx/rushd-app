-- CreateTable
CREATE TABLE "StrategyLearningMasteryEvent" (
    "id" TEXT NOT NULL,
    "attemptId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "response" TEXT,
    "correct" BOOLEAN,
    "xp" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StrategyLearningMasteryEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StrategyLearningMasteryEvent_attemptId_createdAt_idx" ON "StrategyLearningMasteryEvent"("attemptId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "StrategyLearningMasteryEvent_attemptId_kind_key" ON "StrategyLearningMasteryEvent"("attemptId", "kind");

-- AddForeignKey
ALTER TABLE "StrategyLearningMasteryEvent" ADD CONSTRAINT "StrategyLearningMasteryEvent_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "StrategyLearningAttempt"("id") ON DELETE CASCADE ON UPDATE CASCADE;
