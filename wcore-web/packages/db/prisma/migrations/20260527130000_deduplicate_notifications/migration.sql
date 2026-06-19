-- Deduplicate notifications: keep only the newest row per (userId, type, title).
-- This fixes the "14-day GM Streak!" notification reappearing in a loop
-- when multiple copies exist from streak reset+rebuild cycles.
DELETE FROM "notifications"
WHERE id NOT IN (
  SELECT DISTINCT ON ("userId", type, title) id
  FROM "notifications"
  ORDER BY "userId", type, title, "createdAt" DESC
);
