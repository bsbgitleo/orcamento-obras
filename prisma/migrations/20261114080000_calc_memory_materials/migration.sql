-- Memória de cálculo e especificação de materiais (decisões #80–#83)
ALTER TABLE "Budget" ADD COLUMN "calcMemoryNote" TEXT, ADD COLUMN "materialsNote" TEXT;

CREATE TABLE "CalcRow" (
  "id" TEXT NOT NULL,
  "budgetId" TEXT NOT NULL,
  "position" INTEGER NOT NULL,
  "kind" TEXT NOT NULL,
  "code" TEXT,
  "description" TEXT NOT NULL,
  "unit" TEXT,
  "value" DECIMAL(24,8),
  "formula" TEXT,
  "result" DECIMAL(24,8),
  "error" TEXT,
  "source" TEXT,
  "estimated" BOOLEAN NOT NULL DEFAULT false,
  CONSTRAINT "CalcRow_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "CalcRow_budgetId_code_key" ON "CalcRow"("budgetId", "code");
CREATE INDEX "CalcRow_budgetId_idx" ON "CalcRow"("budgetId");
ALTER TABLE "CalcRow" ADD CONSTRAINT "CalcRow_budgetId_fkey" FOREIGN KEY ("budgetId") REFERENCES "Budget"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "WbsNode" ADD COLUMN "quantityParamId" TEXT;
ALTER TABLE "WbsNode" ADD CONSTRAINT "WbsNode_quantityParamId_fkey" FOREIGN KEY ("quantityParamId") REFERENCES "CalcRow"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "MaterialSpec" (
  "id" TEXT NOT NULL,
  "budgetId" TEXT NOT NULL,
  "position" INTEGER NOT NULL,
  "material" TEXT NOT NULL,
  "specification" TEXT,
  "references" TEXT,
  "standards" TEXT,
  CONSTRAINT "MaterialSpec_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "MaterialSpec_budgetId_idx" ON "MaterialSpec"("budgetId");
ALTER TABLE "MaterialSpec" ADD CONSTRAINT "MaterialSpec_budgetId_fkey" FOREIGN KEY ("budgetId") REFERENCES "Budget"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "MaterialSpecItem" (
  "materialSpecId" TEXT NOT NULL,
  "nodeId" TEXT NOT NULL,
  CONSTRAINT "MaterialSpecItem_pkey" PRIMARY KEY ("materialSpecId", "nodeId")
);
CREATE INDEX "MaterialSpecItem_nodeId_idx" ON "MaterialSpecItem"("nodeId");
ALTER TABLE "MaterialSpecItem" ADD CONSTRAINT "MaterialSpecItem_materialSpecId_fkey" FOREIGN KEY ("materialSpecId") REFERENCES "MaterialSpec"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MaterialSpecItem" ADD CONSTRAINT "MaterialSpecItem_nodeId_fkey" FOREIGN KEY ("nodeId") REFERENCES "WbsNode"("id") ON DELETE CASCADE ON UPDATE CASCADE;
