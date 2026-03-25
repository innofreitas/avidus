<script setup lang="ts">
import { ref, computed, watch } from "vue";
import type { AnalysisResult } from "@/types";
import { decisionColor, decisionBadgeClass } from "@/utils/formatters";

// ─── Props ────────────────────────────────────────────────────

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

// ─── Metodologia BEST ────────────────────────────────────────
// Barsi classifica setores em 5 pilares:
const BEST_MAP: Record<string, { setor: string; cor: string; emoji: string }> = {
  // Bancos / Financeiro
  bank:        { setor: "Bancos",           cor: "#3b82f6", emoji: "🏦" },
  financial:   { setor: "Bancos",           cor: "#3b82f6", emoji: "🏦" },
  insurance:   { setor: "Seguridade",       cor: "#8b5cf6", emoji: "🛡️" },
  // Energia
  energy:      { setor: "Energia",          cor: "#f59e0b", emoji: "⚡" },
  utilities:   { setor: "Energia",          cor: "#f59e0b", emoji: "⚡" },
  // Saneamento / Infraestrutura
  sanitation:  { setor: "Saneamento",       cor: "#06b6d4", emoji: "💧" },
  water:       { setor: "Saneamento",       cor: "#06b6d4", emoji: "💧" },
  // Telecomunicações / Seguridade
  telecom:     { setor: "Telecom",          cor: "#10b981", emoji: "📡" },
  communication:{ setor: "Telecom",         cor: "#10b981", emoji: "📡" },
};

// Mapeamento manual de tickers B3 conhecidos para o BEST
const TICKER_SETOR: Record<string, string> = {
  // Bancos
  ITUB: "Bancos", BBDC: "Bancos", BBAS: "Bancos", SANB: "Bancos",
  BPAC: "Bancos", BMGB: "Bancos", BRSR: "Bancos", ABCB: "Bancos",
  // Seguridade
  BBSE: "Seguridade", IRBR: "Seguridade", PSSA: "Seguridade",
  CXSE: "Seguridade", SULA: "Seguridade",
  // Energia
  ELET: "Energia", CMIG: "Energia", CPFE: "Energia", ENBR: "Energia",
  ENGI: "Energia", EQTL: "Energia", ENEV: "Energia", CPLE: "Energia",
  NEOE: "Energia", EGIE: "Energia", TAEE: "Energia", AURE: "Energia",
  CESP: "Energia", TIET: "Energia", AESB: "Energia",
  // Saneamento
  SAPR: "Saneamento", CSMG: "Saneamento", SBSP: "Saneamento",
  SANB3: "Saneamento", IGUASANI: "Saneamento",
  // Telecomunicações
  VIVT: "Telecom", TIMS: "Telecom", OIBR: "Telecom", TELB: "Telecom",
};

const SETOR_COR: Record<string, string> = {
  Bancos:     "#3b82f6",
  Seguridade: "#8b5cf6",
  Energia:    "#f59e0b",
  Saneamento: "#06b6d4",
  Telecom:    "#10b981",
  Outros:     "#6b7280",
};
const SETOR_EMOJI: Record<string, string> = {
  Bancos: "🏦", Seguridade: "🛡️", Energia: "⚡", Saneamento: "💧", Telecom: "📡", Outros: "📦",
};
const BEST_SETORES = ["Bancos", "Energia", "Saneamento", "Telecom", "Seguridade"];

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
  // 1. Tenta pelo ticker (prefixo 4 chars)
  const prefix = row.codigo.replace(/\d+.*$/, "").toUpperCase();
  if (TICKER_SETOR[prefix]) return TICKER_SETOR[prefix];
  if (TICKER_SETOR[row.codigo.toUpperCase()]) return TICKER_SETOR[row.codigo.toUpperCase()];

  // 2. Tenta pelo setor vindo da análise
  const sector = (row.recomendacao?.result?.meta?.sector ?? "").toLowerCase();
  const industry = (row.recomendacao?.result?.meta?.industry ?? "").toLowerCase();
  const combined = sector + " " + industry;

  for (const [key, val] of Object.entries(BEST_MAP)) {
    if (combined.includes(key)) return val.setor;
  }
  return "Outros";
}

// ─── Computed ─────────────────────────────────────────────────

// Apenas ações com análise concluída
const acoesAnalisadas = computed(() =>
  props.acoes.filter(r => r.recomendacao?.result != null)
);

const temAnalise = computed(() => acoesAnalisadas.value.length > 0);

// Enriquece cada ação com setor e pontuação
const acoesEnriquecidas = computed(() =>
  acoesAnalisadas.value.map(row => ({
    ...row,
    setor:  detectarSetor(row),
    pts:    pontuacao(row) ?? 0,
    valor:  row.valorAtualizado ?? 0,
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

// Setores BEST presentes vs ausentes
const setoresBEST = computed(() =>
  BEST_SETORES.map(s => ({
    setor:    s,
    presente: !!porSetor.value[s],
    pct:      porSetor.value[s]?.pct ?? 0,
    cor:      SETOR_COR[s],
    emoji:    SETOR_EMOJI[s],
  }))
);

const coberturaBEST = computed(() => {
  const presentes = setoresBEST.value.filter(s => s.presente).length;
  return { total: BEST_SETORES.length, presentes, pct: (presentes / BEST_SETORES.length) * 100 };
});

// Top 5 ações por pontuação (com análise)
const top5 = computed(() =>
  [...acoesEnriquecidas.value]
    .filter(r => r.pts > 0)
    .sort((a, b) => b.pts - a.pts)
    .slice(0, 5)
);

// ─── Balanceamento sugerido ────────────────────────────────────
// Barsi sugere distribuição equilibrada entre os 5 pilares BEST
const PESO_IDEAL_SETOR = 20; // 20% por setor no BEST puro

const balanceamento = computed(() => {
  if (!top5.value.length) return [];
  // Peso por pontuação relativa dentro do top5
  const totalPts = top5.value.reduce((s, r) => s + r.pts, 0);
  return top5.value.map(r => ({
    ...r,
    pesoPts: totalPts > 0 ? (r.pts / totalPts) * 100 : 20,
  }));
});

// ─── Simulação de aporte ──────────────────────────────────────
const aporte      = ref<number | null>(null);
const aporteInput = ref("");
// Set com os tickers DESATIVADOS pelo checkbox — começa vazio (todos ativos)
const desativados = ref<Set<string>>(new Set());

watch(aporteInput, v => {
  const x = parseFloat(v.replace(/\./g, "").replace(",", "."));
  aporte.value = isFinite(x) && x > 0 ? x : null;
});

function toggleAtivo(codigo: string) {
  const s = new Set(desativados.value);
  s.has(codigo) ? s.delete(codigo) : s.add(codigo);
  desativados.value = s;  // troca referência para disparar reatividade
}

const simulacao = computed(() => {
  const val = aporte.value;
  if (!val || !balanceamento.value.length) return [];

  // Apenas os ativos com checkbox marcado
  const ativos = balanceamento.value.filter(r => !desativados.value.has(r.codigo));
  if (!ativos.length) return [];

  // Redistribui os pesos proporcionalmente entre os ativos selecionados
  const totalPts = ativos.reduce((s, r) => s + r.pts, 0);
  return ativos.map(r => {
    const pesoRedist = totalPts > 0 ? (r.pts / totalPts) * 100 : 100 / ativos.length;
    const valorAlocar = (pesoRedist / 100) * val;
    const preco = r.precoFechamento ?? 0;
    const qtd   = preco > 0 ? Math.floor(valorAlocar / preco) : 0;
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

  // Cobertura BEST
  const ausentes = setoresBEST.value.filter(s => !s.presente).map(s => s.setor);
  if (ausentes.length > 0) {
    list.push({ tipo: "warn", msg: `Você não tem nenhum ativo nos setores BEST: ${ausentes.join(", ")}. Barsi recomenda diversificação nesses pilares.` });
  }

  // Concentração por setor
  for (const [setor, data] of Object.entries(porSetor.value)) {
    if (data.pct > 40) {
      list.push({ tipo: "warn", msg: `${SETOR_EMOJI[setor] ?? "⚠️"} Você está muito concentrado em ${setor} (${data.pct.toFixed(1)}% do valor investido em ações). Considere diversificar.` });
    }
  }

  // Concentração individual
  for (const r of acoesEnriquecidas.value) {
    const pct = total > 0 ? (r.valor / total) * 100 : 0;
    if (pct > 30) {
      const rec = r.recomendacao?.result?.scores?.MODERADO;
      const momento = rec ? ` Apesar de estar em ${rec.emoji} ${rec.decision.replace(/_/g, " ")} agora,` : "";
      list.push({ tipo: "warn", msg: `${r.codigo} representa ${pct.toFixed(1)}% do valor em ações.${momento} concentração excessiva traz risco.` });
    }
  }

  // Top ações com bom score
  for (const r of top5.value.slice(0, 3)) {
    const rec = r.recomendacao?.result?.scores?.MODERADO;
    if (rec && (rec.decision === "COMPRA_FORTE" || rec.decision === "COMPRA")) {
      const pct = total > 0 ? (r.valor / total) * 100 : 0;
      list.push({ tipo: "ok", msg: `${r.codigo} (${SETOR_EMOJI[r.setor]} ${r.setor}) tem score de ${r.pts.toFixed(0)}/400 e recomendação ${rec.emoji} ${rec.decision.replace(/_/g, " ")} — boa opção para aportar.` });
    }
  }

  // Cobertura completa
  if (coberturaBEST.value.presentes === BEST_SETORES.length) {
    list.push({ tipo: "ok", msg: "✅ Parabéns! Sua carteira cobre todos os 5 pilares do Método BEST de Barsi." });
  } else {
    list.push({ tipo: "info", msg: `Sua carteira cobre ${coberturaBEST.value.presentes}/${BEST_SETORES.length} pilares BEST. Meta: ter ao menos 1 ativo em Bancos, Energia, Saneamento, Telecom e Seguridade.` });
  }

  return list;
});

// ─── Gráfico de rosca (SVG) ────────────────────────────────────

interface ArcEntry { setor: string; pct: number; cor: string; emoji: string }

const arcEntries = computed((): ArcEntry[] => {
  const all = Object.entries(porSetor.value).map(([setor, d]) => ({
    setor, pct: d.pct, cor: SETOR_COR[setor] ?? "#6b7280", emoji: SETOR_EMOJI[setor] ?? "📦",
  }));
  return all.sort((a, b) => b.pct - a.pct);
});

function buildArcs(entries: ArcEntry[]) {
  const cx = 100, cy = 100, r = 70, innerR = 40;
  let angle = -90;
  const arcs: { d: string; cor: string; setor: string; pct: number; emoji: string; midX: number; midY: number }[] = [];

  for (const e of entries) {
    if (e.pct < 0.5) continue;
    const sweep = (e.pct / 100) * 360;
    const start = angle;
    const end   = angle + sweep;
    const largeArc = sweep > 180 ? 1 : 0;

    const toRad = (deg: number) => (deg * Math.PI) / 180;
    const x1 = cx + r * Math.cos(toRad(start));
    const y1 = cy + r * Math.sin(toRad(start));
    const x2 = cx + r * Math.cos(toRad(end));
    const y2 = cy + r * Math.sin(toRad(end));
    const ix1 = cx + innerR * Math.cos(toRad(end));
    const iy1 = cy + innerR * Math.sin(toRad(end));
    const ix2 = cx + innerR * Math.cos(toRad(start));
    const iy2 = cy + innerR * Math.sin(toRad(start));

    const midAngle = start + sweep / 2;
    const midR = (r + innerR) / 2 + 8;
    const midX = cx + midR * Math.cos(toRad(midAngle));
    const midY = cy + midR * Math.sin(toRad(midAngle));

    const d = `M ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2} L ${ix1} ${iy1} A ${innerR} ${innerR} 0 ${largeArc} 0 ${ix2} ${iy2} Z`;
    arcs.push({ d, cor: e.cor, setor: e.setor, pct: e.pct, emoji: e.emoji, midX, midY });
    angle += sweep;
  }
  return arcs;
}

const arcs = computed(() => buildArcs(arcEntries.value));

// ─── Tabs do modal ────────────────────────────────────────────
const activeTab = ref<"grafico" | "balanceamento" | "simulacao" | "insights">("grafico");
</script>

<template>
  <Teleport to="body">
    <Transition name="modal">
      <div class="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto py-6 px-4">
        <!-- Backdrop -->
        <div class="fixed inset-0 bg-black/70 backdrop-blur-sm" @click="emit('close')" />

        <!-- Modal -->
        <div class="relative w-full max-w-4xl bg-white dark:bg-gray-900 rounded-2xl shadow-2xl
                    border border-gray-200 dark:border-gray-700 z-10">

          <!-- ── Header ──────────────────────────────────────── -->
          <div class="flex items-center justify-between p-5 border-b border-gray-200 dark:border-gray-700">
            <div>
              <h2 class="text-xl font-black flex items-center gap-2">
                🎯 Análise Barsi
                <span class="text-sm font-normal text-gray-400">— Método BEST</span>
              </h2>
              <p class="text-xs text-gray-400 mt-0.5">
                Bancos · Energia · Saneamento · Telecom / Seguridade
                <span class="ml-2 font-semibold"
                  :class="coberturaBEST.presentes === BEST_SETORES.length ? 'text-green-500' : 'text-amber-500'">
                  {{ coberturaBEST.presentes }}/{{ BEST_SETORES.length }} pilares cobertos
                </span>
              </p>
            </div>
            <button @click="emit('close')"
              class="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-gray-500">
              ✕
            </button>
          </div>

          <!-- ── Sem dados ─────────────────────────────────────── -->
          <div v-if="!temAnalise" class="p-12 text-center text-gray-400">
            <p class="text-4xl mb-3">🔍</p>
            <p class="font-semibold">Execute "Analisar Todos" primeiro</p>
            <p class="text-sm mt-1">A análise Barsi usa os scores calculados de cada ativo.</p>
          </div>

          <div v-else class="p-5 space-y-5 overflow-y-auto max-h-[80vh]">

            <!-- ── Tabs ──────────────────────────────────────── -->
            <div class="flex gap-1 bg-gray-100 dark:bg-gray-800 rounded-xl p-1">
              <button v-for="tab in [
                { key: 'grafico',        label: '📊 Composição'    },
                { key: 'balanceamento',  label: '⚖️ Balanceamento'  },
                { key: 'simulacao',      label: '💰 Simulação'      },
                { key: 'insights',       label: '💡 Insights'       },
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

            <!-- ══════════════════════════════════════════════════
                 TAB: COMPOSIÇÃO (gráfico)
            ═══════════════════════════════════════════════════ -->
            <div v-if="activeTab === 'grafico'" class="space-y-4">
              <div class="grid grid-cols-1 md:grid-cols-2 gap-6 items-center">

                <!-- Rosca SVG -->
                <div class="flex justify-center">
                  <svg viewBox="0 0 200 200" class="w-52 h-52">
                    <path v-for="(arc, i) in arcs" :key="i"
                      :d="arc.d" :fill="arc.cor"
                      class="transition-all hover:opacity-80 cursor-default"
                      :title="`${arc.setor}: ${arc.pct.toFixed(1)}%`" />
                    <!-- Centro -->
                    <text x="100" y="96" text-anchor="middle"
                      class="text-xs" font-size="11" fill="currentColor"
                      style="fill: #9ca3af">BEST</text>
                    <text x="100" y="112" text-anchor="middle"
                      font-size="14" font-weight="bold" fill="currentColor"
                      :style="{ fill: coberturaBEST.presentes === BEST_SETORES.length ? '#22c55e' : '#f59e0b' }">
                      {{ coberturaBEST.pct.toFixed(0) }}%
                    </text>
                  </svg>
                </div>

                <!-- Legenda -->
                <div class="space-y-2">
                  <!-- Setores BEST presentes -->
                  <div v-for="entry in arcEntries" :key="entry.setor"
                    class="flex items-center gap-3">
                    <div class="w-3 h-3 rounded-full flex-shrink-0" :style="{ backgroundColor: entry.cor }" />
                    <span class="text-sm flex-1">{{ entry.emoji }} {{ entry.setor }}</span>
                    <div class="flex-1 bg-gray-100 dark:bg-gray-800 rounded-full h-2">
                      <div class="h-2 rounded-full transition-all"
                        :style="{ width: entry.pct + '%', backgroundColor: entry.cor }" />
                    </div>
                    <span class="text-sm font-bold tabular-nums w-12 text-right">
                      {{ entry.pct.toFixed(1) }}%
                    </span>
                  </div>
                  <!-- Setores BEST ausentes -->
                  <div v-for="s in setoresBEST.filter(s => !s.presente)" :key="s.setor"
                    class="flex items-center gap-3 opacity-40">
                    <div class="w-3 h-3 rounded-full flex-shrink-0 border-2"
                      :style="{ borderColor: s.cor }" />
                    <span class="text-sm flex-1">{{ s.emoji }} {{ s.setor }}</span>
                    <span class="text-xs text-red-400">ausente</span>
                  </div>
                </div>
              </div>

              <!-- Pilares BEST cards -->
              <div class="grid grid-cols-5 gap-2">
                <div v-for="s in setoresBEST" :key="s.setor"
                  :class="[
                    'rounded-xl p-3 text-center border-2 transition-all',
                    s.presente
                      ? 'border-transparent'
                      : 'border-dashed border-gray-300 dark:border-gray-700 opacity-50',
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
            </div>

            <!-- ══════════════════════════════════════════════════
                 TAB: BALANCEAMENTO
            ═══════════════════════════════════════════════════ -->
            <div v-if="activeTab === 'balanceamento'" class="space-y-4">
              <p class="text-xs text-gray-500">
                Sugestão de balanceamento para os <strong>5 melhores ativos</strong> da carteira,
                ponderada pelo score BEST. Ideal: distribuição equilibrada entre os pilares.
              </p>

              <div class="space-y-3">
                <div v-for="(r, i) in balanceamento" :key="r.codigo"
                  class="p-3 bg-gray-50 dark:bg-gray-800 rounded-xl space-y-3">

                  <!-- Linha 1: Rank + Ticker + Score + Barra -->
                  <div class="flex items-center gap-3">
                    <!-- Rank -->
                    <span class="text-lg font-black w-6 text-center flex-shrink-0"
                      :class="i === 0 ? 'text-yellow-500' : i === 1 ? 'text-gray-400' : i === 2 ? 'text-amber-600' : 'text-gray-500'">
                      {{ i + 1 }}
                    </span>
                    <!-- Ticker + setor -->
                    <div class="w-28 flex-shrink-0">
                      <p class="font-mono font-bold text-indigo-600 dark:text-indigo-400">{{ r.codigo }}</p>
                      <p class="text-xs text-gray-400">
                        {{ (SETOR_EMOJI as any)[r.setor] ?? "📦" }} {{ r.setor }}
                      </p>
                    </div>
                    <!-- Score -->
                    <div class="w-20 flex-shrink-0 text-center">
                      <p class="text-sm font-bold tabular-nums"
                        :style="{ color: r.pts >= 300 ? '#16a34a' : r.pts >= 200 ? '#22c55e' : r.pts >= 140 ? '#eab308' : '#ef4444' }">
                        {{ r.pts.toFixed(0) }}/400
                      </p>
                      <p class="text-xs text-gray-400">score</p>
                    </div>
                    <!-- Barra de peso sugerido -->
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
                  </div>

                  <!-- Linha 2: Decisões por perfil + analistas -->
                  <div class="flex flex-wrap gap-x-3 gap-y-1.5 pl-9 border-t border-gray-200 dark:border-gray-700 pt-2">
                    <!-- 4 perfis -->
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
                    <!-- Analistas -->
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

                <div v-if="!balanceamento.length" class="text-center py-8 text-gray-400">
                  <p>Nenhum ativo com pontuação disponível.</p>
                </div>
              </div>

              <!-- Nota metodológica -->
              <div class="p-3 bg-amber-50 dark:bg-amber-950/30 rounded-xl border border-amber-200 dark:border-amber-800 text-xs text-amber-700 dark:text-amber-300">
                <strong>Método BEST (Barsi):</strong> Foco em empresas pagadoras de dividendos recorrentes
                nos setores de Bancos, Energia, Saneamento, Telecom e Seguridade. O peso sugerido acima
                é calculado proporcionalmente à pontuação de cada ativo.
              </div>
            </div>

            <!-- ══════════════════════════════════════════════════
                 TAB: SIMULAÇÃO
            ═══════════════════════════════════════════════════ -->
            <div v-if="activeTab === 'simulacao'" class="space-y-4">
              <p class="text-xs text-gray-500">
                Informe o valor do aporte e o sistema calcula quanto investir em cada uma das
                <strong>5 melhores ações</strong>, proporcional ao score.
              </p>

              <!-- Input de aporte -->
              <div class="flex items-center gap-3">
                <label class="text-sm font-semibold text-gray-600 dark:text-gray-300 flex-shrink-0">
                  💰 Valor do aporte
                </label>
                <div class="relative flex-1 max-w-xs">
                  <span class="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">R$</span>
                  <input v-model="aporteInput"
                    placeholder="0,00"
                    class="input pl-9 text-right tabular-nums font-bold text-lg"
                    @keypress="(e) => { if (!/[\d,.]/.test(e.key)) e.preventDefault(); }" />
                </div>
              </div>

              <!-- Lista de ativos com checkbox + resultado -->
              <div class="space-y-2">
                <div v-for="(r, i) in balanceamento" :key="r.codigo"
                  :class="[
                    'p-3 rounded-xl border transition-all',
                    desativados.has(r.codigo)
                      ? 'bg-gray-50 dark:bg-gray-800/40 border-gray-200 dark:border-gray-700 opacity-50'
                      : 'bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700',
                  ]">
                  <!-- Cabeçalho do card: checkbox + rank + ticker + peso redistribuído -->
                  <div class="flex items-center gap-3 mb-2">
                    <!-- Checkbox -->
                    <label class="flex items-center cursor-pointer flex-shrink-0" :title="desativados.has(r.codigo) ? 'Incluir no cálculo' : 'Remover do cálculo'">
                      <input type="checkbox"
                        :checked="!desativados.has(r.codigo)"
                        @change="toggleAtivo(r.codigo)"
                        class="w-4 h-4 rounded accent-indigo-600 cursor-pointer" />
                    </label>
                    <!-- Rank -->
                    <span class="font-black text-sm w-5 text-center flex-shrink-0"
                      :class="i === 0 ? 'text-yellow-500' : i === 1 ? 'text-gray-400' : i === 2 ? 'text-amber-600' : 'text-gray-500'">
                      {{ i + 1 }}
                    </span>
                    <!-- Ticker + setor -->
                    <span class="font-mono font-bold text-indigo-600 dark:text-indigo-400">{{ r.codigo }}</span>
                    <span class="text-xs text-gray-400 flex-1">{{ (SETOR_EMOJI as any)[r.setor] }} {{ r.setor }}</span>
                    <!-- Peso redistribuído (só quando ativo e há aporte) -->
                    <span v-if="!desativados.has(r.codigo) && aporte"
                      class="text-xs text-gray-400 flex-shrink-0">
                      {{ (simulacao.find(s => s.codigo === r.codigo)?.pesoRedist ?? 0).toFixed(1) }}% do aporte
                    </span>
                    <span v-else-if="desativados.has(r.codigo)"
                      class="text-xs text-red-400 flex-shrink-0">excluído</span>
                  </div>

                  <!-- Resultado do cálculo (só quando ativo e há aporte) -->
                  <div v-if="!desativados.has(r.codigo) && aporte"
                    class="grid grid-cols-3 gap-2 text-sm">
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

                  <!-- Barra do peso redistribuído -->
                  <div v-if="!desativados.has(r.codigo) && aporte"
                    class="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-1.5 mt-2">
                    <div class="h-1.5 rounded-full transition-all"
                      :style="{
                        width: (simulacao.find(s => s.codigo === r.codigo)?.pesoRedist ?? 0) + '%',
                        backgroundColor: (SETOR_COR as any)[r.setor] ?? '#6b7280'
                      }" />
                  </div>
                </div>
              </div>

              <!-- Resumo total -->
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

              <!-- Estado vazio -->
              <div v-if="!aporte" class="text-center py-6 text-gray-400">
                <p class="text-3xl mb-2">💰</p>
                <p class="text-sm">Digite o valor do aporte para simular</p>
              </div>
              <div v-if="aporte && !simulacao.length" class="text-center py-6 text-amber-400">
                <p class="text-2xl mb-2">⚠️</p>
                <p class="text-sm">Nenhuma ação selecionada. Marque ao menos uma.</p>
              </div>
            </div>

            <!-- ══════════════════════════════════════════════════
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

              <!-- Tabela resumo dos ativos analisados -->
              <div class="mt-4">
                <p class="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
                  Todos os ativos classificados
                </p>
                <div class="overflow-x-auto">
                  <table class="w-full text-xs">
                    <thead>
                      <tr class="text-gray-400 border-b border-gray-200 dark:border-gray-700">
                        <th class="py-1.5 pr-3 text-left">Ativo</th>
                        <th class="py-1.5 pr-3 text-left">Setor</th>
                        <th class="py-1.5 pr-3 text-right">Valor</th>
                        <th class="py-1.5 pr-3 text-right">% Cart.</th>
                        <th class="py-1.5 text-right">Score</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr v-for="r in [...acoesEnriquecidas].sort((a, b) => b.pts - a.pts)" :key="r.codigo"
                        class="border-b border-gray-100 dark:border-gray-800">
                        <td class="py-1.5 pr-3 font-mono font-bold text-indigo-500">{{ r.codigo }}</td>
                        <td class="py-1.5 pr-3">
                          <span class="inline-flex items-center gap-1">
                            {{ (SETOR_EMOJI as any)[r.setor] ?? "📦" }}
                            <span :class="BEST_SETORES.includes(r.setor) ? 'text-green-600 dark:text-green-400' : 'text-gray-400'">
                              {{ r.setor }}
                            </span>
                          </span>
                        </td>
                        <td class="py-1.5 pr-3 text-right tabular-nums">{{ fmtCurrency(r.valor) }}</td>
                        <td class="py-1.5 pr-3 text-right tabular-nums">
                          {{ acoesEnriquecidas.reduce((s, x) => s + x.valor, 0) > 0
                            ? ((r.valor / acoesEnriquecidas.reduce((s, x) => s + x.valor, 0)) * 100).toFixed(1) + "%"
                            : "—" }}
                        </td>
                        <td class="py-1.5 text-right tabular-nums font-bold"
                          :style="{ color: r.pts >= 300 ? '#16a34a' : r.pts >= 200 ? '#22c55e' : r.pts >= 140 ? '#eab308' : '#ef4444' }">
                          {{ r.pts > 0 ? r.pts.toFixed(0) : "—" }}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

          </div><!-- /v-else (tem análise) -->
        </div><!-- /modal -->
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.modal-enter-active, .modal-leave-active { transition: opacity 0.2s ease; }
.modal-enter-from, .modal-leave-to       { opacity: 0; }
</style>