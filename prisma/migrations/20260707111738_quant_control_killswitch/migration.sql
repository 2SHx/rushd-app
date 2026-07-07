-- CreateTable
CREATE TABLE "QuantControl" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "halted" BOOLEAN NOT NULL DEFAULT false,
    "reason" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QuantControl_pkey" PRIMARY KEY ("id")
);
