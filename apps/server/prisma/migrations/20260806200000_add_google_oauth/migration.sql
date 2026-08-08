-- AddGoogleOAuth: rend le mot de passe optionnel et ajoute le support de la
-- connexion Google OAuth (Se connecter avec Google).

-- password devient nullable : les comptes Google n'ont pas de mot de passe.
ALTER TABLE "User" ALTER COLUMN "password" DROP NOT NULL;

-- Colonnes OAuth Google (uniquement pour les comptes créés via Google).
ALTER TABLE "User" ADD COLUMN "provider" TEXT NOT NULL DEFAULT 'email';
ALTER TABLE "User" ADD COLUMN "googleId" TEXT;

-- Un utilisateur ne peut être appairé qu'à un seul compte Google.
CREATE UNIQUE INDEX "User_googleId_key" ON "User"("googleId");
