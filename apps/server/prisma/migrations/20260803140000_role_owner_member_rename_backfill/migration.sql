-- Étape 2 : bascule des données et du défaut sur les nouvelles valeurs.
-- Exécuté après 20260803130000 (valeurs OWNER / MEMBER déjà présentes dans
-- l'enum et committées) : les UPDATE peuvent donc les référencer sans erreur
-- PostgreSQL "unsafe use of new value".
--   ADMIN     -> OWNER   (propriétaire d'une organisation)
--   DEVELOPER -> MEMBER  (membre d'une organisation)
-- SUPER_ADMIN est inchangé.

UPDATE "User" SET "role" = 'OWNER' WHERE "role" = 'ADMIN';
UPDATE "User" SET "role" = 'MEMBER' WHERE "role" = 'DEVELOPER';

ALTER TABLE "User" ALTER COLUMN "role" SET DEFAULT 'MEMBER';