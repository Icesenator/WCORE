-- Rollback manuel de 20261123200000_add_kraken_call_state (a executer seulement apres
-- retour du classeur en appel direct : la table ne sert qu'a l'API).
DROP TABLE IF EXISTS "kraken_call_state";
DELETE FROM "_prisma_migrations" WHERE "migration_name" = '20261123200000_add_kraken_call_state';
