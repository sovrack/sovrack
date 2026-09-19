-- Les endpoints créés avant le stockage des secrets ne doivent jamais rester
-- actifs. Une reconnexion depuis l'interface leur attribue un secret chiffré
-- et les réactive explicitement.
UPDATE "WebhookEndpoint"
SET "isActive" = false,
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "secret" IS NULL
  AND "isActive" = true;
