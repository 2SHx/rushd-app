-- CreateTable
CREATE TABLE "AutoRunClaim" (
    "key" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AutoRunClaim_pkey" PRIMARY KEY ("key")
);
