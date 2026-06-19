-- CreateTable
CREATE TABLE "ops_events" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'info',
    "message" TEXT NOT NULL DEFAULT '',
    "data" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ops_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ops_events_createdAt_idx" ON "ops_events"("createdAt");
CREATE INDEX "ops_events_type_idx" ON "ops_events"("type");
