// frontend/src/types/index.ts
// Único arquivo de tipos do frontend.

export type ProfileName  = "GENERICO" | "CONSERVADOR" | "MODERADO" | "AGRESSIVO";
export type DecisionType = "COMPRA_FORTE" | "COMPRA" | "MANTER" | "VENDA" | "VENDA_FORTE";

// Mapa de label por perfil — exportado diretamente daqui, não de composables
export const PROFILE_LABELS: Record<ProfileName, string> = {
  GENERICO:    "Genérico",
  CONSERVADOR: "Conservador",
  MODERADO:    "Moderado",
  AGRESSIVO:   "Agressivo",
};

export const PROFILE_ICONS: Record<ProfileName, string> = {
  GENERICO:    "📊",
  CONSERVADOR: "🛡️",
  MODERADO:    "⚖️",
  AGRESSIVO:   "🚀",
};

export const PROFILE_DESCS: Record<ProfileName, string> = {
  GENERICO:    "Análise fundamentalista básica",
  CONSERVADOR: "Muito exigente para comprar",
  MODERADO:    "Perfil default — equilibrado",
  AGRESSIVO:   "Compra cedo, tolera risco",
};

export const ALL_PROFILES: ProfileName[] = ["GENERICO", "CONSERVADOR", "MODERADO", "AGRESSIVO"];

export const INDICATOR_LABELS: Record<string, string> = {
  pl:             "P/L",
  pvp:            "P/VP",
  roe:            "ROE",
  margemLiquida:  "Margem Líquida",
  dividaEbitda:   "Dívida/EBITDA",
  earningsGrowth: "Crescimento Lucro",
  dividendYield:  "Dividend Yield",
  rsi:            "RSI (14)",
  precoVsMMs:     "Preço vs MMs",
  macd:           "MACD",
  tendencia:      "Tendência",
  breakout:       "Breakout 52s",
  volatilidade:   "Volatilidade",
  drawdown:       "Drawdown Máx.",
  beta:           "Beta",
};

// ─── Configurações (retorno do backend) ───────────────────────

export interface IndicatorConfig {
  id:          string;
  profile:     ProfileName;
  indicatorId: string;
  weight:      number;
  idealRange:  string | null;
  category:    string | null;
  isActive:    boolean;
}

export interface ScoreThreshold {
  id:       string;
  profile:  ProfileName;
  decision: DecisionType;
  minScore: number;
  emoji:    string;
  desc:     string;
}

export interface ProfileConfig {
  profile:    ProfileName;
  indicators: IndicatorConfig[];
  thresholds: ScoreThreshold[];
}

// ─── Resultado de análise ─────────────────────────────────────

export interface ScoreDetail {
  id:           string;
  peso:         number;
  idealRange:   string | null;
  rawPts:       number | null;
  disponivel:   boolean;
  pesoAjustado: number;
  contribuicao: number;
}

export interface ProfileScore {
  perfil:              ProfileName;
  score:               number;
  decision:            DecisionType;
  emoji:               string;
  desc:                string;
  detalhes:            ScoreDetail[];
  indicadoresAusentes: string[];
}

export interface AnalysisResult {
  meta: {
    ticker:    string;
    currency:  string;
    shortName: string | null;
    sector:    string | null;
    industry:  string | null;
    fetchedAt: string;
  };
  technical: {
    price:      number;
    dataRange:  { from: string; to: string };
    rsi:        { value: number | null; interpretation: string };
    movingAverages: {
      price: number;
      mm20: number | null; mm50: number | null; mm200: number | null;
      pctVsMM20: number | null; pctVsMM50: number | null; pctVsMM200: number | null;
      crossAlert: string | null; interpretation: string;
    };
    macd:       { macdLine: number | null; signalLine: number | null; histogram: number | null; interpretation: string };
    trend:      { label: string; slope20Pct: number | null; vol20Pct: number | null; adxProxy: number | null };
    volatility: { annualizedPct: number | null; label: string; interpretation: string };
    maxDrawdown:{ maxDrawdownPct: number | null; peakDate: string | null; troughDate: string | null; interpretation: string };
    breakout52w:{ high52w: number | null; low52w: number | null; price: number; positionInRangePct: number | null; label: string; interpretation: string };
    liquidity:  { mainFormatted: string; score: { label: string; desc: string }; trend: string | null };
  } | null;
  fundamental: {
    pl:            { value: number | null; tipo: string; interpretation: string };
    pvp:           { value: number | null; interpretation: string };
    roe:           { value: number | null; unit: string; interpretation: string };
    margemLiquida: { value: number | null; unit: string; interpretation: string };
    dividaEbitda:  { value: number | null; interpretation: string };
    earningsGrowth:{ value: number | null; unit: string; tipo: string; interpretation: string };
    dividendYield: { value: number | null; unit: string; dpa: number | null; label: string; interpretation: string; alerta: string | null };
    beta:          { value: number | null; perfil: string; label: string; interpretation: string };
    payout:        { value: number | null; unit: string; label: string; interpretation: string; alerta: string | null };
  } | null;
  fairPrice: {
    inputs:   { lpa: number | null; vpa: number | null; dpa: number | null };
    graham:   { price: number | null; upside: number | null; valid: boolean; reason: string; classification: { label: string; desc: string } };
    bazin:    { price: number | null; upside: number | null; valid: boolean; reason: string; classification: { label: string; desc: string } };
    consenso: { price: number | null; upside: number | null; modelsUsed: number; classification: { label: string; desc: string } };
  } | null;
  recommendations: {
    available:               boolean;
    recommendationKey?:      string | null;
    numberOfAnalystOpinions: number | null;
    currentScore:            number | null;
    currentClassify:         { label: string; desc: string; color: string };
    tendencia:               { label: string; emoji: string; desc: string; delta: number } | null;
    scores:                  { period: string; score: number | null }[];
    trends:                  any[];
  };
  scores: Record<ProfileName, ProfileScore>;
}
