-- CreateTable
CREATE TABLE "scam_verdicts" (
    "chainId" INTEGER NOT NULL,
    "address" TEXT NOT NULL,
    "verdict" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "payload" JSONB,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "scam_verdicts_pkey" PRIMARY KEY ("chainId","address")
);

-- CreateTable
CREATE TABLE "scam_scan_logs" (
    "id" TEXT NOT NULL,
    "chainId" INTEGER NOT NULL,
    "address" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "heuristicScore" INTEGER NOT NULL,
    "goPlusPayload" JSONB,
    "totalScore" INTEGER NOT NULL,
    "level" TEXT NOT NULL,
    "decision" TEXT NOT NULL,
    "reason" TEXT NOT NULL DEFAULT '',
    "reviewedByAdmin" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "scam_scan_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "scam_verdicts_source_updatedAt_idx" ON "scam_verdicts"("source", "updatedAt");

-- CreateIndex
CREATE INDEX "scam_verdicts_verdict_idx" ON "scam_verdicts"("verdict");

-- CreateIndex
CREATE INDEX "scam_scan_logs_chainId_address_createdAt_idx" ON "scam_scan_logs"("chainId", "address", "createdAt");

-- CreateIndex
CREATE INDEX "scam_scan_logs_level_createdAt_idx" ON "scam_scan_logs"("level", "createdAt");

-- CreateIndex
CREATE INDEX "scam_scan_logs_createdAt_idx" ON "scam_scan_logs"("createdAt");
