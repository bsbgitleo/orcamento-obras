-- Exportações: dados da empresa e da proposta, planilha para proponentes (decisões #59, #60)

-- AlterTable
ALTER TABLE "Company" ADD COLUMN "address" TEXT,
ADD COLUMN "phone" TEXT,
ADD COLUMN "email" TEXT,
ADD COLUMN "technicalLead" TEXT,
ADD COLUMN "technicalRegistry" TEXT;

-- AlterTable
ALTER TABLE "Budget" ADD COLUMN "proposalValidityDays" INTEGER,
ADD COLUMN "executionTerm" TEXT,
ADD COLUMN "paymentTerms" TEXT,
ADD COLUMN "proposalNotes" TEXT,
ADD COLUMN "bidderInstructions" TEXT,
ADD COLUMN "bidderPremises" TEXT;

-- AlterTable
ALTER TABLE "WbsNode" ADD COLUMN "specification" TEXT,
ADD COLUMN "measurementCriteria" TEXT,
ADD COLUMN "requiresBrand" BOOLEAN NOT NULL DEFAULT false;
