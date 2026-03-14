-- CreateEnum
CREATE TYPE "InvestorProfile" AS ENUM ('GENERICO', 'CONSERVADOR', 'MODERADO', 'AGRESSIVO');

-- CreateEnum
CREATE TYPE "DecisionType" AS ENUM ('COMPRA_FORTE', 'COMPRA', 'MANTER', 'VENDA', 'VENDA_FORTE');

-- CreateTable
CREATE TABLE "indicator_configs" (
    "id" TEXT NOT NULL,
    "profile" "InvestorProfile" NOT NULL,
    "indicatorId" TEXT NOT NULL,
    "weight" DOUBLE PRECISION NOT NULL,
    "idealRange" TEXT,
    "category" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "indicator_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "score_thresholds" (
    "id" TEXT NOT NULL,
    "profile" "InvestorProfile" NOT NULL,
    "decision" "DecisionType" NOT NULL,
    "minScore" DOUBLE PRECISION NOT NULL,
    "emoji" TEXT NOT NULL,
    "desc" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "score_thresholds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_data_cache" (
    "id" TEXT NOT NULL,
    "ticker" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "rawData" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stock_data_cache_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_analyses" (
    "id" TEXT NOT NULL,
    "ticker" TEXT NOT NULL,
    "profile" "InvestorProfile" NOT NULL,
    "date" TEXT NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "decision" "DecisionType" NOT NULL,
    "emoji" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "analysisData" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_analyses_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "indicator_configs_profile_indicatorId_key" ON "indicator_configs"("profile", "indicatorId");

-- CreateIndex
CREATE UNIQUE INDEX "score_thresholds_profile_decision_key" ON "score_thresholds"("profile", "decision");

-- CreateIndex
CREATE UNIQUE INDEX "stock_data_cache_ticker_date_key" ON "stock_data_cache"("ticker", "date");

-- CreateIndex
CREATE INDEX "stock_analyses_ticker_profile_date_idx" ON "stock_analyses"("ticker", "profile", "date");
