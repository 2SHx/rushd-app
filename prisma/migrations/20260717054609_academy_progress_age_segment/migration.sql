-- CreateEnum
CREATE TYPE "AgeSegment" AS ENUM ('KIDS', 'TEENS', 'ADULTS');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "ageSegment" "AgeSegment";

-- CreateTable
CREATE TABLE "AcademyProgress" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "trackId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "lessonId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "score" INTEGER,
    "answers" JSONB,
    "contentVersion" INTEGER NOT NULL,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AcademyProgress_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AcademyProgress_userId_idx" ON "AcademyProgress"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "AcademyProgress_userId_trackId_unitId_lessonId_key" ON "AcademyProgress"("userId", "trackId", "unitId", "lessonId");

-- AddForeignKey
ALTER TABLE "AcademyProgress" ADD CONSTRAINT "AcademyProgress_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
