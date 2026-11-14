-- SICRO: momento de transporte — DMT padrão por via, FIT, DMT por material e linhas geradas (decisões #66–#68)

-- AlterTable
ALTER TABLE "Budget" ADD COLUMN "dmtNatural" DECIMAL(10,3),
ADD COLUMN "dmtPrimary" DECIMAL(10,3),
ADD COLUMN "dmtPaved" DECIMAL(10,3),
ADD COLUMN "fit" DECIMAL(8,5);

-- AlterTable
ALTER TABLE "WbsNode" ADD COLUMN "autoKind" TEXT;

-- CreateTable
CREATE TABLE "TransportDmt" (
    "id" TEXT NOT NULL,
    "budgetId" TEXT NOT NULL,
    "materialCode" TEXT NOT NULL,
    "dmtNatural" DECIMAL(10,3),
    "dmtPrimary" DECIMAL(10,3),
    "dmtPaved" DECIMAL(10,3),
    "note" TEXT,

    CONSTRAINT "TransportDmt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TransportDmt_budgetId_idx" ON "TransportDmt"("budgetId");

-- CreateIndex
CREATE UNIQUE INDEX "TransportDmt_budgetId_materialCode_key" ON "TransportDmt"("budgetId", "materialCode");

-- AddForeignKey
ALTER TABLE "TransportDmt" ADD CONSTRAINT "TransportDmt_budgetId_fkey" FOREIGN KEY ("budgetId") REFERENCES "Budget"("id") ON DELETE CASCADE ON UPDATE CASCADE;
