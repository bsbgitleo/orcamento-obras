-- prisma/migrations/20261113160000_init/migration.sql
-- Initial schema. Written by hand in Prisma's own migration format (the schema
-- engine binary was unavailable in the authoring environment); apply with
-- `prisma migrate deploy` or `psql -f`.

-- Extensions (unaccent is a trusted extension since PostgreSQL 13)
CREATE EXTENSION IF NOT EXISTS unaccent;

-- CreateEnum
CREATE TYPE "ProjectType" AS ENUM ('PUBLIC', 'PRIVATE');

-- CreateEnum
CREATE TYPE "ProjectCategory" AS ENUM ('RESIDENTIAL_BUILDING', 'COMMERCIAL_BUILDING', 'SCHOOL', 'HEALTH_UNIT', 'PAVING', 'DRAINAGE', 'SANITATION', 'RENOVATION', 'OTHER');

-- CreateEnum
CREATE TYPE "BudgetStatus" AS ENUM ('DRAFT', 'IN_REVIEW', 'APPROVED', 'SENT', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "TaxRegime" AS ENUM ('DESONERADO', 'NAO_DESONERADO', 'SEM_ENCARGOS');

-- CreateEnum
CREATE TYPE "PriceOrigin" AS ENUM ('SINAPI', 'SICRO', 'PROPRIA', 'COTACAO');

-- CreateEnum
CREATE TYPE "InputKind" AS ENUM ('MATERIAL', 'MAO_DE_OBRA', 'EQUIPAMENTO', 'SERVICO');

-- CreateEnum
CREATE TYPE "CompositionItemType" AS ENUM ('INSUMO', 'COMPOSICAO_AUXILIAR');

-- CreateEnum
CREATE TYPE "WbsNodeKind" AS ENUM ('STAGE', 'SERVICE');

-- CreateEnum
CREATE TYPE "TcuWorkType" AS ENUM ('EDIFICACOES', 'RODOVIAS_FERROVIAS', 'REDES_AGUA_ESGOTO', 'PORTUARIAS_MARITIMAS_FLUVIAIS', 'ESTACOES_REDES_ENERGIA_ELETRICA', 'FORNECIMENTO_MATERIAIS_EQUIPAMENTOS');

-- CreateTable
CREATE TABLE "Client" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "document" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "address" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Client_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BdiProfile" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "workType" "TcuWorkType" NOT NULL DEFAULT 'EDIFICACOES',
    "centralAdministration" DECIMAL(7,4) NOT NULL,
    "insurance" DECIMAL(7,4) NOT NULL,
    "risk" DECIMAL(7,4) NOT NULL,
    "guarantee" DECIMAL(7,4) NOT NULL,
    "financialExpenses" DECIMAL(7,4) NOT NULL,
    "profit" DECIMAL(7,4) NOT NULL,
    "pis" DECIMAL(7,4) NOT NULL,
    "cofins" DECIMAL(7,4) NOT NULL,
    "iss" DECIMAL(7,4) NOT NULL,
    "cprb" DECIMAL(7,4) NOT NULL DEFAULT 0,
    "percent" DECIMAL(7,2) NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BdiProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SocialChargesProfile" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "regime" "TaxRegime" NOT NULL,
    "hourlyPct" DECIMAL(7,4) NOT NULL,
    "monthlyPct" DECIMAL(7,4) NOT NULL,
    "source" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SocialChargesProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PriceTable" (
    "id" TEXT NOT NULL,
    "origin" "PriceOrigin" NOT NULL,
    "uf" CHAR(2) NOT NULL,
    "referenceMonth" CHAR(7) NOT NULL,
    "regime" "TaxRegime" NOT NULL,
    "importedAt" TIMESTAMP(3),
    "sourceFile" TEXT,
    "socialChargesHourly" DECIMAL(7,4),
    "socialChargesMonthly" DECIMAL(7,4),

    CONSTRAINT "PriceTable_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Input" (
    "id" TEXT NOT NULL,
    "priceTableId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "kind" "InputKind" NOT NULL,
    "unitPrice" DECIMAL(15,2),
    "sourceClass" TEXT,
    "priceOrigin" TEXT,
    "priceFallbackUf" CHAR(2),
    "sourceLevel" INTEGER,
    "sourceNote" TEXT,

    CONSTRAINT "Input_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Composition" (
    "id" TEXT NOT NULL,
    "priceTableId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "group" TEXT,
    "referenceCost" DECIMAL(15,2),
    "unitCost" DECIMAL(15,2),
    "laborShare" DECIMAL(7,4),
    "sourceStatus" TEXT,
    "derivedFromId" TEXT,
    "justification" TEXT,

    CONSTRAINT "Composition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompositionItem" (
    "id" TEXT NOT NULL,
    "compositionId" TEXT NOT NULL,
    "type" "CompositionItemType" NOT NULL,
    "inputId" TEXT,
    "childCompositionId" TEXT,
    "coefficient" DECIMAL(18,7) NOT NULL,

    CONSTRAINT "CompositionItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "ProjectType" NOT NULL,
    "category" "ProjectCategory" NOT NULL,
    "clientId" TEXT,
    "address" TEXT,
    "uf" CHAR(2) NOT NULL,
    "deadlineDays" INTEGER,
    "biddingModality" TEXT,
    "biddingNumber" TEXT,
    "biddingAgency" TEXT,
    "biddingOpensAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Budget" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 0,
    "status" "BudgetStatus" NOT NULL DEFAULT 'DRAFT',
    "notes" TEXT,
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "priceTableId" TEXT NOT NULL,
    "bdiId" TEXT NOT NULL,
    "supplyBdiId" TEXT,
    "socialChargesId" TEXT NOT NULL,
    "scheduleMonths" INTEGER NOT NULL DEFAULT 6,
    "directCost" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "salePrice" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Budget_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WbsNode" (
    "id" TEXT NOT NULL,
    "budgetId" TEXT NOT NULL,
    "parentId" TEXT,
    "kind" "WbsNodeKind" NOT NULL,
    "position" INTEGER NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "compositionId" TEXT,
    "unit" TEXT,
    "quantity" DECIMAL(15,4),
    "unitCost" DECIMAL(15,2),
    "totalCost" DECIMAL(15,2),
    "unitPrice" DECIMAL(15,2),
    "totalPrice" DECIMAL(15,2),
    "isSupplyItem" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "WbsNode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScheduleEntry" (
    "id" TEXT NOT NULL,
    "budgetId" TEXT NOT NULL,
    "nodeId" TEXT NOT NULL,
    "month" INTEGER NOT NULL,
    "percent" DECIMAL(7,4) NOT NULL,

    CONSTRAINT "ScheduleEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PriceTable_origin_uf_referenceMonth_regime_key" ON "PriceTable"("origin", "uf", "referenceMonth", "regime");

-- CreateIndex
CREATE INDEX "Input_description_idx" ON "Input"("description");

-- CreateIndex
CREATE UNIQUE INDEX "Input_priceTableId_code_key" ON "Input"("priceTableId", "code");

-- CreateIndex
CREATE INDEX "Composition_description_idx" ON "Composition"("description");

-- CreateIndex
CREATE UNIQUE INDEX "Composition_priceTableId_code_key" ON "Composition"("priceTableId", "code");

-- CreateIndex
CREATE INDEX "CompositionItem_compositionId_idx" ON "CompositionItem"("compositionId");

-- CreateIndex
CREATE UNIQUE INDEX "Project_code_key" ON "Project"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Budget_projectId_revision_key" ON "Budget"("projectId", "revision");

-- CreateIndex
CREATE INDEX "WbsNode_budgetId_idx" ON "WbsNode"("budgetId");

-- CreateIndex
CREATE UNIQUE INDEX "WbsNode_budgetId_parentId_position_key" ON "WbsNode"("budgetId", "parentId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "ScheduleEntry_nodeId_month_key" ON "ScheduleEntry"("nodeId", "month");

-- CreateIndex (FK columns: Postgres does not index them automatically)
CREATE INDEX "Input_priceTableId_idx" ON "Input"("priceTableId");
CREATE INDEX "Composition_priceTableId_idx" ON "Composition"("priceTableId");
CREATE INDEX "Composition_derivedFromId_idx" ON "Composition"("derivedFromId");
CREATE INDEX "CompositionItem_inputId_idx" ON "CompositionItem"("inputId");
CREATE INDEX "CompositionItem_childCompositionId_idx" ON "CompositionItem"("childCompositionId");
CREATE INDEX "Project_clientId_idx" ON "Project"("clientId");
CREATE INDEX "Budget_priceTableId_idx" ON "Budget"("priceTableId");
CREATE INDEX "Budget_bdiId_idx" ON "Budget"("bdiId");
CREATE INDEX "Budget_supplyBdiId_idx" ON "Budget"("supplyBdiId");
CREATE INDEX "Budget_socialChargesId_idx" ON "Budget"("socialChargesId");
CREATE INDEX "WbsNode_parentId_idx" ON "WbsNode"("parentId");
CREATE INDEX "WbsNode_compositionId_idx" ON "WbsNode"("compositionId");
CREATE INDEX "ScheduleEntry_budgetId_idx" ON "ScheduleEntry"("budgetId");

-- AddForeignKey
ALTER TABLE "Input" ADD CONSTRAINT "Input_priceTableId_fkey" FOREIGN KEY ("priceTableId") REFERENCES "PriceTable"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Composition" ADD CONSTRAINT "Composition_priceTableId_fkey" FOREIGN KEY ("priceTableId") REFERENCES "PriceTable"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Composition" ADD CONSTRAINT "Composition_derivedFromId_fkey" FOREIGN KEY ("derivedFromId") REFERENCES "Composition"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompositionItem" ADD CONSTRAINT "CompositionItem_compositionId_fkey" FOREIGN KEY ("compositionId") REFERENCES "Composition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompositionItem" ADD CONSTRAINT "CompositionItem_inputId_fkey" FOREIGN KEY ("inputId") REFERENCES "Input"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompositionItem" ADD CONSTRAINT "CompositionItem_childCompositionId_fkey" FOREIGN KEY ("childCompositionId") REFERENCES "Composition"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Budget" ADD CONSTRAINT "Budget_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Budget" ADD CONSTRAINT "Budget_priceTableId_fkey" FOREIGN KEY ("priceTableId") REFERENCES "PriceTable"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Budget" ADD CONSTRAINT "Budget_bdiId_fkey" FOREIGN KEY ("bdiId") REFERENCES "BdiProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Budget" ADD CONSTRAINT "Budget_supplyBdiId_fkey" FOREIGN KEY ("supplyBdiId") REFERENCES "BdiProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Budget" ADD CONSTRAINT "Budget_socialChargesId_fkey" FOREIGN KEY ("socialChargesId") REFERENCES "SocialChargesProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WbsNode" ADD CONSTRAINT "WbsNode_budgetId_fkey" FOREIGN KEY ("budgetId") REFERENCES "Budget"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WbsNode" ADD CONSTRAINT "WbsNode_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "WbsNode"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WbsNode" ADD CONSTRAINT "WbsNode_compositionId_fkey" FOREIGN KEY ("compositionId") REFERENCES "Composition"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduleEntry" ADD CONSTRAINT "ScheduleEntry_budgetId_fkey" FOREIGN KEY ("budgetId") REFERENCES "Budget"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduleEntry" ADD CONSTRAINT "ScheduleEntry_nodeId_fkey" FOREIGN KEY ("nodeId") REFERENCES "WbsNode"("id") ON DELETE CASCADE ON UPDATE CASCADE;
