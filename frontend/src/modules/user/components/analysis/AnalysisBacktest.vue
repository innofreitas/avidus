<script setup lang="ts">
import { ref, computed, onMounted } from "vue";
import type { AnalysisResult } from "@/types";
import api from "@/shared/utils/api";
import { formatDate } from "@/shared/utils/formatters";
import { useThemeStore } from "@/shared/stores/themeStore";

// ─── Props / emits ────────────────────────────────────────────────────────────

interface AcaoRow {
  codigo: string;
  produto: string;
  quantidade: number | null;
  precoFechamento: number | null;
  valorAtualizado: number | null;
  recomendacao: { loading: boolean; error: string | null; result: AnalysisResult | null } | null;
}

const props = defineProps<{ acoes: AcaoRow[] }>();
const emit  = defineEmits<{ (e: "close"): void }>();

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface TickerBacktest {
  ticker: string;
  period: { from: string; to: string; days: number };
  cagr: number | null;
  totalReturn: number | null;
  sharpe: number | null;
  volatility: number | null;
  maxDrawdown: number | null;
  alpha: number | null;
  beta: number | null;
  ifr: number | null;
  equityCurve: Array<{ date: string; value: number }>;
}

interface PortfolioMetrics {
  cagr: number | null;
  totalReturn: number | null;
  sharpe: number | null;
  volatility: number | null;
  maxDrawdown: number | null;
  alpha: number | null;
  beta: number | null;
}

interface BacktestResult {
  portfolio: PortfolioMetrics;
  portfolioEquityCurve: Array<{ date: string; value: number; ibov: number }>;
  tickers: TickerBacktest[];
  ibovCurve: Array<{ date: string; value: number }>;
  period: { from: string; to: string; days: number };
}

// ─── Tema ─────────────────────────────────────────────────────────────────────

const { isDark } = useThemeStore();

// ─── Estado ───────────────────────────────────────────────────────────────────

type Tab = "portfolio" | "ativos" | "grafico" | "insights";
const activeTab     = ref<Tab>("portfolio");
const loading       = ref(false);
const error         = ref<string | null>(null);
const result        = ref<BacktestResult | null>(null);
const visibleSeries = ref<Set<string>>(new Set());

function toggleSeries(key: string) {
  const s = new Set(visibleSeries.value);
  if (s.has(key)) s.delete(key);
  else s.add(key);
  visibleSeries.value = s;
}

// Ordenação e filtro da tabela de ativos
type SortKey = "ticker" | "cagr" | "totalReturn" | "sharpe" | "volatility" | "maxDrawdown" | "alpha" | "ifr";
const sortKey      = ref<SortKey>("cagr");
const sortDir      = ref<1 | -1>(-1);
const filterAtivos = ref("");

function setSort(key: SortKey) {
  if (sortKey.value === key) sortDir.value = sortDir.value === 1 ? -1 : 1;
  else { sortKey.value = key; sortDir.value = -1; }
}

// ─── Dados derivados ──────────────────────────────────────────────────────────

const acoesSemCache = computed(() =>
  props.acoes.filter(a => a.recomendacao?.result == null).map(a => a.codigo)
);

const tickersSorted = computed(() => {
  if (!result.value) return [];
  const q = filterAtivos.value.trim().toUpperCase();
  return [...result.value.tickers]
    .filter(t => !q || t.ticker.includes(q))
    .sort((a, b) => {
      const va = a[sortKey.value] as number | null ?? -Infinity;
      const vb = b[sortKey.value] as number | null ?? -Infinity;
      if (sortKey.value === "ticker") return sortDir.value * String(a.ticker).localeCompare(String(b.ticker));
      return sortDir.value * ((va as number) - (vb as number));
    });
});

// ─── Cores do SVG (responsivas ao tema) ──────────────────────────────────────

const svgColors = computed(() => isDark
  ? { bg: "transparent", grid: "#374151", baseLine: "#4b5563", axis: "#9ca3af", portfolio: "#ffffff" }
  : { bg: "transparent", grid: "#e5e7eb", baseLine: "#d1d5db", axis: "#6b7280", portfolio: "#111827" }
);

// ─── Hover / tooltip ─────────────────────────────────────────────────────────

const svgRef   = ref<SVGSVGElement | null>(null);
const hoverIdx = ref<number | null>(null);
const mousePos = ref({ x: 0, y: 0 }); // px relativos ao elemento SVG

function onSvgMouseMove(e: MouseEvent) {
  const svg = svgRef.value;
  if (!svg || !chartData.value) return;
  const rect = svg.getBoundingClientRect();
  mousePos.value = { x: e.clientX - rect.left, y: e.clientY - rect.top };
  const pt = svg.createSVGPoint();
  pt.x = e.clientX; pt.y = e.clientY;
  const { x } = pt.matrixTransform(svg.getScreenCTM()!.inverse());
  const { n } = chartData.value;
  const t = (x - PAD.left) / (SVG_W - PAD.left - PAD.right);
  hoverIdx.value = Math.max(0, Math.min(n - 1, Math.round(t * (n - 1))));
}

function onSvgMouseLeave() { hoverIdx.value = null; }

const hoverData = computed(() => {
  const idx = hoverIdx.value;
  if (idx === null || !chartData.value) return null;
  const { portSampled, ibovSampled, tickerLines, minY, maxY, n } = chartData.value;
  const rng  = maxY - minY || 1;
  const toY  = (v: number) => PAD.top + (1 - (v - minY) / rng) * (SVG_H - PAD.top - PAD.bottom);
  const crossX = PAD.left + (idx / (n - 1)) * (SVG_W - PAD.left - PAD.right);

  type HoverSeries = { key: string; label: string; value: number; change: number; color: string; dotY: number; visible: boolean };
  const series: HoverSeries[] = [];

  const pp = portSampled[idx];
  if (pp) series.push({ key: "portfolio", label: "Portfólio", value: pp.value, change: pp.value - 100, color: svgColors.value.portfolio, dotY: toY(pp.value), visible: visibleSeries.value.has("portfolio") });

  const ip = ibovSampled[idx];
  if (ip) series.push({ key: "ibov", label: "iBovespa", value: ip.value, change: ip.value - 100, color: "#fb923c", dotY: toY(ip.value), visible: visibleSeries.value.has("ibov") });

  for (const line of tickerLines) {
    const tp = line.sampled[idx];
    if (tp) series.push({ key: line.ticker, label: line.ticker, value: tp.value, change: tp.value - 100, color: line.color, dotY: toY(tp.value), visible: visibleSeries.value.has(line.ticker) });
  }

  return { crossX, date: portSampled[idx]?.date ?? "", series };
});

const tooltipStyle = computed(() => {
  if (hoverIdx.value === null || !chartData.value) return {};
  const isRight = hoverIdx.value / (chartData.value.n - 1) > 0.55;
  return {
    left: isRight ? `${mousePos.value.x - 200}px` : `${mousePos.value.x + 14}px`,
    top:  `${Math.max(4, mousePos.value.y - 60)}px`,
  };
});

// ─── SVG do gráfico ───────────────────────────────────────────────────────────

const SVG_W = 800;
const SVG_H = 320;
const PAD   = { top: 16, right: 20, bottom: 40, left: 56 };

const TICKER_COLORS = [
  "#3b82f6", "#10b981", "#f59e0b", "#ef4444",
  "#8b5cf6", "#ec4899", "#14b8a6", "#f97316",
];

function buildPath(points: Array<{ date: string; value: number }>, minY: number, maxY: number): string {
  if (!points.length) return "";
  const n = points.length;
  const rng = maxY - minY || 1;
  const toX = (i: number) => PAD.left + (i / (n - 1)) * (SVG_W - PAD.left - PAD.right);
  const toY = (v: number) => PAD.top + (1 - (v - minY) / rng) * (SVG_H - PAD.top - PAD.bottom);
  return points.map((p, i) => `${i === 0 ? "M" : "L"}${toX(i).toFixed(1)},${toY(p.value).toFixed(1)}`).join(" ");
}

const chartData = computed(() => {
  if (!result.value?.portfolioEquityCurve.length) return null;

  const portCurve = result.value.portfolioEquityCurve;
  const ibovCurve = result.value.ibovCurve;

  // Subsample para não sobrecarregar o SVG (máx 150 pontos)
  const step = Math.max(1, Math.floor(portCurve.length / 150));
  const portSampled = portCurve.filter((_, i) => i % step === 0 || i === portCurve.length - 1);
  const ibovSampled = ibovCurve.filter((_, i) => i % step === 0 || i === ibovCurve.length - 1);

  const allValues = [
    ...portSampled.map(p => p.value),
    ...ibovSampled.map(p => p.value),
  ];

  // Inclui curvas individuais dos tickers (até 8)
  const tickerLines: Array<{ ticker: string; color: string; path: string; sampled: Array<{ date: string; value: number }> }> = [];
  const visibleTickers = result.value.tickers
    .filter(t => t.equityCurve.length >= 20)
    .slice(0, 8);

  const tickerSampled = new Map<string, Array<{ date: string; value: number }>>();
  for (const t of visibleTickers) {
    const s = t.equityCurve.filter((_, i) => i % step === 0 || i === t.equityCurve.length - 1);
    tickerSampled.set(t.ticker, s);
    allValues.push(...s.map(p => p.value));
  }

  const minY = Math.min(...allValues) * 0.98;
  const maxY = Math.max(...allValues) * 1.02;

  for (let i = 0; i < visibleTickers.length; i++) {
    const t   = visibleTickers[i];
    const s   = tickerSampled.get(t.ticker)!;
    tickerLines.push({ ticker: t.ticker, color: TICKER_COLORS[i % TICKER_COLORS.length], path: buildPath(s, minY, maxY), sampled: s });
  }

  // Eixo Y: ~5 marcas
  const yTicks: Array<{ y: number; label: string }> = [];
  const rng = maxY - minY;
  for (let i = 0; i <= 4; i++) {
    const val = minY + (i / 4) * rng;
    const yPos = PAD.top + (1 - (val - minY) / rng) * (SVG_H - PAD.top - PAD.bottom);
    yTicks.push({ y: yPos, label: val.toFixed(0) });
  }

  // Eixo X: ~5 datas
  const xTicks: Array<{ x: number; label: string }> = [];
  const n = portSampled.length;
  for (let i = 0; i <= 4; i++) {
    const idx = Math.round(i / 4 * (n - 1));
    const xPos = PAD.left + (idx / (n - 1)) * (SVG_W - PAD.left - PAD.right);
    xTicks.push({ x: xPos, label: portSampled[idx]?.date.slice(0, 7) ?? "" });
  }

  return {
    portPath:  buildPath(portSampled,  minY, maxY),
    ibovPath:  buildPath(ibovSampled,  minY, maxY),
    tickerLines,
    portSampled,
    ibovSampled,
    n,
    yTicks, xTicks,
    minY, maxY,
  };
});

// ─── Formatação ───────────────────────────────────────────────────────────────

function fmtPct(v: number | null, decimals = 1): string {
  if (v == null) return "—";
  return (v * 100).toFixed(decimals) + "%";
}

function fmtNum(v: number | null, decimals = 2): string {
  if (v == null) return "—";
  return v.toFixed(decimals);
}


function ifrLabel(v: number | null): string {
  if (v == null) return "—";
  if (v >= 70) return "Sobrecomprado";
  if (v <= 30) return "Sobrevendido";
  return "Neutro";
}

function ifrColor(v: number | null): string {
  if (v == null) return "text-gray-400";
  if (v >= 70) return "text-red-500";
  if (v <= 30) return "text-green-500";
  return "text-yellow-500";
}

function metricColor(v: number | null, higherIsBetter = true): string {
  if (v == null) return "text-gray-400";
  return (higherIsBetter ? v >= 0 : v <= 0) ? "text-green-500" : "text-red-500";
}

// ─── Insights ─────────────────────────────────────────────────────────────────

type InsightType = "positive" | "negative" | "warning" | "neutral";
interface Insight { type: InsightType; icon: string; title: string; body: string }

const insights = computed((): Insight[] => {
  if (!result.value) return [];
  const p       = result.value.portfolio;
  const tickers = result.value.tickers.filter(t => t.period.days > 0);
  const list: Insight[] = [];

  // ── CAGR
  if (p.cagr != null) {
    if (p.cagr >= 0.20)
      list.push({ type: "positive", icon: "🚀", title: "CAGR excepcional",
        body: `Crescimento anual composto de ${fmtPct(p.cagr)} — desempenho acima da maioria dos benchmarks de renda variável.` });
    else if (p.cagr >= 0.10)
      list.push({ type: "positive", icon: "📈", title: "CAGR sólido",
        body: `Retorno anual de ${fmtPct(p.cagr)}, superando a inflação com boa margem histórica.` });
    else if (p.cagr >= 0)
      list.push({ type: "warning", icon: "📊", title: "CAGR modesto",
        body: `Crescimento anual de ${fmtPct(p.cagr)} — abaixo do potencial típico de ações no longo prazo.` });
    else
      list.push({ type: "negative", icon: "📉", title: "CAGR negativo",
        body: `Portfólio perdeu ${fmtPct(Math.abs(p.cagr))} ao ano. Revisar tese de investimento dos ativos.` });
  }

  // ── Alpha vs iBovespa
  if (p.alpha != null) {
    if (p.alpha > 0.05)
      list.push({ type: "positive", icon: "🏆", title: "Alpha positivo forte",
        body: `${fmtPct(p.alpha)} de excesso de retorno sobre o esperado pelo CAPM — gestão ativa agrega valor significativo.` });
    else if (p.alpha > 0)
      list.push({ type: "positive", icon: "✅", title: "Alpha positivo",
        body: `Retorno ${fmtPct(p.alpha)} acima do esperado pelo risco assumido (CAPM com CDI 11,75%).` });
    else if (p.alpha > -0.05)
      list.push({ type: "warning", icon: "⚖️", title: "Alpha levemente negativo",
        body: `${fmtPct(Math.abs(p.alpha))} abaixo do esperado. Revise composição ou considere gestão passiva.` });
    else
      list.push({ type: "negative", icon: "⚠️", title: "Alpha negativo relevante",
        body: `Portfólio entregou ${fmtPct(Math.abs(p.alpha))} a menos do que o risco assumido justificaria. Um ETF de iBovespa teria sido mais eficiente.` });
  }

  // ── Sharpe
  if (p.sharpe != null) {
    if (p.sharpe >= 1.5)
      list.push({ type: "positive", icon: "💎", title: "Sharpe excepcional",
        body: `Índice de Sharpe de ${fmtNum(p.sharpe)} — cada unidade de risco é excepcionalmente bem recompensada.` });
    else if (p.sharpe >= 1)
      list.push({ type: "positive", icon: "👍", title: "Sharpe bom",
        body: `Sharpe de ${fmtNum(p.sharpe)} — boa relação risco-retorno. Referência de qualidade é acima de 1.` });
    else if (p.sharpe >= 0.5)
      list.push({ type: "warning", icon: "🟡", title: "Sharpe moderado",
        body: `Sharpe de ${fmtNum(p.sharpe)} — retorno ajustado ao risco razoável, mas há espaço para melhoria.` });
    else if (p.sharpe >= 0)
      list.push({ type: "warning", icon: "🟠", title: "Sharpe fraco",
        body: `Sharpe de ${fmtNum(p.sharpe)} — o retorno mal compensa o risco assumido.` });
    else
      list.push({ type: "negative", icon: "🔴", title: "Sharpe negativo",
        body: `Sharpe de ${fmtNum(p.sharpe)} — a carteira perdeu dinheiro ajustado pelo risco. O CDI superou.` });
  }

  // ── Max Drawdown
  if (p.maxDrawdown != null) {
    if (p.maxDrawdown > 0.40)
      list.push({ type: "negative", icon: "🆘", title: "Drawdown severo",
        body: `Queda máxima de ${fmtPct(p.maxDrawdown)} do pico. Exige altíssima tolerância psicológica para não realizar perdas no fundo.` });
    else if (p.maxDrawdown > 0.25)
      list.push({ type: "warning", icon: "📉", title: "Drawdown elevado",
        body: `Queda máxima de ${fmtPct(p.maxDrawdown)}. Avalie a resiliência fundamentalista dos ativos em cenários adversos.` });
    else if (p.maxDrawdown > 0.15)
      list.push({ type: "neutral", icon: "📊", title: "Drawdown moderado",
        body: `Queda máxima de ${fmtPct(p.maxDrawdown)} — dentro do esperado para uma carteira de ações individuais.` });
    else
      list.push({ type: "positive", icon: "🛡️", title: "Drawdown controlado",
        body: `Queda máxima de apenas ${fmtPct(p.maxDrawdown)} — portfólio demonstrou boa resiliência em períodos de baixa.` });
  }

  // ── Volatilidade
  if (p.volatility != null) {
    if (p.volatility > 0.40)
      list.push({ type: "negative", icon: "🌪️", title: "Volatilidade muito alta",
        body: `Desvio-padrão anualizado de ${fmtPct(p.volatility)} — carteira de alto risco. Verifique adequação ao seu perfil.` });
    else if (p.volatility > 0.25)
      list.push({ type: "warning", icon: "🎢", title: "Volatilidade alta",
        body: `Volatilidade de ${fmtPct(p.volatility)} ao ano — típica de carteiras concentradas em ações individuais.` });
    else if (p.volatility > 0.15)
      list.push({ type: "neutral", icon: "📈", title: "Volatilidade moderada",
        body: `Volatilidade de ${fmtPct(p.volatility)} — compatível com portfólios diversificados de renda variável.` });
    else
      list.push({ type: "positive", icon: "🏔️", title: "Baixa volatilidade",
        body: `Volatilidade de ${fmtPct(p.volatility)} — carteira defensiva com oscilações bem controladas.` });
  }

  // ── Beta
  if (p.beta != null) {
    if (p.beta > 1.5)
      list.push({ type: "warning", icon: "⚡", title: "Beta muito alto",
        body: `Beta de ${fmtNum(p.beta)} — portfólio amplifica movimentos do iBovespa em ${fmtPct(p.beta - 1)}. Risco sistêmico elevado.` });
    else if (p.beta > 1.1)
      list.push({ type: "warning", icon: "📡", title: "Beta acima de 1",
        body: `Beta de ${fmtNum(p.beta)} — carteira mais agressiva que o mercado, amplificando altas e baixas do iBovespa.` });
    else if (p.beta >= 0.8)
      list.push({ type: "neutral", icon: "⚖️", title: "Beta neutro",
        body: `Beta de ${fmtNum(p.beta)} — portfólio acompanha o mercado sem amplificação significativa.` });
    else if (p.beta >= 0)
      list.push({ type: "positive", icon: "🛡️", title: "Beta defensivo",
        body: `Beta de ${fmtNum(p.beta)} — carteira defensiva, menos sensível a oscilações do iBovespa.` });
    else
      list.push({ type: "neutral", icon: "🔄", title: "Beta negativo",
        body: `Beta de ${fmtNum(p.beta)} — portfólio tende a se mover na direção oposta ao mercado (hedge natural).` });
  }

  // ── Destaques individuais
  if (tickers.length >= 2) {
    const byCagr = [...tickers].filter(t => t.cagr != null).sort((a, b) => (b.cagr ?? -Infinity) - (a.cagr ?? -Infinity));
    if (byCagr.length >= 2) {
      const best  = byCagr[0];
      const worst = byCagr[byCagr.length - 1];
      list.push({ type: "positive", icon: "🥇", title: `Melhor desempenho: ${best.ticker}`,
        body: `CAGR de ${fmtPct(best.cagr)} — maior retorno anual composto do portfólio no período analisado.` });
      list.push({
        type: worst.cagr != null && worst.cagr < 0 ? "negative" : "neutral",
        icon: worst.cagr != null && worst.cagr < 0 ? "🥀" : "🔎",
        title: `Menor desempenho: ${worst.ticker}`,
        body: worst.cagr != null && worst.cagr < 0
          ? `CAGR de ${fmtPct(worst.cagr)} — revise a tese de investimento neste ativo.`
          : `CAGR de ${fmtPct(worst.cagr)} — menor crescimento composto, mas ainda positivo no período.`,
      });
    }
    const bySharpe = [...tickers].filter(t => t.sharpe != null).sort((a, b) => (b.sharpe ?? -Infinity) - (a.sharpe ?? -Infinity));
    if (bySharpe.length) {
      const best = bySharpe[0];
      list.push({ type: "positive", icon: "💡", title: `Melhor risco-retorno: ${best.ticker}`,
        body: `Sharpe de ${fmtNum(best.sharpe)} — melhor compensação de retorno por unidade de risco individual.` });
    }
  }

  // ── IFR / RSI — sinais atuais
  const sobrecomprados = tickers.filter(t => t.ifr != null && t.ifr >= 70);
  const sobrevendidos  = tickers.filter(t => t.ifr != null && t.ifr <= 30);
  if (sobrecomprados.length)
    list.push({ type: "warning", icon: "🔥", title: `IFR sobrecomprado: ${sobrecomprados.map(t => t.ticker).join(", ")}`,
      body: "RSI ≥ 70 indica pressão técnica de venda no curto prazo. Cautela com novos aportes nesses ativos." });
  if (sobrevendidos.length)
    list.push({ type: "positive", icon: "💰", title: `IFR sobrevendido: ${sobrevendidos.map(t => t.ticker).join(", ")}`,
      body: "RSI ≤ 30 indica possível exagero na queda. Pode ser oportunidade técnica de entrada no curto prazo." });

  // ── Diversificação
  if (tickers.length >= 10)
    list.push({ type: "positive", icon: "🌐", title: "Portfólio bem diversificado",
      body: `${tickers.length} ativos no backtest — boa diversificação reduz o risco idiossincrático de cada empresa.` });
  else if (tickers.length >= 5)
    list.push({ type: "neutral", icon: "📦", title: "Diversificação moderada",
      body: `${tickers.length} ativos — considere ampliar a carteira para diluir o peso individual de cada ativo.` });
  else
    list.push({ type: "warning", icon: "🎯", title: "Carteira concentrada",
      body: `Apenas ${tickers.length} ativo${tickers.length === 1 ? "" : "s"} — risco de concentração elevado. Um evento negativo impacta fortemente o portfólio.` });

  return list;
});

function insightBorder(type: InsightType): string {
  return { positive: "border-green-400 dark:border-green-600", negative: "border-red-400 dark:border-red-600", warning: "border-amber-400 dark:border-amber-600", neutral: "border-gray-300 dark:border-gray-600" }[type];
}

function insightBg(type: InsightType): string {
  return { positive: "bg-green-50 dark:bg-green-950/20", negative: "bg-red-50 dark:bg-red-950/20", warning: "bg-amber-50 dark:bg-amber-950/20", neutral: "bg-gray-50 dark:bg-gray-800/40" }[type];
}

function insightTitle(type: InsightType): string {
  return { positive: "text-green-700 dark:text-green-400", negative: "text-red-700 dark:text-red-400", warning: "text-amber-700 dark:text-amber-400", neutral: "text-gray-700 dark:text-gray-300" }[type];
}

function sortIndicator(key: SortKey): string {
  if (sortKey.value !== key) return "";
  return sortDir.value === -1 ? " ▼" : " ▲";
}

// ─── Carregar backtest ────────────────────────────────────────────────────────

async function loadBacktest() {
  const tickers = props.acoes
    .filter(a => a.recomendacao?.result != null)
    .map(a => a.codigo.toUpperCase().replace(/\.SA$/i, ""));

  if (!tickers.length) return;

  // Pesos por valor de carteira
  const weights = props.acoes
    .filter(a => a.recomendacao?.result != null)
    .map(a => a.valorAtualizado ?? 1);

  loading.value = true;
  error.value   = null;
  try {
    const res = await api.post<{ success: boolean; data: BacktestResult }>("/backtest", { tickers, weights });
    result.value = res.data.data;
    // Inicializa todas as séries como visíveis
    visibleSeries.value = new Set([
      "portfolio", "ibov",
      ...(res.data.data.tickers.filter(t => t.equityCurve.length >= 20).map(t => t.ticker)),
    ]);
  } catch (e: any) {
    error.value = e?.response?.data?.error?.message ?? e.message ?? "Erro ao executar backtest";
  } finally {
    loading.value = false;
  }
}

onMounted(loadBacktest);
</script>

<template>
  <Teleport to="body">
    <Transition name="modal">
      <div class="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto py-6 px-4">
        <div class="fixed inset-0 bg-black/70 backdrop-blur-sm" @click="emit('close')" />

        <div class="relative w-full max-w-5xl bg-white dark:bg-gray-900 rounded-2xl shadow-2xl
                    border border-gray-200 dark:border-gray-700 z-10">

          <!-- ── Header ────────────────────────────────────────────── -->
          <div class="flex items-center justify-between p-5 border-b border-gray-200 dark:border-gray-700">
            <div>
              <h2 class="text-xl font-black flex items-center gap-2">
                📊 Backtest de Portfólio
                <span class="text-sm font-normal text-gray-400">— Performance Histórica</span>
              </h2>
              <p class="text-xs text-gray-400 mt-0.5">
                CAGR · Sharpe · Volatilidade · Drawdown · Alpha vs iBovespa · IFR
                <span v-if="result" class="ml-2 font-semibold text-blue-400">
                  {{ formatDate(result.period.from) }} → {{ formatDate(result.period.to) }}
                  ({{ result.period.days }} pregões)
                </span>
              </p>
            </div>
            <button @click="emit('close')"
              class="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-gray-500">
              ✕
            </button>
          </div>

          <!-- ── Loading / Error ──────────────────────────────────── -->
          <div v-if="loading" class="p-12 text-center text-gray-400">
            <p class="text-4xl mb-3 animate-spin">⏳</p>
            <p class="font-semibold">Calculando backtest...</p>
            <p class="text-sm mt-1">Buscando iBovespa e processando {{ acoes.filter(a => a.recomendacao?.result).length }} ativos</p>
          </div>

          <div v-else-if="error" class="p-12 text-center text-red-400">
            <p class="text-4xl mb-3">⚠️</p>
            <p class="font-semibold">{{ error }}</p>
            <button @click="loadBacktest" class="mt-4 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm hover:bg-blue-700">
              Tentar novamente
            </button>
          </div>

          <div v-else-if="!result || !result.portfolio.cagr" class="p-12 text-center text-gray-400">
            <p class="text-4xl mb-3">🔍</p>
            <p class="font-semibold">Sem dados suficientes para backtest</p>
            <p class="text-sm mt-1">Execute "Analisar Todos" antes de abrir o backtest.</p>
          </div>

          <!-- ── Conteúdo ─────────────────────────────────────────── -->
          <div v-else class="p-5 space-y-5 overflow-y-auto max-h-[80vh]">

            <!-- Aviso de ativos sem cache -->
            <div v-if="acoesSemCache.length" class="text-xs text-amber-500 bg-amber-50 dark:bg-amber-950/30 rounded-lg px-3 py-2">
              ⚠️ Sem cache (excluídos do backtest): {{ acoesSemCache.join(", ") }}
            </div>

            <!-- ── Tabs ─────────────────────────────────────────── -->
            <div class="flex gap-1 bg-gray-100 dark:bg-gray-800 rounded-xl p-1">
              <button v-for="tab in [
                { key: 'portfolio', label: '📈 Portfólio' },
                { key: 'ativos',    label: '📋 Por Ativo'  },
                { key: 'grafico',   label: '📉 Gráfico'    },
                { key: 'insights',  label: '💡 Insights'   },
              ]" :key="tab.key"
                @click="activeTab = tab.key as Tab"
                :class="[
                  'flex-1 py-2 text-xs font-semibold rounded-lg transition-colors',
                  activeTab === tab.key
                    ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                    : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300',
                ]">
                {{ tab.label }}
              </button>
            </div>

            <!-- ════════════════════════════════════════════════════
                 TAB: PORTFÓLIO
            ═══════════════════════════════════════════════════════ -->
            <div v-if="activeTab === 'portfolio'" class="space-y-5">

              <!-- Cards de métricas -->
              <div class="grid grid-cols-2 md:grid-cols-4 gap-3">

                <div class="rounded-xl p-4 bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700">
                  <p class="text-xs text-gray-400 mb-1">CAGR Portfólio</p>
                  <p :class="['text-2xl font-black', metricColor(result.portfolio.cagr)]">
                    {{ fmtPct(result.portfolio.cagr) }}
                  </p>
                  <p class="text-xs text-gray-400 mt-1">Retorno total: {{ fmtPct(result.portfolio.totalReturn) }}</p>
                </div>

                <div class="rounded-xl p-4 bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700">
                  <p class="text-xs text-gray-400 mb-1">Sharpe Ratio</p>
                  <p :class="['text-2xl font-black', metricColor(result.portfolio.sharpe)]">
                    {{ fmtNum(result.portfolio.sharpe) }}
                  </p>
                  <p class="text-xs text-gray-400 mt-1">
                    {{ result.portfolio.sharpe == null ? "—" : result.portfolio.sharpe >= 1 ? "Excelente" : result.portfolio.sharpe >= 0.5 ? "Bom" : result.portfolio.sharpe >= 0 ? "Moderado" : "Fraco" }}
                  </p>
                </div>

                <div class="rounded-xl p-4 bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700">
                  <p class="text-xs text-gray-400 mb-1">Volatilidade Anual</p>
                  <p class="text-2xl font-black text-yellow-500">
                    {{ fmtPct(result.portfolio.volatility) }}
                  </p>
                  <p class="text-xs text-gray-400 mt-1">Desvio-padrão anualizado</p>
                </div>

                <div class="rounded-xl p-4 bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700">
                  <p class="text-xs text-gray-400 mb-1">Max Drawdown</p>
                  <p class="text-2xl font-black text-red-500">
                    -{{ fmtPct(result.portfolio.maxDrawdown) }}
                  </p>
                  <p class="text-xs text-gray-400 mt-1">Maior queda pico→vale</p>
                </div>

                <div class="rounded-xl p-4 bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700">
                  <p class="text-xs text-gray-400 mb-1">Alpha vs iBovespa</p>
                  <p :class="['text-2xl font-black', metricColor(result.portfolio.alpha)]">
                    {{ fmtPct(result.portfolio.alpha) }}
                  </p>
                  <p class="text-xs text-gray-400 mt-1">Jensen's Alpha (CAPM)</p>
                </div>

                <div class="rounded-xl p-4 bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700">
                  <p class="text-xs text-gray-400 mb-1">Beta vs iBovespa</p>
                  <p class="text-2xl font-black text-blue-400">
                    {{ fmtNum(result.portfolio.beta) }}
                  </p>
                  <p class="text-xs text-gray-400 mt-1">
                    {{ result.portfolio.beta == null ? "—" : result.portfolio.beta > 1.2 ? "Alta correlação" : result.portfolio.beta < 0.8 ? "Baixa correlação" : "Correlação moderada" }}
                  </p>
                </div>

                <div class="col-span-2 rounded-xl p-4 bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700">
                  <p class="text-xs text-gray-400 mb-2">Composição do backtest</p>
                  <div class="flex flex-wrap gap-2">
                    <span v-for="t in result.tickers.filter(t => t.period.days > 0)" :key="t.ticker"
                      class="px-2 py-0.5 rounded-full text-xs font-semibold bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300">
                      {{ t.ticker }}
                    </span>
                    <span v-for="t in result.tickers.filter(t => t.period.days === 0)" :key="t.ticker"
                      class="px-2 py-0.5 rounded-full text-xs font-semibold bg-gray-200 dark:bg-gray-700 text-gray-400 line-through">
                      {{ t.ticker }}
                    </span>
                  </div>
                </div>

              </div>

              <!-- Metodologia -->
              <div class="text-xs text-gray-400 bg-gray-50 dark:bg-gray-800/30 rounded-lg p-3 space-y-1">
                <p><strong>Metodologia:</strong> Buy & Hold ponderado pelo valor de carteira · Pesos normalizados por valor atualizado dos ativos</p>
                <p><strong>Taxa livre de risco:</strong> 11,75% a.a. (CDI aproximado) · <strong>Benchmark:</strong> iBovespa (^BVSP) · <strong>Alpha:</strong> CAPM Jensen's Alpha</p>
                <p><strong>Sharpe:</strong> (Retorno anual - CDI) / Volatilidade · <strong>CAGR:</strong> baseado nos {{ result.period.days }} pregões disponíveis em cache</p>
              </div>
            </div>

            <!-- ════════════════════════════════════════════════════
                 TAB: POR ATIVO
            ═══════════════════════════════════════════════════════ -->
            <div v-else-if="activeTab === 'ativos'" class="space-y-3">
              <input v-model="filterAtivos" placeholder="Filtrar por código (ex: PETR4)..."
                class="input w-full text-sm py-1.5" />
              <div class="overflow-x-auto">
                <table class="w-full text-xs">
                  <thead>
                    <tr class="text-left text-gray-400 border-b border-gray-200 dark:border-gray-700">
                      <th @click="setSort('ticker')"
                        class="py-2 pr-3 cursor-pointer hover:text-gray-200 whitespace-nowrap sticky left-0 bg-white dark:bg-gray-900 z-10">
                        Ativo{{ sortIndicator('ticker') }}
                      </th>
                      <th @click="setSort('cagr')"
                        class="py-2 pr-3 cursor-pointer hover:text-gray-200 whitespace-nowrap text-right">
                        CAGR{{ sortIndicator('cagr') }}
                      </th>
                      <th @click="setSort('totalReturn')"
                        class="py-2 pr-3 cursor-pointer hover:text-gray-200 whitespace-nowrap text-right">
                        Retorno{{ sortIndicator('totalReturn') }}
                      </th>
                      <th @click="setSort('sharpe')"
                        class="py-2 pr-3 cursor-pointer hover:text-gray-200 whitespace-nowrap text-right">
                        Sharpe{{ sortIndicator('sharpe') }}
                      </th>
                      <th @click="setSort('volatility')"
                        class="py-2 pr-3 cursor-pointer hover:text-gray-200 whitespace-nowrap text-right">
                        Volatil.{{ sortIndicator('volatility') }}
                      </th>
                      <th @click="setSort('maxDrawdown')"
                        class="py-2 pr-3 cursor-pointer hover:text-gray-200 whitespace-nowrap text-right">
                        Max DD{{ sortIndicator('maxDrawdown') }}
                      </th>
                      <th @click="setSort('alpha')"
                        class="py-2 pr-3 cursor-pointer hover:text-gray-200 whitespace-nowrap text-right">
                        Alpha{{ sortIndicator('alpha') }}
                      </th>
                      <th class="py-2 pr-3 whitespace-nowrap text-right">Beta</th>
                      <th @click="setSort('ifr')"
                        class="py-2 pr-3 cursor-pointer hover:text-gray-200 whitespace-nowrap text-right">
                        IFR{{ sortIndicator('ifr') }}
                      </th>
                      <th class="py-2 whitespace-nowrap text-right">Período</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="t in tickersSorted" :key="t.ticker"
                      class="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/40">
                      <td class="py-2 pr-3 font-bold sticky left-0 bg-white dark:bg-gray-900 z-10">
                        {{ t.ticker }}
                        <span v-if="t.period.days === 0" class="ml-1 text-gray-400 font-normal">(sem cache)</span>
                      </td>
                      <td :class="['py-2 pr-3 text-right font-semibold', metricColor(t.cagr)]">{{ fmtPct(t.cagr) }}</td>
                      <td :class="['py-2 pr-3 text-right', metricColor(t.totalReturn)]">{{ fmtPct(t.totalReturn) }}</td>
                      <td :class="['py-2 pr-3 text-right', metricColor(t.sharpe)]">{{ fmtNum(t.sharpe) }}</td>
                      <td class="py-2 pr-3 text-right text-yellow-500">{{ fmtPct(t.volatility) }}</td>
                      <td class="py-2 pr-3 text-right text-red-500">-{{ fmtPct(t.maxDrawdown) }}</td>
                      <td :class="['py-2 pr-3 text-right', metricColor(t.alpha)]">{{ fmtPct(t.alpha) }}</td>
                      <td class="py-2 pr-3 text-right text-blue-400">{{ fmtNum(t.beta) }}</td>
                      <td class="py-2 pr-3 text-right">
                        <span v-if="t.ifr != null" :class="['font-semibold', ifrColor(t.ifr)]">
                          {{ t.ifr.toFixed(0) }}
                          <span class="font-normal text-gray-400 text-[10px]"> ({{ ifrLabel(t.ifr) }})</span>
                        </span>
                        <span v-else class="text-gray-400">—</span>
                      </td>
                      <td class="py-2 text-right text-gray-400">
                        {{ t.period.days ? `${t.period.days}d` : "—" }}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <p class="text-xs text-gray-400">
                Clique no cabeçalho para ordenar · IFR = RSI 14 atual ·
                Alpha calculado via CAPM (CDI 11,75%)
              </p>
            </div>

            <!-- ════════════════════════════════════════════════════
                 TAB: GRÁFICO
            ═══════════════════════════════════════════════════════ -->
            <div v-else-if="activeTab === 'grafico'" class="space-y-4">

              <div v-if="!chartData" class="text-center text-gray-400 py-8">Curvas indisponíveis</div>

              <div v-else class="space-y-3">

                <!-- Legenda com checkboxes -->
                <div class="flex flex-wrap gap-2">

                  <!-- Portfólio -->
                  <label class="flex items-center gap-1.5 cursor-pointer select-none text-xs
                                px-2.5 py-1 rounded-lg border transition-colors"
                    :class="visibleSeries.has('portfolio')
                      ? 'border-gray-400 dark:border-gray-500 bg-gray-100 dark:bg-gray-800'
                      : 'border-gray-200 dark:border-gray-700 opacity-40'">
                    <input type="checkbox" class="sr-only"
                      :checked="visibleSeries.has('portfolio')"
                      @change="toggleSeries('portfolio')" />
                    <span class="w-5 h-0.5 inline-block rounded"
                      :style="{ backgroundColor: svgColors.portfolio }" />
                    <span class="font-semibold text-gray-700 dark:text-gray-200">Portfólio</span>
                  </label>

                  <!-- iBovespa -->
                  <label class="flex items-center gap-1.5 cursor-pointer select-none text-xs
                                px-2.5 py-1 rounded-lg border transition-colors"
                    :class="visibleSeries.has('ibov')
                      ? 'border-orange-400 bg-orange-50 dark:bg-orange-950/30'
                      : 'border-gray-200 dark:border-gray-700 opacity-40'">
                    <input type="checkbox" class="sr-only"
                      :checked="visibleSeries.has('ibov')"
                      @change="toggleSeries('ibov')" />
                    <span class="w-5 inline-block" style="border-top: 2px dashed #fb923c; height:0; display:inline-block" />
                    <span class="font-semibold text-orange-600 dark:text-orange-400">iBovespa</span>
                  </label>

                  <!-- Tickers individuais -->
                  <label v-for="line in chartData.tickerLines" :key="line.ticker"
                    class="flex items-center gap-1.5 cursor-pointer select-none text-xs
                           px-2.5 py-1 rounded-lg border transition-colors"
                    :class="visibleSeries.has(line.ticker)
                      ? 'border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-800/60'
                      : 'border-gray-200 dark:border-gray-700 opacity-40'">
                    <input type="checkbox" class="sr-only"
                      :checked="visibleSeries.has(line.ticker)"
                      @change="toggleSeries(line.ticker)" />
                    <span class="w-3 h-3 rounded-sm inline-block flex-shrink-0"
                      :style="{ backgroundColor: line.color }" />
                    <span class="text-gray-600 dark:text-gray-300">{{ line.ticker }}</span>
                  </label>

                </div>

                <!-- SVG Chart -->
                <div class="relative">
                  <div class="rounded-xl border overflow-hidden
                              bg-white dark:bg-gray-950
                              border-gray-200 dark:border-gray-800">
                    <svg ref="svgRef"
                      :viewBox="`0 0 ${SVG_W} ${SVG_H}`" class="w-full" :style="`height: ${SVG_H}px`"
                      @mousemove="onSvgMouseMove" @mouseleave="onSvgMouseLeave"
                      style="cursor: crosshair">
                      <!-- Grid horizontal -->
                      <line v-for="tick in chartData.yTicks" :key="tick.y"
                        :x1="PAD.left" :y1="tick.y" :x2="SVG_W - PAD.right" :y2="tick.y"
                        :stroke="svgColors.grid" stroke-width="0.5" />
                      <!-- Linha base 100 -->
                      <line
                        :x1="PAD.left"
                        :y1="PAD.top + (1 - (100 - chartData.minY) / (chartData.maxY - chartData.minY)) * (SVG_H - PAD.top - PAD.bottom)"
                        :x2="SVG_W - PAD.right"
                        :y2="PAD.top + (1 - (100 - chartData.minY) / (chartData.maxY - chartData.minY)) * (SVG_H - PAD.top - PAD.bottom)"
                        :stroke="svgColors.baseLine" stroke-width="1" stroke-dasharray="4 4" />

                      <!-- Eixo Y labels -->
                      <text v-for="tick in chartData.yTicks" :key="`y-${tick.y}`"
                        :x="PAD.left - 6" :y="tick.y + 4"
                        text-anchor="end" font-size="10" :fill="svgColors.axis">{{ tick.label }}</text>
                      <!-- Eixo X labels -->
                      <text v-for="tick in chartData.xTicks" :key="`x-${tick.x}`"
                        :x="tick.x" :y="SVG_H - 6"
                        text-anchor="middle" font-size="10" :fill="svgColors.axis">{{ tick.label }}</text>

                      <!-- Curvas individuais dos tickers (fundo, mais finas) -->
                      <path v-for="line in chartData.tickerLines" :key="line.ticker"
                        v-show="visibleSeries.has(line.ticker)"
                        :d="line.path"
                        :stroke="line.color" stroke-width="1"
                        fill="none" opacity="0.6" />

                      <!-- iBovespa -->
                      <path v-show="visibleSeries.has('ibov')"
                        :d="chartData.ibovPath"
                        stroke="#fb923c" stroke-width="1.5"
                        stroke-dasharray="6 3" fill="none" />

                      <!-- Portfólio (destaque) -->
                      <path v-show="visibleSeries.has('portfolio')"
                        :d="chartData.portPath"
                        :stroke="svgColors.portfolio" stroke-width="2.5"
                        fill="none" />

                      <!-- ── Hover: crosshair + dots ─────────────────── -->
                      <g v-if="hoverData">
                        <!-- Linha vertical -->
                        <line
                          :x1="hoverData.crossX" :y1="PAD.top"
                          :x2="hoverData.crossX" :y2="SVG_H - PAD.bottom"
                          :stroke="svgColors.axis" stroke-width="1" stroke-dasharray="3 3" />
                        <!-- Dots em cada série visível -->
                        <circle
                          v-for="s in hoverData.series.filter(s => s.visible)"
                          :key="s.key"
                          :cx="hoverData.crossX" :cy="s.dotY" r="4.5"
                          :fill="s.color"
                          stroke="white" stroke-width="1.5" />
                      </g>
                    </svg>
                  </div>

                  <!-- Tooltip HTML (fora do overflow-hidden) -->
                  <div v-if="hoverData && hoverData.series.some(s => s.visible)"
                    class="absolute z-20 pointer-events-none min-w-[185px]
                           bg-white dark:bg-gray-800
                           border border-gray-200 dark:border-gray-700
                           rounded-xl shadow-xl px-3 py-2.5 text-xs"
                    :style="tooltipStyle">
                    <p class="font-semibold text-gray-400 dark:text-gray-500 mb-1.5 text-[10px] uppercase tracking-wide">
                      {{ hoverData.date }}
                    </p>
                    <div v-for="s in hoverData.series.filter(s => s.visible)" :key="s.key"
                      class="flex items-center justify-between gap-4 py-0.5">
                      <span class="flex items-center gap-1.5 min-w-0">
                        <span class="w-2.5 h-2.5 rounded-full flex-shrink-0"
                          :style="{ backgroundColor: s.color }" />
                        <span class="text-gray-700 dark:text-gray-300 truncate">{{ s.label }}</span>
                      </span>
                      <span :class="['font-semibold tabular-nums flex-shrink-0',
                                     s.change >= 0 ? 'text-green-500' : 'text-red-500']">
                        {{ s.change >= 0 ? "+" : "" }}{{ s.change.toFixed(1) }}%
                      </span>
                    </div>
                  </div>
                </div>

                <p class="text-xs text-gray-400">
                  Base = 100 na data inicial · Portfólio ponderado por valor de carteira ·
                  Ativo sem valor usa peso igual
                </p>
              </div>
            </div>

            <!-- ════════════════════════════════════════════════════
                 TAB: INSIGHTS
            ═══════════════════════════════════════════════════════ -->
            <div v-else-if="activeTab === 'insights'" class="space-y-3">

              <p class="text-xs text-gray-400">
                {{ insights.length }} interpretações geradas com base nos resultados do backtest.
              </p>

              <div v-for="(item, i) in insights" :key="i"
                :class="['rounded-xl border-l-4 px-4 py-3', insightBorder(item.type), insightBg(item.type)]">
                <p :class="['font-semibold text-sm mb-0.5', insightTitle(item.type)]">
                  {{ item.icon }} {{ item.title }}
                </p>
                <p class="text-xs text-gray-600 dark:text-gray-400 leading-relaxed">
                  {{ item.body }}
                </p>
              </div>

              <div class="text-xs text-gray-400 bg-gray-50 dark:bg-gray-800/30 rounded-lg p-3 space-y-1 mt-2">
                <p><strong>Referências utilizadas:</strong> CDI 11,75% a.a. como taxa livre de risco · CAPM para cálculo de Alpha · RSI 14 períodos (IFR)</p>
                <p><strong>Período:</strong> {{ formatDate(result.period.from) }} → {{ formatDate(result.period.to) }} ({{ result.period.days }} pregões disponíveis em cache)</p>
              </div>

            </div>

          </div><!-- /conteúdo -->
        </div><!-- /modal -->
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.modal-enter-active,
.modal-leave-active { transition: opacity 0.2s ease; }
.modal-enter-from,
.modal-leave-to { opacity: 0; }
.modal-enter-active .relative,
.modal-leave-active .relative { transition: transform 0.2s ease; }
.modal-enter-from .relative { transform: translateY(-16px); }
.modal-leave-to  .relative { transform: translateY(-8px); }
</style>
