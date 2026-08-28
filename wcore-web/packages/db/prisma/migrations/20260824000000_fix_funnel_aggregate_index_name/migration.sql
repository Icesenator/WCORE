-- Rename the unique index on funnel_event_aggregates to match Prisma's expected name.
-- PostgreSQL truncates identifiers to 63 bytes: the original migration created the index with the
-- 82-char name "funnel_event_aggregates_bucketDate_event_campaign_surface_variant_dimensionKey_key",
-- which was stored truncated as "...surface_varia". Prisma derives the expected name
-- "funnel_event_aggregates_bucketDate_event_campaign_surface_v_key" from the @@unique constraint.
ALTER INDEX "funnel_event_aggregates_bucketDate_event_campaign_surface_varia" RENAME TO "funnel_event_aggregates_bucketDate_event_campaign_surface_v_key";
