CREATE TABLE "funnel_event_aggregates" (
    "id" TEXT NOT NULL,
    "bucketDate" TIMESTAMP(3) NOT NULL,
    "event" TEXT NOT NULL,
    "campaign" TEXT NOT NULL,
    "surface" TEXT NOT NULL,
    "variant" TEXT NOT NULL,
    "dimensionKey" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "funnel_event_aggregates_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "funnel_event_aggregates_bucketDate_event_campaign_surface_variant_dimensionKey_key"
ON "funnel_event_aggregates"("bucketDate", "event", "campaign", "surface", "variant", "dimensionKey");

CREATE INDEX "funnel_event_aggregates_bucketDate_idx"
ON "funnel_event_aggregates"("bucketDate");

CREATE INDEX "funnel_event_aggregates_campaign_bucketDate_idx"
ON "funnel_event_aggregates"("campaign", "bucketDate");
