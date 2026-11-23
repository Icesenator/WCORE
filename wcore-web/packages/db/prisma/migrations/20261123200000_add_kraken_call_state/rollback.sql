-- Rollback manuel de 20261123200000_add_kraken_call_state (Prisma n'execute pas ce fichier).
-- NE PAS l'executer lors d'un retour arriere du classeur (KRAKEN_SOURCE=DIRECT) : la table
-- garde le dernier nonce et la pause de la cle, utiles si l'API reprend le relais.
-- A n'utiliser que pour retirer definitivement la fonctionnalite.
DROP TABLE IF EXISTS "kraken_call_state";
DELETE FROM "_prisma_migrations" WHERE "migration_name" = '20261123200000_add_kraken_call_state';
