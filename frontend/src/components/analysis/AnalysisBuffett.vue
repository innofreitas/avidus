<script setup lang="ts">
import { ref, computed, watch } from "vue";
import type { AnalysisResult } from "@/types";
import { decisionColor, decisionBadgeClass } from "@/utils/formatters";

// ─── Props / Emits ───────────────────────────────────────────

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

// ─── Metodologia Buffett ──────────────────────────────────────
// Buffett foca em empresas com "fosso econômico" (moat) em setores
// com vantagem competitiva duradoura: Consumer Staples, Finance,
// Healthcare, Technology (moat) e Industry/Infrastructure.

const MOAT_SETORES = ["Consumer Staples", "Financeiro", "Saúde", "Tecnologia", "Industrial"];

const SETOR_COR: Record<string, string> = {
  "Consumer Staples": "#f97316",
  "Financeiro":       "#3b82f6",
  "Saúde":            "#ec4899",
  "Tecnologia":       "#8b5cf6",
  "Industrial":       "#14b8a6",
  "Outros":           "#6b7280",
};
const SETOR_EMOJI: Record<string, string> = {
  "Consumer Staples": "🛒",
  "Financeiro":       "🏦",
  "Saúde":            "🏥",
  "Tecnologia":       "💻",
  "Industrial":       "🏭",
  "Outros":           "📦",
};

// Mapeamento manual de tickers B3 → pilar Buffett
const TICKER_SETOR: Record<string, string> = {
  // Consumer Staples
  ABEV: "Consumer Staples", AMBP: "Consumer Staples",
  BEEF: "Consumer Staples", MDIA: "Consumer Staples",
  PCAR: "Consumer Staples", ASAI: "Consumer Staples",
  SMTO: "Consumer Staples", JBSS: "Consumer Staples",
  MRFG: "Consumer Staples", BRFS: "Consumer Staples",
  // Financeiro
  ITUB: "Financeiro", BBDC: "Financeiro", BBAS: "Financeiro",
  SANB: "Financeiro", BPAC: "Financeiro", B3SA: "Financeiro",
  CIEL: "Financeiro", IRBR: "Financeiro", BBSE: "Financeiro",
  PSSA: "Financeiro", SULA: "Financeiro",
  // Saúde
  RDOR: "Saúde", HAPV: "Saúde", QUAL: "Saúde",
  FLRY: "Saúde", DASA: "Saúde", HYPE: "Saúde",
  PNVL: "Saúde", ODPV: "Saúde",
  // Tecnologia (moat)
  TOTVS: "Tecnologia", LINX: "Tecnologia", LWSA: "Tecnologia",
  INTB: "Tecnologia", MLAS: "Tecnologia", CASH: "Tecnologia",
  // Industrial / Infraestrutura
  WEGE: "Industrial", EMBR: "Industrial", RAIL: "Industrial",
  CCRO: "Industrial", ECOR: "Industrial", TRPL: "Industrial",
  SBSP: "Industrial", SAPR: "Industrial",
};

// Mapeamento de sector string da API → pilar Buffett
const SECTOR_API_MAP: Record<string, string> = {
  "consumer defensive":    "Consumer Staples",
  "consumer staples":      "Consumer Staples",
  "consumer discretionary":"Consumer Staples",
  "consumer cyclical":     "Consumer Staples",
  "financial services":    "Financeiro",
  "finance":               "Financeiro",
  "financial":             "Financeiro",
  "healthcare":            "Saúde",
  "health services":       "Saúde",
  "health technology":     "Saúde",
  "technology services":   "Tecnologia",
  "electronic technology": "Tecnologia",
  "technology":            "Tecnologia",
  "producer manufacturing":"Industrial",
  "industrial services":   "Industrial",
  "transportation":        "Industrial",
  "utilities":             "Industrial",
  "process industries":    "Industrial",
};

// ─── Critérios de qualidade Buffett ───────────────────────────
// Usados para calcular o "score moat" individual de cada ativo

interface CriterioResult {
  nome: string;
  ok: boolean | null;   // null = sem dados
  valor: string;
  descricao: string;
}

function avaliarBuffett(row: AcaoRow): { score: number; criterios: CriterioResult[] } {
  const fund = row.recomendacao?.result?.fundamental;
  const criterios: CriterioResult[] = [];
  let pts = 0;
  let total = 0;

  const add = (nome: string, ok: boolean | null, valor: string, descricao: string, peso = 1) => {
    criterios.push({ nome, ok, valor, descricao });
    if (ok === true)  pts   += peso;
    if (ok !== null)  total += peso;
  };

  // 1. ROE ≥ 15% — retorno sustentado sobre PL
  const roe = fund?.roe?.value ?? null;
  add("ROE ≥ 15%", roe != null ? roe >= 15 : null,
    roe != null ? `${roe.toFixed(1)}%` : "N/A",
    "Empresas com moat consistentemente entregam ROE alto", 2);

  // 2. Margem Líquida ≥ 10% — precificação superior
  const ml = fund?.margemLiquida?.value ?? null;
  add("Margem Líq. ≥ 10%", ml != null ? ml >= 10 : null,
    ml != null ? `${ml.toFixed(1)}%` : "N/A",
    "Alta margem indica poder de precificação (pricing power)", 2);

  // 3. Dívida/EBITDA ≤ 2x — balanço sólido
  const de = fund?.dividaEbitda?.value ?? null;
  add("Dívida/EBITDA ≤ 2x", de != null ? de <= 2 : null,
    de != null ? `${de.toFixed(2)}x` : "N/A",
    "Buffett prefere empresas com endividamento controlado", 2);

  // 4. P/L razoável vs crescimento — não paga caro
  const pl = fund?.pl?.value ?? null;
  const eg = fund?.earningsGrowth?.value ?? null;
  const peg = pl != null && eg != null && eg > 0 ? pl / eg : null;
  add("PEG ≤ 1.5", peg != null ? peg <= 1.5 : null,
    peg != null ? `PEG ${peg.toFixed(2)}` : pl != null ? `P/L ${pl.toFixed(1)}` : "N/A",
    "Preço/Lucro ajustado pelo crescimento — paga preço justo", 1);

  // 5. P/VP ≤ 3x — não paga múltiplo excessivo sobre patrimônio
  const pvp = fund?.pvp?.value ?? null;
  add("P/VP ≤ 3x", pvp != null ? pvp <= 3 : null,
    pvp != null ? `${pvp.toFixed(2)}x` : "N/A",
    "Evita pagar prêmio excessivo sobre o valor patrimonial", 1);

  // 6. Crescimento de lucros positivo
  const cg = fund?.earningsGrowth?.value ?? null;
  add("Lucro crescendo", cg != null ? cg > 0 : null,
    cg != null ? `${cg >= 0 ? "+" : ""}${cg.toFixed(1)}%` : "N/A",
    "Empresas com moat crescem lucros de forma consistente", 2);

  // 7. Beta ≤ 1.2 — estabilidade (Buffett evita alta volatilidade)
  const beta = fund?.beta?.value ?? null;
  add("Beta ≤ 1.2", beta != null ? beta <= 1.2 : null,
    beta != null ? `β ${beta.toFixed(2)}` : "N/A",
    "Negócios de qualidade tendem a ser menos voláteis que o mercado", 1);

  const pctScore = total > 0 ? (pts / total) * 100 : 0;
  return { score: +pctScore.toFixed(1), criterios };
}

// ─── Helpers ──────────────────────────────────────────────────

function fmtCurrency(v: number | null) {
  if (v == null) return "—";
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2 });
}

function pontuacao(row: AcaoRow): number | null {
  const scores = row.recomendacao?.result?.scores;
  if (!scores) return null;
  const vals = (["GENERICO", "CONSERVADOR", "MODERADO", "AGRESSIVO"] as const)
    .map(p => scores[p]?.score ?? null).filter((v): v is number => v != null);
  return vals.length ? +(vals.reduce((a, b) => a + b, 0).toFixed(1)) : null;
}

function detectarSetor(row: AcaoRow): string {
  const prefix = row.codigo.replace(/\d+.*$/, "").toUpperCase();
  if (TICKER_SETOR[prefix]) return TICKER_SETOR[prefix];
  if (TICKER_SETOR[row.codigo.toUpperCase()]) return TICKER_SETOR[row.codigo.toUpperCase()];
  const sector = (row.recomendacao?.result?.meta?.sector ?? "").toLowerCase();
  const industry = (row.recomendacao?.result?.meta?.industry ?? "").toLowerCase();
  for (const [key, val] of Object.entries(SECTOR_API_MAP)) {
    if (sector.includes(key) || industry.includes(key)) return val;
  }
  return "Outros";
}

// Score Buffett combinado: 60% moat + 40% score perfis
function scoreBuffett(row: AcaoRow): number {
  const moat = avaliarBuffett(row).score;       // 0–100
  const pts  = pontuacao(row) ?? 0;             // 0–400
  const ptsNorm = Math.min(pts / 4, 100);       // 0–100
  return +(moat * 0.6 + ptsNorm * 0.4).toFixed(1);
}

// ─── Computed ─────────────────────────────────────────────────

const acoesAnalisadas = computed(() =>
  props.acoes.filter(r => r.recomendacao?.result != null)
);
const temAnalise = computed(() => acoesAnalisadas.value.length > 0);

const acoesEnriquecidas = computed(() =>
  acoesAnalisadas.value.map(row => ({
    ...row,
    setor:        detectarSetor(row),
    pts:          pontuacao(row) ?? 0,
    valor:        row.valorAtualizado ?? 0,
    moat:         avaliarBuffett(row),
    scoreBuffett: scoreBuffett(row),
  }))
);

// Concentração por setor (valor)
const porSetor = computed(() => {
  const total = acoesEnriquecidas.value.reduce((s, r) => s + r.valor, 0);
  const map: Record<string, { valor: number; count: number; pct: number }> = {};
  for (const r of acoesEnriquecidas.value) {
    if (!map[r.setor]) map[r.setor] = { valor: 0, count: 0, pct: 0 };
    map[r.setor].valor += r.valor;
    map[r.setor].count += 1;
  }
  for (const k of Object.keys(map)) {
    map[k].pct = total > 0 ? (map[k].valor / total) * 100 : 0;
  }
  return map;
});

const setoresMoat = computed(() =>
  MOAT_SETORES.map(s => ({
    setor:    s,
    presente: !!porSetor.value[s],
    pct:      porSetor.value[s]?.pct ?? 0,
    cor:      SETOR_COR[s],
    emoji:    SETOR_EMOJI[s],
  }))
);

const coberturaMoat = computed(() => {
  const presentes = setoresMoat.value.filter(s => s.presente).length;
  return { total: MOAT_SETORES.length, presentes, pct: (presentes / MOAT_SETORES.length) * 100 };
});

// Top 5 por scoreBuffett
const top5 = computed(() =>
  [...acoesEnriquecidas.value]
    .filter(r => r.scoreBuffett > 0)
    .sort((a, b) => b.scoreBuffett - a.scoreBuffett)
    .slice(0, 5)
);

const balanceamento = computed(() => {
  if (!top5.value.length) return [];
  const totalScore = top5.value.reduce((s, r) => s + r.scoreBuffett, 0);
  return top5.value.map(r => ({
    ...r,
    pesoPts: totalScore > 0 ? (r.scoreBuffett / totalScore) * 100 : 20,
  }));
});

// ─── Simulação ────────────────────────────────────────────────
const aporte      = ref<number | null>(null);
const aporteInput = ref("");
const desativados = ref<Set<string>>(new Set());

watch(aporteInput, v => {
  const x = parseFloat(v.replace(/\./g, "").replace(",", "."));
  aporte.value = isFinite(x) && x > 0 ? x : null;
});

function toggleAtivo(codigo: string) {
  const s = new Set(desativados.value);
  s.has(codigo) ? s.delete(codigo) : s.add(codigo);
  desativados.value = s;
}

const simulacao = computed(() => {
  const val = aporte.value;
  if (!val || !balanceamento.value.length) return [];
  const ativos = balanceamento.value.filter(r => !desativados.value.has(r.codigo));
  if (!ativos.length) return [];
  const totalScore = ativos.reduce((s, r) => s + r.scoreBuffett, 0);
  return ativos.map(r => {
    const pesoRedist  = totalScore > 0 ? (r.scoreBuffett / totalScore) * 100 : 100 / ativos.length;
    const valorAlocar = (pesoRedist / 100) * val;
    const preco       = r.precoFechamento ?? 0;
    const qtd         = preco > 0 ? Math.floor(valorAlocar / preco) : 0;
    const realAlocado = qtd * preco;
    return { ...r, pesoRedist, valorAlocar, qtd, realAlocado };
  });
});

const totalSimulado = computed(() =>
  simulacao.value.reduce((s, r) => s + r.realAlocado, 0)
);

// ─── Insights ────────────────────────────────────────────────

const insights = computed(() => {
  const list: { tipo: "warn" | "ok" | "info"; msg: string }[] = [];
  const total = acoesEnriquecidas.value.reduce((s, r) => s + r.valor, 0);

  // Setores moat ausentes
  const ausentes = setoresMoat.value.filter(s => !s.presente).map(s => s.setor);
  if (ausentes.length > 0) {
    list.push({ tipo: "info", msg: `Sua carteira não tem ativos nos pilares Buffett: ${ausentes.join(", ")}. Considere empresas com moat nesses setores.` });
  }

  // Cobertura completa
  if (coberturaMoat.value.presentes === MOAT_SETORES.length) {
    list.push({ tipo: "ok", msg: "✅ Excelente! Sua carteira cobre todos os 5 pilares da metodologia Buffett." });
  }

  // Concentração individual
  for (const r of acoesEnriquecidas.value) {
    const pct = total > 0 ? (r.valor / total) * 100 : 0;
    if (pct > 30) {
      list.push({ tipo: "warn", msg: `${r.codigo} representa ${pct.toFixed(1)}% do valor em ações. Buffett, apesar de concentrado, limita posições individuais excessivas.` });
    }
  }

  // Qualidade do moat (score < 40%)
  for (const r of acoesEnriquecidas.value) {
    if (r.moat.score < 40 && r.valor > 0) {
      const pct = total > 0 ? (r.valor / total) * 100 : 0;
      if (pct > 5) {
        list.push({ tipo: "warn", msg: `${r.codigo} tem score Buffett de ${r.moat.score.toFixed(0)}% — não atende bem os critérios de qualidade (ROE, margens, dívida). Buffett evitaria.` });
      }
    }
  }

  // Destaques com alto moat
  for (const r of top5.value.slice(0, 3)) {
    if (r.moat.score >= 70) {
      const passados = r.moat.criterios.filter(c => c.ok === true).length;
      list.push({ tipo: "ok", msg: `${r.codigo} passa ${passados}/${r.moat.criterios.length} critérios Buffett (score moat ${r.moat.score.toFixed(0)}%) — empresa de qualidade com fosso econômico.` });
    }
  }

  // Alerta de P/VP alto
  for (const r of acoesEnriquecidas.value) {
    const pvp = r.recomendacao?.result?.fundamental?.pvp?.value ?? null;
    if (pvp != null && pvp > 5) {
      list.push({ tipo: "warn", msg: `${r.codigo} tem P/VP de ${pvp.toFixed(2)}x — Buffett diz: "É melhor comprar uma empresa maravilhosa a um preço justo do que uma empresa justa a um preço maravilhoso." Avalie o valuation.` });
    }
  }

  // ROE alto
  for (const r of top5.value) {
    const roe = r.recomendacao?.result?.fundamental?.roe?.value ?? null;
    if (roe != null && roe >= 20) {
      list.push({ tipo: "ok", msg: `${r.codigo} tem ROE de ${roe.toFixed(1)}% — acima de 20% é sinal de vantagem competitiva duradoura segundo Buffett.` });
    }
  }

  return list;
});

// ─── Gráfico de rosca (SVG) ──────────────────────────────────

interface ArcEntry { setor: string; pct: number; cor: string; emoji: string }

const arcEntries = computed((): ArcEntry[] =>
  Object.entries(porSetor.value)
    .map(([setor, d]) => ({
      setor, pct: d.pct,
      cor:   SETOR_COR[setor]   ?? "#6b7280",
      emoji: SETOR_EMOJI[setor] ?? "📦",
    }))
    .sort((a, b) => b.pct - a.pct)
);

function buildArcs(entries: ArcEntry[]) {
  const cx = 100, cy = 100, r = 70, innerR = 40;
  let angle = -90;
  const arcs: { d: string; cor: string; setor: string; pct: number; emoji: string }[] = [];
  for (const e of entries) {
    if (e.pct < 0.5) continue;
    const sweep    = (e.pct / 100) * 360;
    const largeArc = sweep > 180 ? 1 : 0;
    const toRad    = (deg: number) => (deg * Math.PI) / 180;
    const x1 = cx + r * Math.cos(toRad(angle));
    const y1 = cy + r * Math.sin(toRad(angle));
    const x2 = cx + r * Math.cos(toRad(angle + sweep));
    const y2 = cy + r * Math.sin(toRad(angle + sweep));
    const ix1 = cx + innerR * Math.cos(toRad(angle + sweep));
    const iy1 = cy + innerR * Math.sin(toRad(angle + sweep));
    const ix2 = cx + innerR * Math.cos(toRad(angle));
    const iy2 = cy + innerR * Math.sin(toRad(angle));
    const d = `M ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2} L ${ix1} ${iy1} A ${innerR} ${innerR} 0 ${largeArc} 0 ${ix2} ${iy2} Z`;
    arcs.push({ d, cor: e.cor, setor: e.setor, pct: e.pct, emoji: e.emoji });
    angle += sweep;
  }
  return arcs;
}

const arcs = computed(() => buildArcs(arcEntries.value));

// ─── Tooltip da rosca ────────────────────────────────────────────────────────
type ArcItem = { d: string; cor: string; setor: string; pct: number; emoji: string };
const hoverArc  = ref<ArcItem | null>(null);
const donutPos  = ref({ x: 0, y: 0 });

function onDonutMove(e: MouseEvent) {
  const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
  donutPos.value = { x: e.clientX - r.left, y: e.clientY - r.top };
}

const donutTooltipStyle = computed(() => ({
  left: donutPos.value.x > 110 ? `${donutPos.value.x - 148}px` : `${donutPos.value.x + 14}px`,
  top:  `${Math.max(4, donutPos.value.y - 24)}px`,
}));

// ─── Tabs ────────────────────────────────────────────────────
const activeTab = ref<"grafico" | "balanceamento" | "simulacao" | "insights">("grafico");

// ── Ativo expandido na aba de balanceamento (mostra critérios)
const expandido = ref<string | null>(null);
function toggleExpandido(codigo: string) {
  expandido.value = expandido.value === codigo ? null : codigo;
}
</script>

<template>
  <Teleport to="body">
    <Transition name="modal">
      <div class="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto py-6 px-4">
        <div class="fixed inset-0 bg-black/70 backdrop-blur-sm" @click="emit('close')" />

        <div class="relative w-full max-w-4xl bg-white dark:bg-gray-900 rounded-2xl shadow-2xl
                    border border-gray-200 dark:border-gray-700 z-10">

          <!-- ── Header ─────────────────────────────────────── -->
          <div class="flex items-center justify-between p-5 border-b border-gray-200 dark:border-gray-700">
            <div>
              <h2 class="text-xl font-black flex items-center gap-2">
                🏛️ Análise Buffett
                <span class="text-sm font-normal text-gray-400">— Metodologia Moat</span>
              </h2>
              <p class="text-xs text-gray-400 mt-0.5">
                Consumer Staples · Financeiro · Saúde · Tecnologia · Industrial
                <span class="ml-2 font-semibold"
                  :class="coberturaMoat.presentes === MOAT_SETORES.length ? 'text-green-500' : 'text-amber-500'">
                  {{ coberturaMoat.presentes }}/{{ MOAT_SETORES.length }} pilares cobertos
                </span>
              </p>
            </div>
            <button @click="emit('close')"
              class="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-gray-500">
              ✕
            </button>
          </div>

          <!-- ── Sem dados ──────────────────────────────────── -->
          <div v-if="!temAnalise" class="p-12 text-center text-gray-400">
            <p class="text-4xl mb-3">🔍</p>
            <p class="font-semibold">Execute "Analisar Todos" primeiro</p>
            <p class="text-sm mt-1">A análise Buffett usa os dados fundamentalistas de cada ativo.</p>
          </div>

          <div v-else class="p-5 space-y-5 overflow-y-auto max-h-[80vh]">

            <!-- ── Tabs ───────────────────────────────────── -->
            <div class="flex gap-1 bg-gray-100 dark:bg-gray-800 rounded-xl p-1">
              <button v-for="tab in [
                { key: 'grafico',       label: '📊 Composição'   },
                { key: 'balanceamento', label: '⚖️ Balanceamento' },
                { key: 'simulacao',     label: '💰 Simulação'     },
                { key: 'insights',      label: '💡 Insights'      },
              ]" :key="tab.key"
                @click="activeTab = tab.key as any"
                :class="[
                  'flex-1 py-2 text-xs font-semibold rounded-lg transition-colors',
                  activeTab === tab.key
                    ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                    : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300',
                ]">
                {{ tab.label }}
              </button>
            </div>

            <!-- ════════════════════════════════════════════════
                 TAB: COMPOSIÇÃO
            ═══════════════════════════════════════════════════ -->
            <div v-if="activeTab === 'grafico'" class="space-y-4">
              <div class="grid grid-cols-1 md:grid-cols-2 gap-6 items-center">

                <!-- Rosca SVG -->
                <div class="relative flex justify-center"
                  @mousemove="onDonutMove" @mouseleave="hoverArc = null">
                  <svg viewBox="0 0 200 200" class="w-52 h-52">
                    <path v-for="(arc, i) in arcs" :key="i"
                      :d="arc.d" :fill="arc.cor"
                      class="transition-all hover:opacity-80 cursor-pointer"
                      @mouseenter="hoverArc = arc"
                      @mouseleave="hoverArc = null" />
                    <text x="100" y="96" text-anchor="middle"
                      font-size="10" style="fill:#9ca3af">MOAT</text>
                    <text x="100" y="112" text-anchor="middle"
                      font-size="14" font-weight="bold"
                      :style="{ fill: coberturaMoat.presentes === MOAT_SETORES.length ? '#22c55e' : '#f59e0b' }">
                      {{ coberturaMoat.pct.toFixed(0) }}%
                    </text>
                  </svg>
                  <!-- Tooltip -->
                  <div v-if="hoverArc"
                    class="absolute z-20 pointer-events-none
                           bg-white dark:bg-gray-800
                           border border-gray-200 dark:border-gray-700
                           rounded-xl shadow-xl px-3 py-2 text-xs min-w-[130px]"
                    :style="donutTooltipStyle">
                    <p class="flex items-center gap-1.5 font-semibold text-gray-800 dark:text-gray-100 mb-1">
                      <span class="w-2.5 h-2.5 rounded-full flex-shrink-0"
                        :style="{ backgroundColor: hoverArc.cor }" />
                      {{ hoverArc.emoji }} {{ hoverArc.setor }}
                    </p>
                    <p class="text-lg font-black tabular-nums"
                      :style="{ color: hoverArc.cor }">
                      {{ hoverArc.pct.toFixed(1) }}%
                    </p>
                    <p class="text-gray-400 text-[10px] mt-0.5">do portfólio Moat</p>
                  </div>
                </div>

                <!-- Legenda -->
                <div class="space-y-2">
                  <div v-for="entry in arcEntries" :key="entry.setor"
                    class="flex items-center gap-3">
                    <div class="w-3 h-3 rounded-full flex-shrink-0"
                      :style="{ backgroundColor: entry.cor }" />
                    <span class="text-sm flex-1">{{ entry.emoji }} {{ entry.setor }}</span>
                    <div class="flex-1 bg-gray-100 dark:bg-gray-800 rounded-full h-2">
                      <div class="h-2 rounded-full transition-all"
                        :style="{ width: entry.pct + '%', backgroundColor: entry.cor }" />
                    </div>
                    <span class="text-sm font-bold tabular-nums w-12 text-right">
                      {{ entry.pct.toFixed(1) }}%
                    </span>
                  </div>
                  <div v-for="s in setoresMoat.filter(s => !s.presente)" :key="s.setor"
                    class="flex items-center gap-3 opacity-40">
                    <div class="w-3 h-3 rounded-full flex-shrink-0 border-2"
                      :style="{ borderColor: s.cor }" />
                    <span class="text-sm flex-1">{{ s.emoji }} {{ s.setor }}</span>
                    <span class="text-xs text-red-400">ausente</span>
                  </div>
                </div>
              </div>

              <!-- 5 pilares Moat -->
              <div class="grid grid-cols-5 gap-2">
                <div v-for="s in setoresMoat" :key="s.setor"
                  :class="[
                    'rounded-xl p-3 text-center border-2 transition-all',
                    s.presente ? 'border-transparent' : 'border-dashed border-gray-300 dark:border-gray-700 opacity-50',
                  ]"
                  :style="s.presente ? { backgroundColor: s.cor + '22', borderColor: s.cor + '66' } : {}">
                  <p class="text-xl">{{ s.emoji }}</p>
                  <p class="text-xs font-semibold mt-1 truncate">{{ s.setor }}</p>
                  <p class="text-xs tabular-nums font-bold mt-0.5"
                    :style="{ color: s.presente ? s.cor : '#9ca3af' }">
                    {{ s.presente ? s.pct.toFixed(1) + "%" : "—" }}
                  </p>
                </div>
              </div>

              <!-- Score moat de cada ativo -->
              <div>
                <p class="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
                  Score Moat por Ativo
                </p>
                <div class="space-y-2">
                  <div v-for="r in [...acoesEnriquecidas].sort((a,b) => b.moat.score - a.moat.score)"
                    :key="r.codigo"
                    class="flex items-center gap-3 p-2 bg-gray-50 dark:bg-gray-800 rounded-lg">
                    <span class="font-mono font-bold text-indigo-600 dark:text-indigo-400 w-16 flex-shrink-0">
                      {{ r.codigo }}
                    </span>
                    <span class="text-xs text-gray-400 w-28 flex-shrink-0">
                      {{ (SETOR_EMOJI as any)[r.setor] ?? "📦" }} {{ r.setor }}
                    </span>
                    <div class="flex-1 bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                      <div class="h-2 rounded-full transition-all"
                        :style="{
                          width: r.moat.score + '%',
                          backgroundColor: r.moat.score >= 70 ? '#16a34a' : r.moat.score >= 50 ? '#22c55e' : r.moat.score >= 30 ? '#eab308' : '#ef4444',
                        }" />
                    </div>
                    <span class="text-sm font-bold tabular-nums w-12 text-right"
                      :style="{
                        color: r.moat.score >= 70 ? '#16a34a' : r.moat.score >= 50 ? '#22c55e' : r.moat.score >= 30 ? '#eab308' : '#ef4444',
                      }">
                      {{ r.moat.score.toFixed(0) }}%
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <!-- ════════════════════════════════════════════════
                 TAB: BALANCEAMENTO
            ═══════════════════════════════════════════════════ -->
            <div v-if="activeTab === 'balanceamento'" class="space-y-4">
              <p class="text-xs text-gray-500">
                Top 5 ativos ranqueados pelo <strong>Score Buffett</strong> (60% critérios moat
                + 40% pontuação dos perfis). Clique em um ativo para ver os critérios detalhados.
              </p>

              <div class="space-y-3">
                <div v-for="(r, i) in balanceamento" :key="r.codigo"
                  class="rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">

                  <!-- Linha principal -->
                  <div class="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-800 cursor-pointer
                              hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                    @click="toggleExpandido(r.codigo)">
                    <!-- Rank -->
                    <span class="text-lg font-black w-6 text-center flex-shrink-0"
                      :class="i === 0 ? 'text-yellow-500' : i === 1 ? 'text-gray-400' : i === 2 ? 'text-amber-600' : 'text-gray-500'">
                      {{ i + 1 }}
                    </span>
                    <!-- Ticker + setor -->
                    <div class="w-32 flex-shrink-0">
                      <p class="font-mono font-bold text-indigo-600 dark:text-indigo-400">{{ r.codigo }}</p>
                      <p class="text-xs text-gray-400">
                        {{ (SETOR_EMOJI as any)[r.setor] ?? "📦" }} {{ r.setor }}
                      </p>
                    </div>
                    <!-- Score Buffett -->
                    <div class="w-24 flex-shrink-0 text-center">
                      <p class="text-sm font-bold tabular-nums"
                        :style="{ color: r.scoreBuffett >= 70 ? '#16a34a' : r.scoreBuffett >= 50 ? '#22c55e' : r.scoreBuffett >= 30 ? '#eab308' : '#ef4444' }">
                        {{ r.scoreBuffett.toFixed(0) }}
                        <span class="text-xs text-gray-400 font-normal">/100</span>
                      </p>
                      <p class="text-xs text-gray-400">score</p>
                    </div>
                    <!-- Barra peso -->
                    <div class="flex-1">
                      <div class="flex justify-between text-xs text-gray-400 mb-1">
                        <span>Peso sugerido</span>
                        <span class="font-bold">{{ r.pesoPts.toFixed(1) }}%</span>
                      </div>
                      <div class="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                        <div class="h-2 rounded-full transition-all"
                          :style="{ width: r.pesoPts + '%', backgroundColor: (SETOR_COR as any)[r.setor] ?? '#6b7280' }" />
                      </div>
                    </div>
                    <!-- Expand icon -->
                    <span class="text-gray-400 text-xs flex-shrink-0">
                      {{ expandido === r.codigo ? '▲' : '▼' }}
                    </span>
                  </div>

                  <!-- Critérios Buffett (expansível) -->
                  <div v-if="expandido === r.codigo"
                    class="border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-3 space-y-2">

                    <!-- Critérios moat -->
                    <p class="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
                      Critérios Buffett
                    </p>
                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <div v-for="c in r.moat.criterios" :key="c.nome"
                        :class="[
                          'flex items-start gap-2 p-2 rounded-lg text-xs',
                          c.ok === true  ? 'bg-green-50 dark:bg-green-950/30' :
                          c.ok === false ? 'bg-red-50 dark:bg-red-950/30'     :
                          'bg-gray-50 dark:bg-gray-800',
                        ]">
                        <span class="text-base flex-shrink-0 mt-0.5">
                          {{ c.ok === true ? '✅' : c.ok === false ? '❌' : '❓' }}
                        </span>
                        <div>
                          <p class="font-semibold"
                            :class="c.ok === true ? 'text-green-800 dark:text-green-300' : c.ok === false ? 'text-red-800 dark:text-red-300' : 'text-gray-600 dark:text-gray-400'">
                            {{ c.nome }}
                            <span class="font-mono ml-1 font-bold">{{ c.valor }}</span>
                          </p>
                          <p class="text-gray-500 dark:text-gray-400 mt-0.5">{{ c.descricao }}</p>
                        </div>
                      </div>
                    </div>

                    <!-- Decisões por perfil + analistas -->
                    <div class="flex flex-wrap gap-x-3 gap-y-1.5 pt-2 border-t border-gray-100 dark:border-gray-800 mt-2">
                      <div v-for="p in (['GENERICO','CONSERVADOR','MODERADO','AGRESSIVO'] as const)" :key="p"
                        class="flex items-center gap-1">
                        <span class="text-gray-400 text-xs w-20 truncate flex-shrink-0">
                          {{ { GENERICO:'📊 Genérico', CONSERVADOR:'🛡️ Conserv.', MODERADO:'⚖️ Moderado', AGRESSIVO:'🚀 Agressivo' }[p] }}
                        </span>
                        <span v-if="r.recomendacao?.result?.scores?.[p]"
                          :class="['badge text-xs', decisionBadgeClass(r.recomendacao.result.scores[p].decision)]">
                          {{ r.recomendacao.result.scores[p].emoji }}
                          {{ r.recomendacao.result.scores[p].decision.replace(/_/g, " ") }}
                        </span>
                        <span v-else class="text-xs text-gray-400">—</span>
                      </div>
                      <div v-if="r.recomendacao?.result?.recommendations?.available"
                        class="flex items-center gap-1">
                        <span class="text-gray-400 text-xs w-20 flex-shrink-0">🏦 Analistas</span>
                        <span class="text-xs font-semibold"
                          :style="{ color: r.recomendacao.result.recommendations.currentClassify?.color }">
                          {{ r.recomendacao.result.recommendations.currentClassify?.label }}
                        </span>
                        <span class="text-xs text-gray-400">
                          ({{ r.recomendacao.result.recommendations.numberOfAnalystOpinions }})
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                <div v-if="!balanceamento.length" class="text-center py-8 text-gray-400">
                  <p>Nenhum ativo com score disponível.</p>
                </div>
              </div>

              <div class="p-3 bg-blue-50 dark:bg-blue-950/30 rounded-xl border border-blue-200 dark:border-blue-800 text-xs text-blue-700 dark:text-blue-300">
                <strong>Metodologia Buffett:</strong> "É muito melhor comprar uma empresa maravilhosa
                a um preço justo do que uma empresa justa a um preço maravilhoso." O score combina
                qualidade fundamentalista (ROE, margens, dívida, PEG) com o sinal técnico dos perfis.
              </div>
            </div>

            <!-- ════════════════════════════════════════════════
                 TAB: SIMULAÇÃO
            ═══════════════════════════════════════════════════ -->
            <div v-if="activeTab === 'simulacao'" class="space-y-4">
              <p class="text-xs text-gray-500">
                Informe o valor do aporte. O sistema distribui entre as
                <strong>5 melhores ações Buffett</strong> pelo score moat.
                Use o checkbox para incluir ou excluir ativos — os pesos são redistribuídos automaticamente.
              </p>

              <!-- Input aporte -->
              <div class="flex items-center gap-3">
                <label class="text-sm font-semibold text-gray-600 dark:text-gray-300 flex-shrink-0">
                  💰 Valor do aporte
                </label>
                <div class="relative flex-1 max-w-xs">
                  <span class="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">R$</span>
                  <input v-model="aporteInput" placeholder="0,00"
                    class="input pl-9 text-right tabular-nums font-bold text-lg"
                    @keypress="(e) => { if (!/[\d,.]/.test(e.key)) e.preventDefault(); }" />
                </div>
              </div>

              <!-- Cards com checkbox -->
              <div class="space-y-2">
                <div v-for="(r, i) in balanceamento" :key="r.codigo"
                  :class="[
                    'p-3 rounded-xl border transition-all',
                    desativados.has(r.codigo)
                      ? 'bg-gray-50 dark:bg-gray-800/40 border-gray-200 dark:border-gray-700 opacity-50'
                      : 'bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700',
                  ]">
                  <!-- Cabeçalho do card -->
                  <div class="flex items-center gap-3 mb-2">
                    <label class="flex items-center cursor-pointer flex-shrink-0"
                      :title="desativados.has(r.codigo) ? 'Incluir no cálculo' : 'Remover do cálculo'">
                      <input type="checkbox"
                        :checked="!desativados.has(r.codigo)"
                        @change="toggleAtivo(r.codigo)"
                        class="w-4 h-4 rounded accent-indigo-600 cursor-pointer" />
                    </label>
                    <span class="font-black text-sm w-5 text-center flex-shrink-0"
                      :class="i === 0 ? 'text-yellow-500' : i === 1 ? 'text-gray-400' : i === 2 ? 'text-amber-600' : 'text-gray-500'">
                      {{ i + 1 }}
                    </span>
                    <span class="font-mono font-bold text-indigo-600 dark:text-indigo-400">{{ r.codigo }}</span>
                    <span class="text-xs text-gray-400 flex-1">
                      {{ (SETOR_EMOJI as any)[r.setor] }} {{ r.setor }}
                      · moat {{ r.moat.score.toFixed(0) }}%
                    </span>
                    <span v-if="!desativados.has(r.codigo) && aporte" class="text-xs text-gray-400 flex-shrink-0">
                      {{ (simulacao.find(s => s.codigo === r.codigo)?.pesoRedist ?? 0).toFixed(1) }}% do aporte
                    </span>
                    <span v-else-if="desativados.has(r.codigo)" class="text-xs text-red-400 flex-shrink-0">
                      excluído
                    </span>
                  </div>

                  <!-- Valores calculados -->
                  <div v-if="!desativados.has(r.codigo) && aporte" class="grid grid-cols-3 gap-2 text-sm">
                    <div class="text-center p-2 bg-white dark:bg-gray-900 rounded-lg">
                      <p class="text-xs text-gray-400">Valor a aportar</p>
                      <p class="font-bold tabular-nums text-indigo-600 dark:text-indigo-400">
                        {{ fmtCurrency(simulacao.find(s => s.codigo === r.codigo)?.valorAlocar ?? null) }}
                      </p>
                    </div>
                    <div class="text-center p-2 bg-white dark:bg-gray-900 rounded-lg">
                      <p class="text-xs text-gray-400">Preço atual</p>
                      <p class="font-bold tabular-nums">{{ fmtCurrency(r.precoFechamento) }}</p>
                    </div>
                    <div class="text-center p-2 bg-white dark:bg-gray-900 rounded-lg">
                      <p class="text-xs text-gray-400">Qtd. inteira</p>
                      <p class="font-bold tabular-nums text-green-600 dark:text-green-400">
                        {{ simulacao.find(s => s.codigo === r.codigo)?.qtd ?? 0 }} ações
                      </p>
                      <p class="text-xs text-gray-400">
                        = {{ fmtCurrency(simulacao.find(s => s.codigo === r.codigo)?.realAlocado ?? null) }}
                      </p>
                    </div>
                  </div>
                  <div v-if="!desativados.has(r.codigo) && aporte"
                    class="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-1.5 mt-2">
                    <div class="h-1.5 rounded-full transition-all"
                      :style="{
                        width: (simulacao.find(s => s.codigo === r.codigo)?.pesoRedist ?? 0) + '%',
                        backgroundColor: (SETOR_COR as any)[r.setor] ?? '#6b7280',
                      }" />
                  </div>
                </div>
              </div>

              <!-- Resumo -->
              <div v-if="aporte && simulacao.length"
                class="flex items-center justify-between p-3 bg-indigo-50 dark:bg-indigo-950/40
                       border border-indigo-200 dark:border-indigo-800 rounded-xl">
                <div>
                  <p class="text-xs text-indigo-400">Total efetivamente alocado</p>
                  <p class="text-xl font-black tabular-nums text-indigo-600 dark:text-indigo-400">
                    {{ fmtCurrency(totalSimulado) }}
                  </p>
                  <p class="text-xs text-gray-400 mt-0.5">
                    {{ simulacao.length }}/{{ balanceamento.length }} ações incluídas
                  </p>
                </div>
                <div class="text-right">
                  <p class="text-xs text-gray-400">Troco (frações)</p>
                  <p class="text-sm font-bold tabular-nums text-gray-500">
                    {{ fmtCurrency((aporte ?? 0) - totalSimulado) }}
                  </p>
                </div>
              </div>
              <div v-if="!aporte" class="text-center py-6 text-gray-400">
                <p class="text-3xl mb-2">💰</p>
                <p class="text-sm">Digite o valor do aporte para simular</p>
              </div>
              <div v-if="aporte && !simulacao.length" class="text-center py-6 text-amber-400">
                <p class="text-2xl mb-2">⚠️</p>
                <p class="text-sm">Nenhuma ação selecionada. Marque ao menos uma.</p>
              </div>
            </div>

            <!-- ════════════════════════════════════════════════
                 TAB: INSIGHTS
            ═══════════════════════════════════════════════════ -->
            <div v-if="activeTab === 'insights'" class="space-y-3">
              <div v-for="(ins, i) in insights" :key="i"
                :class="[
                  'flex items-start gap-3 p-3 rounded-xl text-sm',
                  ins.tipo === 'warn' ? 'bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800' :
                  ins.tipo === 'ok'   ? 'bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800' :
                  'bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800',
                ]">
                <span class="text-lg flex-shrink-0">
                  {{ ins.tipo === 'warn' ? '⚠️' : ins.tipo === 'ok' ? '✅' : 'ℹ️' }}
                </span>
                <p :class="
                  ins.tipo === 'warn' ? 'text-amber-800 dark:text-amber-200' :
                  ins.tipo === 'ok'   ? 'text-green-800 dark:text-green-200' :
                  'text-blue-800 dark:text-blue-200'">
                  {{ ins.msg }}
                </p>
              </div>

              <!-- Tabela resumo -->
              <div class="mt-4">
                <p class="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
                  Todos os ativos — critérios Buffett
                </p>
                <div class="overflow-x-auto">
                  <table class="w-full text-xs">
                    <thead>
                      <tr class="text-gray-400 border-b border-gray-200 dark:border-gray-700">
                        <th class="py-1.5 pr-3 text-left">Ativo</th>
                        <th class="py-1.5 pr-3 text-left">Setor</th>
                        <th class="py-1.5 pr-3 text-right">Moat</th>
                        <th class="py-1.5 pr-3 text-right">ROE</th>
                        <th class="py-1.5 pr-3 text-right">Margem</th>
                        <th class="py-1.5 pr-3 text-right">Dív/EBIT</th>
                        <th class="py-1.5 text-right">Score</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr v-for="r in [...acoesEnriquecidas].sort((a,b) => b.scoreBuffett - a.scoreBuffett)"
                        :key="r.codigo"
                        class="border-b border-gray-100 dark:border-gray-800">
                        <td class="py-1.5 pr-3 font-mono font-bold text-indigo-500">{{ r.codigo }}</td>
                        <td class="py-1.5 pr-3">
                          {{ (SETOR_EMOJI as any)[r.setor] ?? "📦" }}
                          <span :class="MOAT_SETORES.includes(r.setor) ? 'text-green-600 dark:text-green-400' : 'text-gray-400'">
                            {{ r.setor }}
                          </span>
                        </td>
                        <td class="py-1.5 pr-3 text-right tabular-nums font-bold"
                          :style="{ color: r.moat.score >= 70 ? '#16a34a' : r.moat.score >= 50 ? '#22c55e' : r.moat.score >= 30 ? '#eab308' : '#ef4444' }">
                          {{ r.moat.score.toFixed(0) }}%
                        </td>
                        <td class="py-1.5 pr-3 text-right tabular-nums">
                          {{ r.recomendacao?.result?.fundamental?.roe?.value != null
                              ? r.recomendacao.result.fundamental.roe.value.toFixed(1) + "%"
                              : "—" }}
                        </td>
                        <td class="py-1.5 pr-3 text-right tabular-nums">
                          {{ r.recomendacao?.result?.fundamental?.margemLiquida?.value != null
                              ? r.recomendacao.result.fundamental.margemLiquida.value.toFixed(1) + "%"
                              : "—" }}
                        </td>
                        <td class="py-1.5 pr-3 text-right tabular-nums">
                          {{ r.recomendacao?.result?.fundamental?.dividaEbitda?.value != null
                              ? r.recomendacao.result.fundamental.dividaEbitda.value.toFixed(2) + "x"
                              : "—" }}
                        </td>
                        <td class="py-1.5 text-right tabular-nums font-bold"
                          :style="{ color: r.scoreBuffett >= 70 ? '#16a34a' : r.scoreBuffett >= 50 ? '#22c55e' : r.scoreBuffett >= 30 ? '#eab308' : '#ef4444' }">
                          {{ r.scoreBuffett.toFixed(0) }}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

          </div><!-- /v-else -->
        </div><!-- /modal -->
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.modal-enter-active, .modal-leave-active { transition: opacity 0.2s ease; }
.modal-enter-from, .modal-leave-to       { opacity: 0; }
</style>