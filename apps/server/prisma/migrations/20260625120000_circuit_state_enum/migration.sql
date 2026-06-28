-- A1: convert DockerConnection.circuitState from String to an enum (data-preserving).

-- 1) Create the enum type.
CREATE TYPE "CircuitState" AS ENUM ('CLOSED', 'OPEN', 'HALF_OPEN');

-- 2) Defensive: normalize any unexpected legacy value before the cast.
UPDATE "DockerConnection"
  SET "circuitState" = 'CLOSED'
  WHERE "circuitState" NOT IN ('CLOSED', 'OPEN', 'HALF_OPEN');

-- 3) Convert the column in place (USING cast preserves existing rows).
ALTER TABLE "DockerConnection" ALTER COLUMN "circuitState" DROP DEFAULT;
ALTER TABLE "DockerConnection"
  ALTER COLUMN "circuitState" TYPE "CircuitState" USING ("circuitState"::"CircuitState");
ALTER TABLE "DockerConnection" ALTER COLUMN "circuitState" SET DEFAULT 'CLOSED';
