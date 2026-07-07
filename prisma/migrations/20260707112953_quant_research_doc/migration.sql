-- CreateTable
CREATE TABLE "ResearchDoc" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "sourceRef" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "tags" TEXT[],
    "embedding" DOUBLE PRECISION[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ResearchDoc_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ResearchDoc_tags_idx" ON "ResearchDoc"("tags");
