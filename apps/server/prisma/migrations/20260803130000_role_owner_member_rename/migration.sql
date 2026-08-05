-- Étape 1 : ajout des nouvelles valeurs de l'enum "Role" (OWNER / MEMBER).
-- L'utilisation de ces valeurs (UPDATE + DEFAULT) se fait dans la migration
-- suivante : PostgreSQL interdit d'utiliser une valeur ajoutée dans la même
-- transaction. L'enum ProjectRole (OWNER / DEVELOPER / VIEWER) n'est PAS touché.
-- Les anciennes valeurs (ADMIN / DEVELOPER) restent présentes dans l'enum :
-- ce build PostgreSQL 16 rejette `ALTER TYPE ... DROP VALUE`. Inoffensif.

ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'OWNER';
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'MEMBER';
