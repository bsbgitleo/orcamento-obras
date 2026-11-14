-- FIT pelo Manual de Custos, Volume 05, 2ª edição (2025) — decisões #71–#74
CREATE TYPE "FitMode" AS ENUM ('CALCULATED', 'MANUAL');

ALTER TABLE "Budget"
  ADD COLUMN "dmtUrban" DECIMAL(10,3),
  ADD COLUMN "fitMode" "FitMode" NOT NULL DEFAULT 'CALCULATED',
  ADD COLUMN "stopGo" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "urbanSpeed" DECIMAL(6,2),
  ADD COLUMN "trafficSource" TEXT;

-- Orçamentos que já tinham um FIT informado (≠ 1) continuam com ele
UPDATE "Budget" SET "fitMode" = 'MANUAL' WHERE "fit" IS NOT NULL AND "fit" <> 1;

ALTER TABLE "TransportDmt"
  ADD COLUMN "dmtUrban" DECIMAL(10,3),
  ADD COLUMN "passesWorksite" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "applyFit" BOOLEAN NOT NULL DEFAULT true;

CREATE TABLE "TrafficSegment" (
  "id" TEXT NOT NULL,
  "budgetId" TEXT NOT NULL,
  "position" INTEGER NOT NULL,
  "description" TEXT,
  "lengthKm" DECIMAL(10,3) NOT NULL,
  "vmdPerLane" DECIMAL(10,1) NOT NULL,
  CONSTRAINT "TrafficSegment_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "TrafficSegment_budgetId_idx" ON "TrafficSegment"("budgetId");
ALTER TABLE "TrafficSegment" ADD CONSTRAINT "TrafficSegment_budgetId_fkey" FOREIGN KEY ("budgetId") REFERENCES "Budget"("id") ON DELETE CASCADE ON UPDATE CASCADE;
