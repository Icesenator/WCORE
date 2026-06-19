-- CreateTable
CREATE TABLE "system_metric_snapshots" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL,
    "dbOk" BOOLEAN NOT NULL,
    "redisOk" BOOLEAN NOT NULL,
    "openCircuits" INTEGER NOT NULL,
    "rpcErrors" INTEGER NOT NULL,
    "pricingErrors" INTEGER NOT NULL,
    "scanCount" INTEGER NOT NULL,
    "gm24h" INTEGER NOT NULL,
    "gm7d" INTEGER NOT NULL,
    "gm30d" INTEGER NOT NULL,

    CONSTRAINT "system_metric_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "system_metric_snapshots_createdAt_idx" ON "system_metric_snapshots"("createdAt");
