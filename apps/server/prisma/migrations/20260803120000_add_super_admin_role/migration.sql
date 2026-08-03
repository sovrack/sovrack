-- Ajout du rôle SUPER_ADMIN (propriétaire de la plateforme / back-office).
-- Postgres n'autorise pas ALTER TYPE ... ADD VALUE dans une transaction,
-- mais Prisma gère les ADD VALUE en dehors de la transaction implicitement.
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'SUPER_ADMIN';