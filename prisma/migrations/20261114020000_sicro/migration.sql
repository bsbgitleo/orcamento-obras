-- SICRO: preços com 4 casas, equipamentos (custo produtivo/improdutivo),
-- produção da equipe, FIC e os grupos A–F dos itens (decisões #38–#40, #55)

-- AlterEnum
ALTER TYPE "CompositionItemType" ADD VALUE 'PERCENTUAL';

-- AlterTable
ALTER TABLE "Input" ALTER COLUMN "unitPrice" SET DATA TYPE DECIMAL(15,4),
ADD COLUMN "productiveCost" DECIMAL(15,4),
ADD COLUMN "unproductiveCost" DECIMAL(15,4);

-- AlterTable
ALTER TABLE "Composition" ADD COLUMN "productionRate" DECIMAL(18,7),
ADD COLUMN "fic" DECIMAL(9,5);

-- AlterTable
ALTER TABLE "CompositionItem" ADD COLUMN "position" INTEGER,
ADD COLUMN "sicroGroup" CHAR(1),
ADD COLUMN "operativeUse" DECIMAL(9,5),
ADD COLUMN "unproductiveUse" DECIMAL(9,5),
ADD COLUMN "percent" DECIMAL(9,4),
ADD COLUMN "label" TEXT,
ADD COLUMN "transportCodes" TEXT[];
