CREATE TABLE "scan_jobs" (
    "id" TEXT NOT NULL,
    "ownerPrincipal" TEXT NOT NULL,
    "userId" TEXT,
    "ip" TEXT,
    "address" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "request" JSONB NOT NULL,
    "progress" JSONB NOT NULL,
    "result" JSONB,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leaseOwner" TEXT,
    "leaseExpiresAt" TIMESTAMP(3),
    "heartbeatAt" TIMESTAMP(3),
    "progressAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "scan_jobs_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "scan_jobs_status_check" CHECK ("status" IN ('queued', 'running', 'done', 'error'))
);

CREATE INDEX "scan_jobs_status_availableAt_createdAt_idx" ON "scan_jobs"("status", "availableAt", "createdAt");
CREATE INDEX "scan_jobs_status_leaseExpiresAt_idx" ON "scan_jobs"("status", "leaseExpiresAt");
CREATE INDEX "scan_jobs_ownerPrincipal_status_idx" ON "scan_jobs"("ownerPrincipal", "status");
CREATE INDEX "scan_jobs_expiresAt_idx" ON "scan_jobs"("expiresAt");
