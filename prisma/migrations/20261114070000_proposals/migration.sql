-- Comparação das propostas recebidas (decisões #76–#79)
ALTER TABLE "Budget"
  ADD COLUMN "bidderMaxDays" INTEGER,
  ADD COLUMN "bidderMinValidityDays" INTEGER;

CREATE TABLE "Proposal" (
  "id" TEXT NOT NULL,
  "budgetId" TEXT NOT NULL,
  "bidderName" TEXT NOT NULL,
  "document" TEXT,
  "technicalLead" TEXT,
  "executionDays" INTEGER,
  "validityDays" INTEGER,
  "declaredTotal" DECIMAL(15,2),
  "fileName" TEXT NOT NULL,
  "fileKind" TEXT NOT NULL,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Proposal_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Proposal_budgetId_idx" ON "Proposal"("budgetId");
ALTER TABLE "Proposal" ADD CONSTRAINT "Proposal_budgetId_fkey" FOREIGN KEY ("budgetId") REFERENCES "Budget"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "ProposalItem" (
  "id" TEXT NOT NULL,
  "proposalId" TEXT NOT NULL,
  "position" INTEGER NOT NULL,
  "nodeId" TEXT,
  "item" TEXT,
  "description" TEXT NOT NULL,
  "unit" TEXT,
  "quantity" DECIMAL(15,4),
  "unitPrice" DECIMAL(15,4),
  "totalPrice" DECIMAL(15,2),
  CONSTRAINT "ProposalItem_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ProposalItem_proposalId_idx" ON "ProposalItem"("proposalId");
CREATE INDEX "ProposalItem_nodeId_idx" ON "ProposalItem"("nodeId");
ALTER TABLE "ProposalItem" ADD CONSTRAINT "ProposalItem_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "Proposal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProposalItem" ADD CONSTRAINT "ProposalItem_nodeId_fkey" FOREIGN KEY ("nodeId") REFERENCES "WbsNode"("id") ON DELETE SET NULL ON UPDATE CASCADE;
