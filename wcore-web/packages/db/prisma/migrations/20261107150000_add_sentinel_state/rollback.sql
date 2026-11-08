-- Rollback manuel de 20261107150000_add_sentinel_state (Prisma n'execute pas ce fichier).
-- 1. Exporter l'etat si necessaire : COPY (SELECT * FROM "sentinel_state") TO STDOUT;
-- 2. Supprimer la table, puis la ligne de suivi Prisma.
DROP TABLE IF EXISTS "sentinel_state";
DELETE FROM "_prisma_migrations" WHERE "migration_name" = '20261107150000_add_sentinel_state';
