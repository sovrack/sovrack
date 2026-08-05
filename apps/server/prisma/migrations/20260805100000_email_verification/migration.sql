-- Validation email obligatoire avant activation du compte.
-- Un compte s'inscrit désactivé (isActive=false) avec un code à 6 chiffres
-- et une expiration ; il n'est activé qu'après vérification du code.

ALTER TABLE "User"
  ADD COLUMN "emailVerificationCode" TEXT,
  ADD COLUMN "emailVerificationExpiresAt" TIMESTAMP(3),
  ADD COLUMN "emailVerifiedAt" TIMESTAMP(3);
