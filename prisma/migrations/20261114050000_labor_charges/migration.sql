-- SICRO: encargos por profissional; orçamento SICRO sem tabela de encargos avulsa (decisões #40, #70)

-- AlterTable
ALTER TABLE "Budget" ALTER COLUMN "socialChargesId" DROP NOT NULL;

-- Orçamentos já criados em base SICRO: os encargos passam a vir do relatório do DNIT
UPDATE "Budget" b SET "socialChargesId" = NULL FROM "PriceTable" t WHERE t.id = b."priceTableId" AND t.origin = 'SICRO';

-- AlterTable
ALTER TABLE "PriceTable" ADD COLUMN "chargeLegend" JSONB;

-- CreateTable
CREATE TABLE "LaborCharge" (
    "id" TEXT NOT NULL,
    "priceTableId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "items" JSONB NOT NULL,
    "groupA" DECIMAL(9,4) NOT NULL,
    "groupB" DECIMAL(9,4) NOT NULL,
    "groupC" DECIMAL(9,4) NOT NULL,
    "groupD" DECIMAL(9,4) NOT NULL,
    "total" DECIMAL(9,2) NOT NULL,

    CONSTRAINT "LaborCharge_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LaborCharge_priceTableId_idx" ON "LaborCharge"("priceTableId");

-- CreateIndex
CREATE UNIQUE INDEX "LaborCharge_priceTableId_code_key" ON "LaborCharge"("priceTableId", "code");

-- AddForeignKey
ALTER TABLE "LaborCharge" ADD CONSTRAINT "LaborCharge_priceTableId_fkey" FOREIGN KEY ("priceTableId") REFERENCES "PriceTable"("id") ON DELETE CASCADE ON UPDATE CASCADE;
