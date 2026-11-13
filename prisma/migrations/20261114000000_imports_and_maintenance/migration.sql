-- Importação pela interface, administrador da plataforma e manutenções do SINAPI
-- (decisões #33, #34, #45–#47)

-- AlterTable
ALTER TABLE "User" ADD COLUMN "isPlatformAdmin" BOOLEAN NOT NULL DEFAULT false;

-- CreateEnum
CREATE TYPE "ImportJobStatus" AS ENUM ('QUEUED', 'RUNNING', 'DONE', 'FAILED');

-- CreateTable
CREATE TABLE "ImportJob" (
    "id" TEXT NOT NULL,
    "origin" "PriceOrigin" NOT NULL DEFAULT 'SINAPI',
    "status" "ImportJobStatus" NOT NULL DEFAULT 'QUEUED',
    "createdById" TEXT NOT NULL,
    "ufs" TEXT[],
    "regimes" "TaxRegime"[],
    "fileNames" TEXT[],
    "log" TEXT NOT NULL DEFAULT '',
    "error" TEXT,
    "result" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "ImportJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SourceMaintenance" (
    "id" TEXT NOT NULL,
    "origin" "PriceOrigin" NOT NULL,
    "referenceMonth" CHAR(7) NOT NULL,
    "itemType" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "maintenance" TEXT NOT NULL,
    "fileMonth" CHAR(7) NOT NULL,

    CONSTRAINT "SourceMaintenance_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ImportJob_createdById_idx" ON "ImportJob"("createdById");

-- CreateIndex
CREATE INDEX "ImportJob_status_idx" ON "ImportJob"("status");

-- CreateIndex
CREATE INDEX "SourceMaintenance_origin_code_idx" ON "SourceMaintenance"("origin", "code");

-- CreateIndex
CREATE INDEX "SourceMaintenance_origin_referenceMonth_idx" ON "SourceMaintenance"("origin", "referenceMonth");

-- AddForeignKey
ALTER TABLE "ImportJob" ADD CONSTRAINT "ImportJob_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
