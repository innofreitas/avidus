import prisma from "../config/database";
import type { InvestorProfile, ScoreResult, ScoreDetail, DecisionType } from "../types";

// ─── Helpers ──────────────────────────────────────────────────

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

function classify(value: number | null, ranges: { min: number; label: string }[]): { label: string } {
  if (value == null) return { label: "N/A" };
  return ranges.find((r) => value >= r.min) ?? ranges.at(-1)!;
}

const mean = (arr: number[]) => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;

// ─── Análise Técnica ──────────────────────────────────────────

function calcRSI(rsiValue: number | null) {
  if (rsiValue == null) return { value: null, interpretation: "Dados insuficientes" };
  const interpretation =
    rsiValue >= 70 ? "🔴 Sobrecomprado" :
    rsiValue <= 30 ? "🟢 Sobrevendido"  :
    rsiValue >= 60 ? "🟡 Levemente alto" : "🟢 Neutro";
  return { value: rsiValue, interpretation };
}

function calcMovingAverages(closes: number[], mm20: number | null, mm50: number | null, mm200: number | null) {
  const price = closes.at(-1)!;
  const pct   = (mm: number | null) => mm ? +((price / mm - 1) * 100).toFixed(2) : null;

  const alerts: string[] = [];
  if (mm20 && mm50) {
    if (mm20 > mm50 * 1.01) alerts.push("MM20 acima da MM50 — tendência de curto prazo positiva");
    else if (mm20 < mm50 * 0.99) alerts.push("MM20 abaixo da MM50 — possível perda de momentum");
  }
  if (mm50 && mm200) {
    if (mm50 > mm200 * 1.01) alerts.push("Golden Cross ativo (MM50 > MM200)");
    else if (mm50 < mm200 * 0.99) alerts.push("Death Cross ativo (MM50 < MM200)");
  }

  return {
    price: +price.toFixed(2),
    mm20:  mm20  ? +mm20.toFixed(2)  : null,
    mm50:  mm50  ? +mm50.toFixed(2)  : null,
    mm200: mm200 ? +mm200.toFixed(2) : null,
    pctVsMM20:  pct(mm20),
    pctVsMM50:  pct(mm50),
    pctVsMM200: pct(mm200),
    crossAlert: alerts.join(" | ") || null,
    interpretation:
      mm200 && price > mm200 ? "Preço acima da MM200 — tendência de longo prazo positiva" :
      mm200 ? "Preço abaixo da MM200 — cautela no longo prazo" : "MM200 indisponível",
  };
}

function calcMACD(macd: number | null, signal: number | null, hist: number | null) {
  if (macd == null || signal == null || hist == null) return { macdLine: null, signalLine: null, histogram: null, interpretation: "Dados insuficientes" };
  return {
    macdLine: macd, signalLine: signal, histogram: hist,
    interpretation:
      macd > 0 && hist > 0 ? "🟢 Bullish — MACD positivo e acelerando" :
      macd > 0 && hist < 0 ? "🟡 Bullish fraco — MACD positivo mas desacelerando" :
      macd < 0 && hist < 0 ? "🔴 Bearish — MACD negativo e acelerando queda" :
      "🟡 Bearish fraco — MACD negativo mas recuperando",
  };
}

function calcTrend(closes: number[], mm20: number | null, mm50: number | null, mm200: number | null, slope20Pct: number | null, adxProxy: number | null) {
  const price   = closes.at(-1)!;
  const vol20   = closes.slice(-20);
  const vol20Pct = vol20.length > 1
    ? +(mean(vol20.slice(1).map((c, i) => Math.abs(c / vol20[i] - 1))) * 100).toFixed(2)
    : null;

  const score =
    (mm20  && price > mm20  ? 1 : -1) +
    (mm50  && price > mm50  ? 1 : -1) +
    (mm200 && price > mm200 ? 1 : -1) +
    (slope20Pct != null ? (slope20Pct > 0.1 ? 2 : slope20Pct < -0.1 ? -2 : 0) : 0);

  const label =
    score >= 4  ? "🚀 Alta forte" :
    score >= 2  ? "📈 Alta"       :
    score >= 0  ? "➡️ Lateral"   :
    score >= -2 ? "📉 Baixa"     :
    "💥 Baixa forte";

  return { label, slope20Pct: slope20Pct ? +slope20Pct.toFixed(3) : null, vol20Pct, adxProxy: adxProxy ? +adxProxy.toFixed(2) : null };
}

function calcVolatility(logReturns: number[]) {
  if (logReturns.length < 20) return { annualizedPct: null, label: "Dados insuficientes", interpretation: "N/A" };
  const slice  = logReturns.slice(-252);
  const avg    = mean(slice);
  const std    = Math.sqrt(mean(slice.map((r) => (r - avg) ** 2)));
  const annual = +(std * Math.sqrt(252) * 100).toFixed(2);
  const label  =
    annual < 15 ? "🟢 Baixa"    :
    annual < 30 ? "🟡 Moderada" :
    annual < 50 ? "🟠 Alta"     : "🔴 Muito alta";
  return { annualizedPct: annual, label, interpretation: `${annual}% ao ano` };
}

function calcDrawdown(dd: { maxPct: number; peakDate: string; troughDate: string }) {
  const interpretation =
    dd.maxPct < 10 ? "🟢 Baixo risco histórico" :
    dd.maxPct < 25 ? "🟡 Risco moderado"        :
    dd.maxPct < 45 ? "🟠 Risco elevado"         : "🔴 Risco muito alto";
  return { maxDrawdownPct: dd.maxPct, peakDate: dd.peakDate, troughDate: dd.troughDate, interpretation };
}

function calcBreakout(candles: any[], high52w: number | null, low52w: number | null) {
  const price = candles.at(-1)?.close ?? 0;
  if (!high52w || !low52w) return { high52w: null, low52w: null, price, positionInRangePct: null, label: "Sem dados", interpretation: "N/A" };
  const range = high52w - low52w;
  const pos   = range > 0 ? +((price - low52w) / range * 100).toFixed(1) : null;
  const label =
    pos == null ? "N/A" :
    pos >= 90   ? "🚀 Próximo da máxima 52s" :
    pos >= 70   ? "📈 Força de alta"         :
    pos >= 40   ? "➡️ Região mediana"        :
    pos >= 20   ? "📉 Fraqueza relativa"     : "🔴 Próximo da mínima 52s";
  return { high52w: +high52w.toFixed(2), low52w: +low52w.toFixed(2), price: +price.toFixed(2), positionInRangePct: pos, label, interpretation: pos ? `Posição: ${pos}% da faixa 52 semanas` : "N/A" };
}

function calcLiquidity(lmd: { d21: number | null; d63: number | null; d252: number | null }, currency: string) {
  const val = lmd.d63 ?? lmd.d21 ?? lmd.d252;
  if (!val) return { mainFormatted: "N/A", score: { label: "Sem dados", desc: "Dados insuficientes" }, trend: null };
  const sym = currency === "USD" ? "US$" : "R$";
  const fmt =
    val >= 1e9 ? `${sym} ${(val / 1e9).toFixed(2)}B` :
    val >= 1e6 ? `${sym} ${(val / 1e6).toFixed(2)}M` :
    val >= 1e3 ? `${sym} ${(val / 1e3).toFixed(1)}K` : `${sym} ${val.toFixed(0)}`;
  const score =
    val >= 100e6 ? { label: "🟢 Alta liquidez",     desc: "Fácil de negociar" }     :
    val >= 10e6  ? { label: "🟡 Liquidez razoável", desc: "Negociação adequada" }    :
    val >= 1e6   ? { label: "🟠 Liquidez baixa",    desc: "Possível dificuldade"  }  :
                   { label: "🔴 Liquidez muito baixa", desc: "Risco de iliquidez" };
  return { mainFormatted: fmt, score, trend: null };
}

export function analyzeTechnical(tech: any, currency = "BRL") {
  const { closes, candles, mm20, mm50, mm200, slope20Pct, high52w, low52w, logReturns, adxProxy, drawdown, lmd } = tech;
  return {
    price:          +closes.at(-1).toFixed(2),
    dataRange:      tech.dataRange,
    rsi:            calcRSI(tech.rsi14),
    movingAverages: calcMovingAverages(closes, mm20, mm50, mm200),
    macd:           calcMACD(tech.macd, tech.macdSignal, tech.macdHist),
    trend:          calcTrend(closes, mm20, mm50, mm200, slope20Pct, adxProxy),
    volatility:     calcVolatility(logReturns),
    maxDrawdown:    calcDrawdown(drawdown),
    breakout52w:    calcBreakout(candles, high52w, low52w),
    liquidity:      calcLiquidity(lmd, currency),
  };
}

// ─── Análise Fundamentalista ──────────────────────────────────

export function analyzeFundamental(fund: any) {
  const { valuation, rentabilidade, divida, crescimento, dividendos, risco } = fund;

  // P/L
  const plVal = valuation?.trailingPE ?? valuation?.forwardPE ?? null;
  const pl = {
    value: plVal != null ? +plVal.toFixed(2) : null,
    tipo:  valuation?.trailingPE != null ? "Trailing P/E" : valuation?.forwardPE != null ? "Forward P/E" : "N/A",
    interpretation: classify(plVal, [
      { min: 50,        label: "🔴 Extremamente alto" },
      { min: 30,        label: "🔴 Muito alto"        },
      { min: 20,        label: "🟠 Elevado"           },
      { min: 10,        label: "🟡 Razoável"          },
      { min: 1,         label: "🟢 Barato"            },
      { min: -Infinity, label: "⚠️ PL negativo"       },
    ]).label,
  };

  // P/VP
  const pvpVal = valuation?.priceToBook ?? null;
  const pvp = {
    value: pvpVal != null ? +pvpVal.toFixed(2) : null,
    interpretation: classify(pvpVal, [
      { min: 8,         label: "🔴 Muito alto"       },
      { min: 4,         label: "🔴 Alto"             },
      { min: 2,         label: "🟠 Levemente alto"   },
      { min: 0.8,       label: "🟢 Ideal"            },
      { min: 0,         label: "🟡 Possível valor"   },
      { min: -Infinity, label: "⚠️ VPA negativo"     },
    ]).label,
  };

  // ROE
  const roeVal = rentabilidade?.returnOnEquity != null ? rentabilidade.returnOnEquity * 100 : null;
  const roe = {
    value: roeVal != null ? +roeVal.toFixed(2) : null,
    unit: "%",
    interpretation: classify(roeVal, [
      { min: 25,        label: "🚀 Excelente"   },
      { min: 15,        label: "🟢 Muito bom"   },
      { min: 10,        label: "🟡 Razoável"    },
      { min: 5,         label: "🟠 Fraco"       },
      { min: 0,         label: "🔴 Muito fraco" },
      { min: -Infinity, label: "🔴 Negativo"    },
    ]).label,
  };

  // Margem Líquida
  const mlVal = rentabilidade?.profitMargins != null ? rentabilidade.profitMargins * 100 : null;
  const margemLiquida = {
    value: mlVal != null ? +mlVal.toFixed(2) : null,
    unit: "%",
    interpretation: classify(mlVal, [
      { min: 20,        label: "🟢 Excelente"    },
      { min: 10,        label: "🟢 Boa"          },
      { min: 5,         label: "🟡 Razoável"     },
      { min: 0,         label: "🟠 Fraca"        },
      { min: -Infinity, label: "🔴 Negativa"     },
    ]).label,
  };

  // Dívida/EBITDA
  const deVal = divida?.totalDebt != null && divida?.ebitda != null && divida.ebitda > 0
    ? divida.totalDebt / divida.ebitda : null;
  const dividaEbitda = {
    value: deVal != null ? +deVal.toFixed(2) : null,
    interpretation: classify(deVal, [
      { min: 5,         label: "🔴 Endividamento crítico" },
      { min: 3,         label: "🔴 Alto"                  },
      { min: 2,         label: "🟠 Elevado"               },
      { min: 1,         label: "🟡 Moderado"              },
      { min: 0,         label: "🟢 Saudável"              },
      { min: -Infinity, label: "⚠️ Negativo"              },
    ]).label,
  };

  // Crescimento de Lucros
  const egVal = crescimento?.earningsGrowthYoY != null ? crescimento.earningsGrowthYoY * 100 : null;
  const earningsGrowth = {
    value: egVal != null ? +egVal.toFixed(2) : null,
    unit: "%a.a.",
    tipo: "YoY",
    interpretation: classify(egVal, [
      { min: 25,        label: "🚀 Crescimento acelerado" },
      { min: 15,        label: "🟢 Crescimento forte"     },
      { min: 8,         label: "🟢 Crescimento saudável"  },
      { min: 0,         label: "🟡 Crescimento lento"     },
      { min: -Infinity, label: "🔴 Queda de lucros"       },
    ]).label,
  };

  // Dividend Yield
  const dyVal = dividendos?.dividendYield != null ? dividendos.dividendYield * 100 : null;
  const dividendYield = {
    value: dyVal != null ? +dyVal.toFixed(2) : null,
    unit: "%",
    dpa: dividendos?.dividendRate ?? null,
    label: classify(dyVal, [
      { min: 8,         label: "🟢 DY excelente"        },
      { min: 5,         label: "🟢 DY alto"             },
      { min: 3,         label: "🟡 DY razoável"         },
      { min: 1,         label: "🟠 DY baixo"            },
      { min: 0,         label: "⚪ Sem dividendos"      },
      { min: -Infinity, label: "N/A"                    },
    ]).label,
    interpretation: dyVal != null ? `${dyVal.toFixed(2)}% ao ano` : "Sem dados de dividendos",
    alerta: dyVal != null && dyVal > 15 ? "⚠️ DY muito alto — verificar sustentabilidade" : null,
  };

  // Beta
  const betaVal = risco?.beta ?? null;
  const beta = {
    value: betaVal != null ? +betaVal.toFixed(2) : null,
    perfil: classify(betaVal, [
      { min: 1.5,       label: "🔴 Muito agressivo" },
      { min: 1.2,       label: "🟠 Agressivo"       },
      { min: 0.8,       label: "🟢 Moderado"        },
      { min: 0,         label: "🟡 Defensivo"       },
      { min: -Infinity, label: "⚠️ Beta negativo"   },
    ]).label,
    label: betaVal != null ? `β = ${betaVal.toFixed(2)}` : "N/A",
    interpretation: betaVal != null
      ? betaVal > 1 ? `${betaVal.toFixed(2)}x mais volátil que o mercado` : `${betaVal.toFixed(2)}x menos volátil que o mercado`
      : "Sem dados",
  };

  // Payout
  const poVal = dividendos?.payoutRatio != null ? dividendos.payoutRatio * 100 : null;
  const payout = {
    value: poVal != null ? +poVal.toFixed(2) : null,
    unit: "%",
    label: classify(poVal, [
      { min: 100,       label: "🔴 Insustentável"  },
      { min: 80,        label: "🟠 Muito alto"     },
      { min: 60,        label: "🟡 Alto"           },
      { min: 30,        label: "🟢 Saudável"       },
      { min: 0,         label: "🟡 Baixo"          },
      { min: -Infinity, label: "N/A"               },
    ]).label,
    interpretation: poVal != null ? `${poVal.toFixed(1)}% dos lucros distribuídos` : "Sem dados",
    alerta: poVal != null && poVal > 100 ? "⚠️ Payout acima de 100% — insustentável" : null,
  };

  return { pl, pvp, roe, margemLiquida, dividaEbitda, earningsGrowth, dividendYield, beta, payout };
}

// ─── Preço Justo ──────────────────────────────────────────────

function classifyUpside(upside: number | null) {
  if (upside == null) return { label: "⚪ Sem dados", desc: "Não foi possível calcular" };
  if (upside >=  50) return { label: "🚀 Muito atrativo",      desc: "Margem de segurança elevada"         };
  if (upside >=  20) return { label: "🟢 Atrativo",            desc: "Boa margem de segurança"             };
  if (upside >=   5) return { label: "🟡 Levemente atrativo",  desc: "Pequena margem de segurança"         };
  if (upside >=  -5) return { label: "⚪ Neutro / Justo",      desc: "Preço próximo ao valor estimado"     };
  if (upside >= -20) return { label: "🟠 Levemente caro",      desc: "Preço acima do justo"                };
  if (upside >= -40) return { label: "🔴 Caro",                desc: "Preço significativamente acima"      };
  return               { label: "🔴 Muito caro",               desc: "Preço muito acima do justo"          };
}

export function analyzeFairPrice(valuation: any, price: number, dividendos?: any) {
  const lpa = valuation?.trailingEps  ?? null;
  const vpa = valuation?.bookValue    ?? null;
 
  // Graham — usa LPA e VPA
  let graham: any;
  if (lpa == null || vpa == null) graham = { price: null, upside: null, valid: false, reason: "LPA ou VPA não disponíveis" };
  else if (lpa <= 0) graham = { price: null, upside: null, valid: false, reason: `LPA negativo (${lpa.toFixed(2)})` };
  else if (vpa <= 0) graham = { price: null, upside: null, valid: false, reason: `VPA negativo (${vpa.toFixed(2)})` };
  else {
    const pj = Math.sqrt(22.5 * lpa * vpa);
    graham = { price: +pj.toFixed(2), upside: +((pj / price - 1) * 100).toFixed(2), valid: true, reason: `√(22.5 × ${lpa.toFixed(2)} × ${vpa.toFixed(2)})` };
  }
 
  // Bazin — usa trailingAnnualDividendRate (dividendo real pago nos últimos 12 meses)
  // Fórmula: preçoJusto = trailingAnnualDividendRate / 0.06
  // Fonte: quote.trailingAnnualDividendRate (yahoo-finance2)
  const dividend12m = dividendos?.trailingAnnualDividendRate ?? valuation?.dividendRate ?? null;
  let bazin: any;
  if (!dividend12m || dividend12m <= 0) {
    bazin = { price: null, upside: null, valid: false, reason: dividend12m == null ? "Dividendo 12m não disponível" : "Dividendo 12m = 0" };
  } else {
    const pt = dividend12m / 0.06;
    bazin = { price: +pt.toFixed(2), upside: +((pt / price - 1) * 100).toFixed(2), valid: true, reason: `${dividend12m.toFixed(4)} / 6%` };
  }
 
  graham.classification = classifyUpside(graham.upside);
  bazin.classification  = classifyUpside(bazin.upside);
 
  const validPrices = [graham, bazin].filter((m) => m.valid).map((m) => m.price);
  const consensoPrice  = validPrices.length ? +(validPrices.reduce((a, b) => a + b, 0) / validPrices.length).toFixed(2) : null;
  const consensoUpside = consensoPrice ? +((consensoPrice / price - 1) * 100).toFixed(2) : null;
  const consenso = { price: consensoPrice, upside: consensoUpside, modelsUsed: validPrices.length, classification: classifyUpside(consensoUpside) };
 
  return { inputs: { lpa, vpa, dividend12m }, graham, bazin, consenso };
}

// ─── Recomendações ────────────────────────────────────────────

export function analyzeRecommendations(recs: any) {
  if (!recs?.recommendationKey) return { available: false, currentClassify: { label: "Sem consenso", desc: "", color: "#6b7280" }, numberOfAnalystOpinions: null, currentScore: null, tendencia: null, scores: [], trends: recs?.trends ?? [] };

  const keyMap: Record<string, { label: string; score: number; color: string; desc: string }> = {
    "strong_buy":  { label: "COMPRA FORTE", score: 2,  color: "#16a34a", desc: "Forte consenso de compra"   },
    "buy":         { label: "COMPRA",       score: 1,  color: "#22c55e", desc: "Consenso de compra"         },
    "hold":        { label: "MANTER",       score: 0,  color: "#eab308", desc: "Consenso neutro"            },
    "underperform":{ label: "VENDA",        score: -1, color: "#f97316", desc: "Consenso de venda"          },
    "sell":        { label: "VENDA FORTE",  score: -2, color: "#dc2626", desc: "Forte consenso de venda"    },
  };

  const cur = keyMap[recs.recommendationKey] ?? { label: recs.recommendationKey.toUpperCase(), score: 0, color: "#6b7280", desc: "" };

  const trends = (recs.trends ?? []);
  const scores = trends.map((t: any) => {
    const total = (t.strongBuy ?? 0) + (t.buy ?? 0) + (t.hold ?? 0) + (t.sell ?? 0) + (t.strongSell ?? 0);
    if (!total) return { period: t.period, score: null };
    const s = ((t.strongBuy ?? 0) * 2 + (t.buy ?? 0) - (t.sell ?? 0) - (t.strongSell ?? 0) * 2) / total;
    return { period: t.period, score: +s.toFixed(2) };
  }).filter((s: any) => s.score != null);

  let tendencia = null;
  if (scores.length >= 2) {
    const delta = scores.at(-1).score - scores.at(-2).score;
    tendencia = {
      label: delta > 0.3 ? "Melhorando"   : delta < -0.3 ? "Piorando"  : "Estável",
      emoji: delta > 0.3 ? "📈"           : delta < -0.3 ? "📉"        : "➡️",
      desc:  delta > 0.3 ? "Analistas mais otimistas recentemente" : delta < -0.3 ? "Analistas mais pessimistas recentemente" : "Sem mudança relevante de consenso",
      delta: +delta.toFixed(2),
    };
  }

  return {
    available: true,
    recommendationKey: recs.recommendationKey,
    numberOfAnalystOpinions: recs.numberOfAnalystOpinions,
    currentScore: cur.score,
    currentClassify: { label: cur.label, desc: cur.desc, color: cur.color },
    tendencia,
    scores,
    trends,
  };
}

// ─── Score por perfil (DB-driven) ────────────────────────────

type RawScoreFn = (val: any, perfil: InvestorProfile) => number | null;

const RAW: Record<string, RawScoreFn> = {
  pl: (v) => v == null ? null : v <= 0 ? 5 : clamp(100 - (v - 10) * 3, 0, 100),
  pvp: (v) => v == null ? null : v <= 0 ? 5 : clamp(100 - (v - 1) * 20, 0, 100),
  roe: (v) => v == null ? null : clamp(v * 4, 0, 100),
  margemLiquida: (v) => v == null ? null : clamp(v * 5, 0, 100),
  dividaEbitda: (v) => v == null ? null : v < 0 ? 40 : clamp(100 - v * 20, 0, 100),
  earningsGrowth: (v) => v == null ? null : clamp(50 + v * 2, 0, 100),
  dividendYield: (v, p) => {
    if (v == null) return null;
    if (p === "AGRESSIVO") return clamp(v * 6, 0, 100);
    if (p === "CONSERVADOR") return clamp(v * 10, 0, 100);
    return clamp(v * 8, 0, 100);
  },
  rsi: (v) => v == null ? null : v >= 30 && v <= 70 ? 100 - Math.abs(v - 50) * 2 : v < 30 ? 90 : 10,
  precoVsMMs: (v) => {
    if (!v) return null;
    const { pctVsMM20: p20, pctVsMM50: p50, pctVsMM200: p200 } = v;
    const s = [p20, p50, p200].filter((x) => x != null).map((x) => x! > 0 ? 80 : 30);
    return s.length ? mean(s) : null;
  },
  macd: (v) => v == null ? null : v.histogram == null ? null : v.histogram > 0 ? 80 : 30,
  tendencia: (v) => {
    if (!v) return null;
    const label: string = v.label ?? "";
    if (label.includes("forte")) return 90;
    if (label.includes("Alta"))  return 70;
    if (label.includes("Lateral")) return 50;
    if (label.includes("Baixa forte")) return 10;
    return 30;
  },
  breakout: (v) => v?.positionInRangePct == null ? null : clamp(v.positionInRangePct, 0, 100),
  volatilidade: (v, p) => {
    if (v == null) return null;
    if (p === "AGRESSIVO") return clamp(v * 2, 0, 100);
    if (p === "CONSERVADOR") return clamp(100 - v * 2, 0, 100);
    return clamp(100 - v, 0, 100);
  },
  drawdown: (v) => v == null ? null : clamp(100 - v * 1.5, 0, 100),
  beta: (v, p) => {
    if (v == null) return null;
    if (p === "AGRESSIVO")   return clamp(v * 50, 0, 100);
    if (p === "CONSERVADOR") return clamp(100 - Math.abs(v - 0.8) * 50, 0, 100);
    return clamp(100 - Math.abs(v - 1) * 30, 0, 100);
  },
};

async function calcScore(tech: any, fund: any, perfil: InvestorProfile): Promise<ScoreResult> {
  const cfg = await prisma.indicatorConfig.findMany({ where: { profile: perfil, isActive: true }, orderBy: { weight: "desc" } });
  const thr = await prisma.scoreThreshold.findMany({ where: { profile: perfil }, orderBy: { minScore: "desc" } });

  const getters: Record<string, () => number | null> = {
    pl:             () => RAW.pl(fund?.pl?.value, perfil),
    pvp:            () => RAW.pvp(fund?.pvp?.value, perfil),
    roe:            () => RAW.roe(fund?.roe?.value, perfil),
    margemLiquida:  () => RAW.margemLiquida(fund?.margemLiquida?.value, perfil),
    dividaEbitda:   () => RAW.dividaEbitda(fund?.dividaEbitda?.value, perfil),
    earningsGrowth: () => RAW.earningsGrowth(fund?.earningsGrowth?.value, perfil),
    dividendYield:  () => RAW.dividendYield(fund?.dividendYield?.value, perfil),
    rsi:            () => RAW.rsi(tech?.rsi?.value, perfil),
    precoVsMMs:     () => RAW.precoVsMMs(tech?.movingAverages, perfil),
    macd:           () => RAW.macd(tech?.macd, perfil),
    tendencia:      () => RAW.tendencia(tech?.trend, perfil),
    breakout:       () => RAW.breakout(tech?.breakout52w, perfil),
    volatilidade:   () => RAW.volatilidade(tech?.volatility?.annualizedPct, perfil),
    drawdown:       () => RAW.drawdown(tech?.maxDrawdown?.maxDrawdownPct, perfil),
    beta:           () => RAW.beta(fund?.beta?.value, perfil),
  };

  const detalhes = cfg.map((c) => {
    const rawPts = getters[c.indicatorId] ? getters[c.indicatorId]() : null;
    return { id: c.indicatorId, peso: c.weight, idealRange: c.idealRange ?? null, rawPts, disponivel: rawPts != null } as ScoreDetail & { disponivel: boolean };
  });

  const pesoTotal   = detalhes.reduce((s, d) => s + d.peso, 0);
  const pesoAusente = detalhes.filter((d) => !d.disponivel).reduce((s, d) => s + d.peso, 0);
  const pesoEfetivo = pesoTotal - pesoAusente || pesoTotal;

  let score = 0;
  const detalhesFinais: ScoreDetail[] = detalhes.map((d) => {
    if (!d.disponivel) return { ...d, pesoAjustado: 0, contribuicao: 0 };
    const pesoAdj  = d.peso * (pesoTotal / pesoEfetivo);
    const contrib  = (d.rawPts! / 100) * pesoAdj;
    score += contrib;
    return { ...d, pesoAjustado: +pesoAdj.toFixed(2), contribuicao: +contrib.toFixed(2) };
  });

  score = Math.min(100, Math.max(0, +score.toFixed(1)));
  const decisao = thr.find((t) => score >= t.minScore) ?? thr.at(-1)!;

  return {
    perfil, score,
    decision: decisao.decision as DecisionType,
    emoji: decisao.emoji,
    desc:  decisao.desc,
    detalhes: detalhesFinais,
    indicadoresAusentes: detalhes.filter((d) => !d.disponivel).map((d) => d.id),
  };
}

// ─── Orquestrador principal ───────────────────────────────────

export async function analyzeStock(rawData: Record<string, unknown>): Promise<Record<string, unknown>> {
  const { meta, technical, fundamental, recommendations } = rawData as any;
  const currency: string = (meta as any)?.currency ?? "BRL";

  let tech: any = null;
  let fund: any = null;

  if (technical) {
    try { tech = analyzeTechnical(technical, currency); }
    catch (e: any) { console.error("❌ analyzeTechnical:", e.message); }
  }
  if (fundamental) {
    try { fund = analyzeFundamental(fundamental); }
    catch (e: any) { console.error("❌ analyzeFundamental:", e.message); }
  }

  const fairPrice = tech && fund ? analyzeFairPrice((fundamental as any).valuation, tech.price, (fundamental as any).dividendos) : null;
  const recs      = analyzeRecommendations(recommendations);

  const profiles: InvestorProfile[] = ["GENERICO", "CONSERVADOR", "MODERADO", "AGRESSIVO"];
  const scores = Object.fromEntries(
    await Promise.all(profiles.map(async (p) => [p, await calcScore(tech, fund, p)]))
  );

  return { meta, technical: tech, fundamental: fund, fairPrice, recommendations: recs, scores };
}
