-- Confirmation de suppression de compte et réinitialisation de mot de passe
-- oublié : codes à 6 chiffres envoyés par email, avec expiration.

ALTER TABLE "User"
  ADD COLUMN "deleteAccountCode" TEXT,
  ADD COLUMN "deleteAccountExpiresAt" TIMESTAMP(3),
  ADD COLUMN "passwordResetCode" TEXT,
  ADD COLUMN "passwordResetExpiresAt" TIMESTAMP(3);
