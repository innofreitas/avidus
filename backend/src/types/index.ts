// backend/src/types/index.ts
// Único arquivo de tipos do backend. Todos os módulos importam daqui.

export type InvestorProfile = "GENERICO" | "CONSERVADOR" | "MODERADO" | "AGRESSIVO";
export type DecisionType    = "COMPRA_FORTE" | "COMPRA" | "MANTER" | "VENDA" | "VENDA_FORTE";
export type IndicatorCategory = "FUNDAMENTALISTA" | "TECNICO" | "RISCO";

export const ALL_PROFILES: InvestorProfile[] = ["GENERICO", "CONSERVADOR", "MODERADO", "AGRESSIVO"];

export interface IndicatorConfigInput {
  indicatorId: string;
  category:    IndicatorCategory;
  weight:      number;
  idealRange?: string;
  isActive?:   boolean;
}

export interface IndicatorConfigRow extends IndicatorConfigInput {
  id:        string;
  profile:   InvestorProfile;
  isActive:  boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface ScoreThresholdInput {
  minScore: number;
  decision: DecisionType;
  emoji:    string;
  desc:     string;
}

export interface ScoreThresholdRow extends ScoreThresholdInput {
  id:        string;
  profile:   InvestorProfile;
  createdAt: Date;
  updatedAt: Date;
}

export interface SectorFactorWeightInput {
  factor: string;
  weight: number;
}

export interface SectorFactorWeightRow extends SectorFactorWeightInput {
  id:        string;
  profile:   InvestorProfile;
  createdAt: Date;
  updatedAt: Date;
}

export interface ProfileConfig {
  profile:              InvestorProfile;
  indicators:           IndicatorConfigRow[];
  thresholds:           ScoreThresholdRow[];
  sectorFactorWeights:  SectorFactorWeightRow[];
}

export interface ScoreDetail {
  id:           string;
  peso:         number;
  idealRange:   string | null;
  rawPts:       number | null;
  disponivel:   boolean;
  pesoAjustado: number;
  contribuicao: number;
}

export interface ScoreResult {
  perfil:               InvestorProfile;
  score:                number;
  decision:             DecisionType;
  emoji:                string;
  desc:                 string;
  detalhes:             ScoreDetail[];
  indicadoresAusentes:  string[];
}
