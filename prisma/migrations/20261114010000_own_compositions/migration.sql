-- Base própria da empresa: insumos e composições próprias (decisões #36, #51–#53)

-- CreateEnum
CREATE TYPE "OwnItemType" AS ENUM ('OFFICIAL_INPUT', 'OFFICIAL_COMPOSITION', 'OWN_INPUT', 'OWN_COMPOSITION');

-- AlterTable
ALTER TABLE "WbsNode" ADD COLUMN "ownCompositionId" TEXT;

-- CreateTable
CREATE TABLE "OwnInput" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "kind" "InputKind" NOT NULL,
    "unitPrice" DECIMAL(15,2) NOT NULL,
    "priceDate" DATE NOT NULL,
    "source" TEXT NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OwnInput_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OwnComposition" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "group" TEXT,
    "derivedFromOrigin" "PriceOrigin",
    "derivedFromCode" TEXT,
    "justification" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OwnComposition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OwnCompositionItem" (
    "id" TEXT NOT NULL,
    "compositionId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "type" "OwnItemType" NOT NULL,
    "officialOrigin" "PriceOrigin",
    "officialCode" TEXT,
    "officialDescription" TEXT,
    "officialUnit" TEXT,
    "ownInputId" TEXT,
    "ownCompositionId" TEXT,
    "coefficient" DECIMAL(18,7) NOT NULL,

    CONSTRAINT "OwnCompositionItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WbsNode_ownCompositionId_idx" ON "WbsNode"("ownCompositionId");

-- CreateIndex
CREATE INDEX "OwnInput_companyId_idx" ON "OwnInput"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "OwnInput_companyId_code_key" ON "OwnInput"("companyId", "code");

-- CreateIndex
CREATE INDEX "OwnComposition_companyId_idx" ON "OwnComposition"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "OwnComposition_companyId_code_key" ON "OwnComposition"("companyId", "code");

-- CreateIndex
CREATE INDEX "OwnCompositionItem_compositionId_idx" ON "OwnCompositionItem"("compositionId");

-- CreateIndex
CREATE INDEX "OwnCompositionItem_ownInputId_idx" ON "OwnCompositionItem"("ownInputId");

-- CreateIndex
CREATE INDEX "OwnCompositionItem_ownCompositionId_idx" ON "OwnCompositionItem"("ownCompositionId");

-- AddForeignKey
ALTER TABLE "WbsNode" ADD CONSTRAINT "WbsNode_ownCompositionId_fkey" FOREIGN KEY ("ownCompositionId") REFERENCES "OwnComposition"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OwnInput" ADD CONSTRAINT "OwnInput_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OwnComposition" ADD CONSTRAINT "OwnComposition_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OwnCompositionItem" ADD CONSTRAINT "OwnCompositionItem_compositionId_fkey" FOREIGN KEY ("compositionId") REFERENCES "OwnComposition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OwnCompositionItem" ADD CONSTRAINT "OwnCompositionItem_ownInputId_fkey" FOREIGN KEY ("ownInputId") REFERENCES "OwnInput"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OwnCompositionItem" ADD CONSTRAINT "OwnCompositionItem_ownCompositionId_fkey" FOREIGN KEY ("ownCompositionId") REFERENCES "OwnComposition"("id") ON DELETE SET NULL ON UPDATE CASCADE;
