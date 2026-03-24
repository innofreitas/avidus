<script setup lang="ts">
import { ref, computed, watch, onMounted } from "vue";
import type { AnalysisResult } from "@/types";
import { decisionBadgeClass } from "@/utils/formatters";
import api from "@/utils/api";

// ─── Props / Emits ────────────────────────────────────────────

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

// ─── Estado ───────────────────────────────────────────────────

// rawData do cache indexado por ticker (sem .SA)
const cacheMap = ref<Record<string, Record<string, any>>>({});
const loadingCache = ref(false);
const cacheError   = ref<string | null>(null);

onMounted(async () => {
  loadingCache.value = true;
  cacheError.value   = null;
  try {
    const res = await api.get<{ success: boolean; data: { ticker: string; rawData: Record<string, any> }[] }>("/stock/cache");
    const entries = res.data.data ?? [];
    // Pega apenas a entrada mais recente por ticker (já vem ordenado por ticker asc, date desc)
    const seen = new Set<string>();
    for (const e of entries) {
      const key = e.ticker.replace(/\.SA$/i, "").toUpperCase();
      if (!seen.has(key)) {
        cacheMap.value[key] = e.rawData;
        seen.add(key);
      }
    }
  } catch (e: any) {
    cacheError.value = e?.message ?? "Erro ao carregar cache";
  } finally {
    loadingCache.value = false;
  }
});

// ─── Helpers ──────────────────────────────────────────────────

function fmtCurrency(v: number | null) {
  if (v == null) return "—";
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2 });
}

function n(v: any): number | null {
  if (v == null) return null;
  const x = typeof v === "number" ? v : parseFloat(String(v));
  return isFinite(x) ? x : null;
}

function pontuacao(row: AcaoRow): number | null {
  const scores = row.recomendacao?.result?.scores;
  if (!scores) return null;
  const vals = (["GENERICO", "CONSERVADOR", "MODERADO", "AGRESSIVO"] as const)
    .map(p => scores[p]?.score ?? null).filter((v): v is number => v != null);
  return vals.length ? +(vals.reduce((a, b) => a + b, 0).toFixed(1)) : null;
}

// Extrai ROIC e evEbit direto do rawData do cache
function getRawIndicators(codigo: string) {
  const key = codigo.replace(/\.SA$/i, "").toUpperCase();
  const rd  = cacheMap.value[key];
  if (!rd) return { roic: null as number | null, evEbit: null as number | null };

  // ROIC: roic_sources.final está em ratio (0.12 = 12%)
  const roicRaw = n(rd?.fundamental?.rentabilidade?.roic_sources?.final);
  const roic    = roicRaw != null ? +(roicRaw * 100).toFixed(2) : null;

  // EV/EBIT: valor direto (ex: 10.5 = 10.5x)
  const evEbit  = n(rd?.fundamental?.valuation?.evEbit);

  return { roic, evEbit };
}

// Earnings Yield = 100 / EV-EBIT (%)
function earningsYield(evEbit: number | null): number | null {
  if (evEbit == null || evEbit <= 0) return null;
  return +(100 / evEbit).toFixed(2);
}

// ─── Exclusão: Financeiras e Utilities ───────────────────────
// A Fórmula Mágica pressupõe empresas operacionais.
// Bancos/seguradoras: capital é matéria-prima → ROIC/EV-EBIT sem sentido.
// Utilities (energia/água): reguladas → ROIC artificial e baixo EY estrutural.

const SETORES_EXCLUIDOS_API = new Set([
  // Financeiro
  "financial services", "finance", "financial", "banks", "banking",
  "diversified financials", "insurance", "capital markets",
  "thrifts & mortgage finance", "consumer finance",
  // Utilities
  "utilities", "electric utilities", "water utilities",
  "gas utilities", "multi-utilities", "independent power producers",
  "renewable electricity", "regulated electric",
]);

// Tickers B3 conhecidos que devem ser excluídos (fallback quando sector=null)
const TICKERS_EXCLUIDOS = new Set([
  // Bancos
  "ITUB", "BBDC", "BBAS", "SANB", "BPAC", "BRSR", "BMGB", "PINE",
  "BIDI", "BOAS", "INTER", "ABCB", "BGIP", "BSLI",
  // Seguradoras / Financeiras
  "IRBR", "BBSE", "PSSA", "SULA", "CIEL", "B3SA", "WIZS",
  // Energia elétrica
  "ELET", "CPFE", "CMIG", "EGIE", "ENGI", "TIET", "TAEE", "ENEV",
  "AURE", "CESP", "TRPL", "CPLE", "EQTL", "MEGA",
  // Saneamento / Água
  "SBSP", "SAPR", "CSMG", "AGYS", "CAML",
  // Gás
  "CGAS", "MGAS",
]);

function motivoExclusao(row: AcaoRow): string | null {
  const result = row.recomendacao?.result;
  if (!result) return null;

  const sector   = (result.meta?.sector   ?? "").toLowerCase();
  const industry = (result.meta?.industry ?? "").toLowerCase();

  // Detecção por setor da API
  for (const exc of SETORES_EXCLUIDOS_API) {
    if (sector.includes(exc) || industry.includes(exc)) {
      const isFinanceiro = exc.includes("financ") || exc.includes("bank") || exc.includes("insur") || exc.includes("capital");
      return isFinanceiro ? "Financeira" : "Utilidade Pública";
    }
  }

  // Fallback por prefixo do ticker (remove dígitos)
  const prefix = row.codigo.replace(/\.SA$/i, "").replace(/\d+$/, "").toUpperCase();
  if (TICKERS_EXCLUIDOS.has(prefix) || TICKERS_EXCLUIDOS.has(row.codigo.replace(/\.SA$/i, "").toUpperCase())) {
    // Determina categoria pelo prefixo
    const isUtility = ["ELET","CPFE","CMIG","EGIE","ENGI","TIET","TAEE","ENEV","AURE","CESP","TRPL","CPLE","EQTL","MEGA","SBSP","SAPR","CSMG","AGYS","CAML","CGAS","MGAS"].some(t => prefix.startsWith(t) || t.startsWith(prefix));
    return isUtility ? "Utilidade Pública" : "Financeira";
  }

  return null;
}

// ─── Dados enriquecidos ───────────────────────────────────────

const acoesAnalisadas = computed(() =>
  props.acoes.filter(r => r.recomendacao?.result != null)
);

const temAnalise = computed(() => acoesAnalisadas.value.length > 0);

interface StockMF {
  codigo:          string;
  produto:         string;
  precoFechamento: number | null;
  valorAtualizado: number | null;
  roic:            number | null;   // %
  evEbit:          number | null;   // x
  ey:              number | null;   // % (= 100/evEbit)
  pts:             number | null;
  decision:        string | null;
  emoji:           string | null;
  excluido:        boolean;
  motivoExclusao:  string | null;
  // ranking (preenchido depois)
  rankROIC:        number;
  rankEY:          number;
  rankCombinado:   number;
}

const acoesEnriquecidas = computed((): StockMF[] =>
  acoesAnalisadas.value.map(row => {
    const { roic, evEbit } = getRawIndicators(row.codigo);
    const ey     = earningsYield(evEbit);
    const motivo = motivoExclusao(row);
    const scoresMod = row.recomendacao?.result?.scores?.MODERADO;
    return {
      codigo:          row.codigo,
      produto:         row.produto,
      precoFechamento: row.precoFechamento,
      valorAtualizado: row.valorAtualizado ?? 0,
      roic,
      evEbit,
      ey,
      pts:            pontuacao(row),
      decision:       scoresMod?.decision ?? null,
      emoji:          scoresMod?.emoji ?? null,
      excluido:       motivo != null,
      motivoExclusao: motivo,
      rankROIC:       0,
      rankEY:         0,
      rankCombinado:  0,
    };
  })
);

// Calcula ranks apenas para ações elegíveis (não excluídas, ROIC > 0, EY > 0)
const ranked = computed((): StockMF[] => {
  const validas   = acoesEnriquecidas.value.filter(s => !s.excluido && (s.roic ?? 0) > 0 && (s.ey ?? 0) > 0);
  const invalidas = acoesEnriquecidas.value.filter(s => !s.excluido && !((s.roic ?? 0) > 0 && (s.ey ?? 0) > 0));
  const excluidas = acoesEnriquecidas.value.filter(s => s.excluido);

  // Rank ROIC: maior = rank 1
  const byROIC = [...validas].sort((a, b) => (b.roic ?? 0) - (a.roic ?? 0));
  const roicMap = new Map(byROIC.map((s, i) => [s.codigo, i + 1]));

  // Rank EY: maior = rank 1
  const byEY = [...validas].sort((a, b) => (b.ey ?? 0) - (a.ey ?? 0));
  const eyMap = new Map(byEY.map((s, i) => [s.codigo, i + 1]));

  const rankedValidas = validas
    .map(s => ({
      ...s,
      rankROIC:      roicMap.get(s.codigo) ?? 99,
      rankEY:        eyMap.get(s.codigo)   ?? 99,
      rankCombinado: (roicMap.get(s.codigo) ?? 99) + (eyMap.get(s.codigo) ?? 99),
    }))
    .sort((a, b) => a.rankCombinado - b.rankCombinado);

  // Inválidas no final
  const rankedInvalidas = invalidas.map(s => ({ ...s, rankROIC: 99, rankEY: 99, rankCombinado: 199 }));
  const rankedExcluidas = excluidas.map(s => ({ ...s, rankROIC: 99, rankEY: 99, rankCombinado: 999 }));
  return [...rankedValidas, ...rankedInvalidas, ...rankedExcluidas];
});

// Top 5 para simulação/balanceamento (apenas válidas)
const top5 = computed(() =>
  ranked.value.filter(s => s.rankCombinado < 100).slice(0, 5)
);

// ─── Gráfico Scatter (ROIC × EY) ─────────────────────────────

const scatterPoints = computed(() => {
  const validos = ranked.value.filter(s => !s.excluido && s.roic != null && s.ey != null && s.roic > 0 && s.ey > 0);
  const maxROIC = Math.max(...validos.map(x => x.roic!), 1);
  const maxEY   = Math.max(...validos.map(x => x.ey!),   1);
  return validos.map(s => ({
    ...s,
    cx: 40 + (s.roic! / maxROIC) * 220,
    cy: 200 - (s.ey!  / maxEY)   * 140,
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
  if (!val || !top5.value.length) return [];
  const ativos = top5.value.filter(r => !desativados.value.has(r.codigo));
  if (!ativos.length) return [];
  // Peso inversamente proporcional ao rank combinado (melhor rank = mais peso)
  const maxRank = Math.max(...ativos.map(r => r.rankCombinado));
  const pesos = ativos.map(r => maxRank + 1 - r.rankCombinado);
  const totalPeso = pesos.reduce((a, b) => a + b, 0);
  return ativos.map((r, i) => {
    const pesoRedist  = totalPeso > 0 ? (pesos[i] / totalPeso) * 100 : 100 / ativos.length;
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
  const total     = acoesEnriquecidas.value.length;
  const excluidas = acoesEnriquecidas.value.filter(s => s.excluido);
  const semDados  = acoesEnriquecidas.value.filter(s => !s.excluido && (s.roic == null || s.ey == null || s.roic <= 0 || s.ey <= 0)).length;

  if (excluidas.length > 0) {
    const fins = excluidas.filter(s => s.motivoExclusao === "Financeira").map(s => s.codigo).join(", ");
    const utils = excluidas.filter(s => s.motivoExclusao === "Utilidade Pública").map(s => s.codigo).join(", ");
    if (fins) list.push({ tipo: "info", msg: `Financeiras excluídas: ${fins}. Greenblatt exclui bancos e seguradoras pois o capital é matéria-prima, tornando ROIC e EV/EBIT sem sentido comparativo.` });
    if (utils) list.push({ tipo: "info", msg: `Utilities excluídas: ${utils}. Empresas reguladas (energia/água/gás) têm ROIC artificialmente limitado por regulação, distorcendo o ranking.` });
  }

  if (semDados > 0) {
    list.push({ tipo: "info", msg: `${semDados}/${total - excluidas.length} ativos elegíveis sem dados suficientes (ROIC ou EY nulo/negativo). Execute "Analisar Todos" e verifique o cache.` });
  }

  // Top 3 picks com contexto
  for (const r of ranked.value.filter(s => s.rankCombinado < 100).slice(0, 3)) {
    list.push({ tipo: "ok", msg: `${r.codigo} — Rank #${r.rankCombinado} combinado (ROIC #${r.rankROIC} · EY #${r.rankEY}). ROIC ${r.roic?.toFixed(1)}% + Earnings Yield ${r.ey?.toFixed(1)}% → alto retorno sobre capital com valuation atrativo.` });
  }

  // ROIC muito baixo nos top5 por pontuação normal
  for (const r of acoesEnriquecidas.value.filter(s => s.roic != null && s.roic < 5 && s.roic > 0)) {
    list.push({ tipo: "warn", msg: `${r.codigo} tem ROIC de ${r.roic?.toFixed(1)}% — abaixo de 5%. A Fórmula Mágica exige retorno sobre capital alto como proxy de vantagem competitiva.` });
  }

  // EY muito baixo (caro em relação ao EBIT)
  for (const r of acoesEnriquecidas.value.filter(s => s.ey != null && s.ey < 3 && s.ey > 0)) {
    list.push({ tipo: "warn", msg: `${r.codigo} tem Earnings Yield de ${r.ey?.toFixed(1)}% (EV/EBIT ${r.evEbit?.toFixed(1)}x) — valuation elevado. Greenblatt prefere EY acima de 10%.` });
  }

  // EV/EBIT muito alto
  for (const r of acoesEnriquecidas.value.filter(s => s.evEbit != null && s.evEbit > 30)) {
    list.push({ tipo: "warn", msg: `${r.codigo} tem EV/EBIT de ${r.evEbit?.toFixed(1)}x — muito caro pelo EBIT. Isso penaliza fortemente o Earnings Yield na Fórmula Mágica.` });
  }

  if (list.length === 0) {
    list.push({ tipo: "info", msg: "Execute 'Analisar Todos' na aba Ações para gerar o ranking." });
  }

  return list;
});

// ─── Tabs ─────────────────────────────────────────────────────
const activeTab = ref<"ranking" | "composicao" | "simulacao" | "insights">("ranking");
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
                ✨ Fórmula Mágica
                <span class="text-sm font-normal text-gray-400">— Greenblatt (ROIC + Earnings Yield)</span>
              </h2>
              <p class="text-xs text-gray-400 mt-0.5">
                Qualidade × Preço · Ranqueamento duplo para superar o mercado no longo prazo
                <span v-if="loadingCache" class="ml-2 text-amber-400">⏳ carregando cache...</span>
                <span v-else-if="cacheError" class="ml-2 text-red-400">⚠️ {{ cacheError }}</span>
                <span v-else class="ml-2 font-semibold text-green-500">
                  {{ ranked.filter(s => s.rankCombinado < 100).length }} rankiados
                  <span class="text-gray-400 font-normal">·</span>
                  <span class="text-red-400 font-normal">
                    {{ acoesEnriquecidas.filter(s => s.excluido).length }} excluídos (financeiras/utilities)
                  </span>
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
            <p class="text-sm mt-1">A Fórmula Mágica usa ROIC e EV/EBIT do cache de cada ativo.</p>
          </div>

          <div v-else class="p-5 space-y-5">

            <!-- ── Tabs ───────────────────────────────────── -->
            <div class="flex gap-1 bg-gray-100 dark:bg-gray-800 rounded-xl p-1">
              <button v-for="tab in [
                { key: 'ranking',    label: '🏆 Ranqueamento' },
                { key: 'composicao', label: '📊 Composição'   },
                { key: 'simulacao',  label: '💰 Simulação'     },
                { key: 'insights',   label: '💡 Insights'      },
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
                 TAB: RANQUEAMENTO
            ═══════════════════════════════════════════════════ -->
            <div v-if="activeTab === 'ranking'" class="space-y-3">

              <!-- Explicação compacta -->
              <div class="p-3 bg-indigo-50 dark:bg-indigo-950/30 rounded-xl text-xs text-indigo-700 dark:text-indigo-300 space-y-1">
                <p class="font-semibold">Como funciona a Fórmula Mágica?</p>
                <p>Cada ativo recebe dois ranks (1 = melhor): <b>ROIC</b> (qualidade — retorno sobre capital investido) e <b>Earnings Yield</b> (valor — EBIT/EV). O rank combinado é a soma dos dois. Menor soma = melhor pick.</p>
              </div>

              <!-- Loading/erro do cache -->
              <div v-if="loadingCache" class="text-center py-8 text-gray-400">
                <span class="animate-spin inline-block mr-2">⏳</span> Buscando dados do cache...
              </div>

              <!-- Tabela de ranking -->
              <div v-else class="overflow-x-auto">
                <table class="w-full text-sm">
                  <thead>
                    <tr class="text-left text-xs text-gray-400 border-b border-gray-200 dark:border-gray-700">
                      <th class="py-2 pr-2 w-8">#</th>
                      <th class="py-2 pr-3">Ativo</th>
                      <th class="py-2 pr-3 text-right">ROIC</th>
                      <th class="py-2 pr-3 text-right">EV/EBIT</th>
                      <th class="py-2 pr-3 text-right">Earn. Yield</th>
                      <th class="py-2 pr-3 text-center">Rank ROIC</th>
                      <th class="py-2 pr-3 text-center">Rank EY</th>
                      <th class="py-2 text-center font-bold">Rank Final</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="(r, i) in ranked" :key="r.codigo"
                      :class="[
                        'border-b border-gray-100 dark:border-gray-800',
                        r.excluido
                          ? 'opacity-40 bg-red-50/30 dark:bg-red-950/10'
                          : r.rankCombinado < 100 && i < 3
                            ? 'bg-green-50/60 dark:bg-green-950/20'
                            : r.rankCombinado < 100
                              ? 'hover:bg-gray-50 dark:hover:bg-gray-800/50'
                              : 'opacity-50 hover:opacity-70',
                      ]">
                      <!-- Posição -->
                      <td class="py-2 pr-2 font-bold text-xs tabular-nums"
                        :class="!r.excluido && i === 0 ? 'text-yellow-500' : !r.excluido && i === 1 ? 'text-gray-400' : !r.excluido && i === 2 ? 'text-orange-400' : 'text-gray-400'">
                        {{ !r.excluido && r.rankCombinado < 100 ? `#${ranked.filter(x => !x.excluido && x.rankCombinado < 100).indexOf(r) + 1}` : "—" }}
                      </td>
                      <!-- Ticker -->
                      <td class="py-2 pr-3">
                        <span class="font-mono font-bold"
                          :class="r.excluido ? 'text-gray-400' : 'text-indigo-600 dark:text-indigo-400'">
                          {{ r.codigo }}
                        </span>
                        <p v-if="r.excluido" class="text-xs text-red-400">
                          ⛔ {{ r.motivoExclusao }}
                        </p>
                        <p v-else class="text-xs text-gray-400 truncate max-w-[120px]">{{ r.produto }}</p>
                      </td>
                      <!-- ROIC -->
                      <td class="py-2 pr-3 text-right tabular-nums">
                        <span v-if="!r.excluido && r.roic != null && r.roic > 0"
                          :class="r.roic >= 15 ? 'text-green-600 dark:text-green-400 font-bold' : r.roic >= 10 ? 'text-yellow-600' : 'text-red-400'">
                          {{ r.roic.toFixed(1) }}%
                        </span>
                        <span v-else class="text-gray-300 dark:text-gray-600 text-xs">—</span>
                      </td>
                      <!-- EV/EBIT -->
                      <td class="py-2 pr-3 text-right tabular-nums text-gray-500">
                        <span v-if="!r.excluido && r.evEbit != null && r.evEbit > 0">{{ r.evEbit.toFixed(1) }}x</span>
                        <span v-else class="text-gray-300 dark:text-gray-600 text-xs">—</span>
                      </td>
                      <!-- Earnings Yield -->
                      <td class="py-2 pr-3 text-right tabular-nums">
                        <span v-if="!r.excluido && r.ey != null && r.ey > 0"
                          :class="r.ey >= 10 ? 'text-green-600 dark:text-green-400 font-bold' : r.ey >= 6 ? 'text-yellow-600' : 'text-red-400'">
                          {{ r.ey.toFixed(1) }}%
                        </span>
                        <span v-else class="text-gray-300 dark:text-gray-600 text-xs">—</span>
                      </td>
                      <!-- Rank ROIC -->
                      <td class="py-2 pr-3 text-center">
                        <span v-if="!r.excluido && r.rankROIC < 99"
                          class="inline-block w-7 h-7 rounded-full text-xs font-bold leading-7
                                 bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300">
                          {{ r.rankROIC }}
                        </span>
                        <span v-else class="text-gray-300 text-xs">—</span>
                      </td>
                      <!-- Rank EY -->
                      <td class="py-2 pr-3 text-center">
                        <span v-if="!r.excluido && r.rankEY < 99"
                          class="inline-block w-7 h-7 rounded-full text-xs font-bold leading-7
                                 bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300">
                          {{ r.rankEY }}
                        </span>
                        <span v-else class="text-gray-300 text-xs">—</span>
                      </td>
                      <!-- Rank Final -->
                      <td class="py-2 text-center">
                        <span v-if="!r.excluido && r.rankCombinado < 100"
                          :class="[
                            'inline-block px-2 py-0.5 rounded-full text-xs font-black',
                            ranked.filter(x => !x.excluido && x.rankCombinado < 100).indexOf(r) === 0
                              ? 'bg-yellow-100 dark:bg-yellow-900/40 text-yellow-700 dark:text-yellow-300'
                              : ranked.filter(x => !x.excluido && x.rankCombinado < 100).indexOf(r) < 3
                                ? 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300'
                                : 'bg-gray-100 dark:bg-gray-800 text-gray-600',
                          ]">
                          {{ r.rankCombinado }}
                        </span>
                        <span v-else-if="r.excluido"
                          class="text-xs text-red-300 italic">excluído</span>
                        <span v-else class="text-gray-300 text-xs">—</span>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            <!-- ════════════════════════════════════════════════
                 TAB: COMPOSIÇÃO (scatter ROIC × EY)
            ═══════════════════════════════════════════════════ -->
            <div v-if="activeTab === 'composicao'" class="space-y-4">

              <p class="text-xs text-gray-400">
                Quadrante ideal: alto ROIC (eixo X) + alto Earnings Yield (eixo Y) → canto superior direito.
              </p>

              <!-- Scatter SVG -->
              <div class="flex justify-center">
                <svg viewBox="0 0 300 250" class="w-full max-w-lg border border-gray-200 dark:border-gray-700 rounded-xl bg-gray-50 dark:bg-gray-800/40">

                  <!-- Quadrantes de fundo -->
                  <!-- Ideal: sup-dir (verde claro) -->
                  <rect x="160" y="30" width="120" height="100" fill="#16a34a" fill-opacity="0.07" />
                  <!-- Outros quadrantes neutros -->
                  <rect x="40"  y="30" width="120" height="100" fill="#6b7280" fill-opacity="0.04" />
                  <rect x="40"  y="130" width="120" height="100" fill="#6b7280" fill-opacity="0.04" />
                  <rect x="160" y="130" width="120" height="100" fill="#eab308" fill-opacity="0.06" />

                  <!-- Eixos -->
                  <line x1="40" y1="230" x2="280" y2="230" stroke="#9ca3af" stroke-width="1"/>
                  <line x1="40" y1="30"  x2="40"  y2="230" stroke="#9ca3af" stroke-width="1"/>

                  <!-- Label eixos -->
                  <text x="160" y="248" text-anchor="middle" font-size="8" fill="#9ca3af">ROIC (qualidade →)</text>
                  <text x="12" y="130" text-anchor="middle" font-size="8" fill="#9ca3af"
                    transform="rotate(-90 12 130)">Earnings Yield (valor →)</text>

                  <!-- Linha de divisão dos quadrantes -->
                  <line x1="160" y1="30" x2="160" y2="230" stroke="#9ca3af" stroke-width="0.5" stroke-dasharray="3,3"/>
                  <line x1="40" y1="130" x2="280" y2="130" stroke="#9ca3af" stroke-width="0.5" stroke-dasharray="3,3"/>

                  <!-- Label quadrantes -->
                  <text x="220" y="46" text-anchor="middle" font-size="7" fill="#16a34a" font-weight="bold">IDEAL</text>
                  <text x="100" y="46" text-anchor="middle" font-size="7" fill="#9ca3af">Caro mas Qualidade</text>
                  <text x="100" y="224" text-anchor="middle" font-size="7" fill="#9ca3af">Barato mas Fraco</text>
                  <text x="220" y="224" text-anchor="middle" font-size="7" fill="#eab308">Bom Preço, Fraco</text>

                  <!-- Pontos -->
                  <g v-for="(p, i) in scatterPoints" :key="p.codigo">
                    <circle
                      :cx="p.cx" :cy="p.cy" :r="i < 3 ? 7 : 5"
                      :fill="i === 0 ? '#fbbf24' : i < 3 ? '#22c55e' : '#6366f1'"
                      fill-opacity="0.8"
                      class="transition-all hover:opacity-100" />
                    <text :x="p.cx + 8" :y="p.cy + 4" font-size="7"
                      :fill="i === 0 ? '#d97706' : '#6366f1'" font-weight="bold">
                      {{ p.codigo.replace(/\d+/, "") }}{{ p.codigo.replace(/\D+/, "") }}
                    </text>
                  </g>
                </svg>
              </div>

              <!-- Legenda de cores -->
              <div class="flex gap-4 justify-center text-xs text-gray-500">
                <div class="flex items-center gap-1.5">
                  <div class="w-3 h-3 rounded-full bg-yellow-400"></div><span>#1 Fórmula Mágica</span>
                </div>
                <div class="flex items-center gap-1.5">
                  <div class="w-3 h-3 rounded-full bg-green-500"></div><span>Top 3</span>
                </div>
                <div class="flex items-center gap-1.5">
                  <div class="w-3 h-3 rounded-full bg-indigo-500"></div><span>Demais</span>
                </div>
              </div>

              <!-- Tabela compacta ROIC e EY -->
              <div class="space-y-1">
                <p class="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
                  ROIC por Ativo
                </p>
                <div v-for="r in [...acoesEnriquecidas].filter(s => !s.excluido && s.roic != null && s.roic > 0).sort((a,b) => (b.roic??0)-(a.roic??0))"
                  :key="r.codigo"
                  class="flex items-center gap-2 text-sm">
                  <span class="font-mono font-bold text-indigo-600 dark:text-indigo-400 w-16 flex-shrink-0">{{ r.codigo }}</span>
                  <div class="flex-1 bg-gray-100 dark:bg-gray-800 rounded-full h-2">
                    <div class="h-2 rounded-full transition-all"
                      :style="{
                        width: Math.min(r.roic! / 0.5, 100) + '%',
                        backgroundColor: r.roic! >= 15 ? '#22c55e' : r.roic! >= 10 ? '#eab308' : '#ef4444',
                      }" />
                  </div>
                  <span class="tabular-nums text-xs w-14 text-right font-bold"
                    :class="r.roic! >= 15 ? 'text-green-600 dark:text-green-400' : r.roic! >= 10 ? 'text-yellow-600' : 'text-red-400'">
                    {{ r.roic!.toFixed(1) }}%
                  </span>
                </div>
              </div>
            </div>

            <!-- ════════════════════════════════════════════════
                 TAB: SIMULAÇÃO
            ═══════════════════════════════════════════════════ -->
            <div v-if="activeTab === 'simulacao'" class="space-y-4">

              <div v-if="!top5.length" class="text-center py-8 text-gray-400">
                <p>Nenhum ativo válido para simulação.</p>
                <p class="text-xs mt-1">Os ativos precisam ter ROIC e Earnings Yield positivos no cache.</p>
              </div>

              <template v-else>
                <p class="text-xs text-gray-400">
                  Alocação ponderada pelo rank combinado (melhor rank = maior peso). Top {{ top5.length }} ativos da Fórmula Mágica.
                </p>

                <!-- Input aporte -->
                <div class="flex items-center gap-3">
                  <label class="text-sm font-semibold text-gray-600 dark:text-gray-300 flex-shrink-0">
                    Valor a investir (R$)
                  </label>
                  <input v-model="aporteInput" type="text" placeholder="Ex: 10.000,00"
                    class="input text-sm py-1.5 w-44 tabular-nums" />
                </div>

                <!-- Checkboxes de ativos -->
                <div class="space-y-2">
                  <div v-for="r in top5" :key="r.codigo"
                    class="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer"
                    @click="toggleAtivo(r.codigo)">
                    <input type="checkbox" :checked="!desativados.has(r.codigo)"
                      @click.stop="toggleAtivo(r.codigo)"
                      class="rounded text-indigo-600" />
                    <span class="font-mono font-bold text-indigo-600 dark:text-indigo-400 w-16">{{ r.codigo }}</span>
                    <span class="text-xs text-gray-400">
                      Rank #{{ r.rankCombinado }} · ROIC {{ r.roic?.toFixed(1) }}% · EY {{ r.ey?.toFixed(1) }}%
                    </span>
                  </div>
                </div>

                <!-- Resultado -->
                <div v-if="aporte && simulacao.length" class="space-y-2 mt-2">
                  <div v-for="r in simulacao" :key="r.codigo"
                    class="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-800 rounded-xl text-sm">
                    <span class="font-mono font-bold text-indigo-600 dark:text-indigo-400 w-16 flex-shrink-0">
                      {{ r.codigo }}
                    </span>
                    <div class="flex-1">
                      <div class="flex items-center justify-between mb-1">
                        <span class="text-xs text-gray-400">Peso {{ r.pesoRedist.toFixed(1) }}%</span>
                        <span class="font-bold tabular-nums">{{ fmtCurrency(r.realAlocado) }}</span>
                      </div>
                      <div class="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-1.5">
                        <div class="h-1.5 rounded-full bg-indigo-500 transition-all"
                          :style="{ width: r.pesoRedist + '%' }" />
                      </div>
                      <p class="text-xs text-gray-400 mt-1">
                        {{ r.qtd }} {{ r.qtd === 1 ? "ação" : "ações" }} ×
                        {{ fmtCurrency(r.precoFechamento) }} = {{ fmtCurrency(r.realAlocado) }}
                        <span v-if="r.valorAlocar - r.realAlocado > 0" class="text-amber-500 ml-1">
                          (sobra {{ fmtCurrency(r.valorAlocar - r.realAlocado) }})
                        </span>
                      </p>
                    </div>
                  </div>
                  <div class="flex items-center justify-between p-3 bg-indigo-50 dark:bg-indigo-950/30 rounded-xl text-sm font-bold">
                    <span class="text-indigo-700 dark:text-indigo-300">Total alocado</span>
                    <span class="tabular-nums text-indigo-600 dark:text-indigo-400">{{ fmtCurrency(totalSimulado) }}</span>
                  </div>
                  <p v-if="aporte - totalSimulado > 0.01" class="text-xs text-amber-500 text-right">
                    Não alocado (lotes inteiros): {{ fmtCurrency(aporte - totalSimulado) }}
                  </p>
                </div>
              </template>
            </div>

            <!-- ════════════════════════════════════════════════
                 TAB: INSIGHTS
            ═══════════════════════════════════════════════════ -->
            <div v-if="activeTab === 'insights'" class="space-y-3">

              <!-- Resumo dos dois melhores -->
              <div v-if="ranked.filter(s => s.rankCombinado < 100).length >= 2"
                class="grid grid-cols-2 gap-3">
                <div v-for="r in ranked.filter(s => s.rankCombinado < 100).slice(0, 2)" :key="r.codigo"
                  class="p-4 bg-indigo-50 dark:bg-indigo-950/30 rounded-xl border border-indigo-200 dark:border-indigo-800">
                  <p class="text-xs text-indigo-500 mb-1">Rank #{{ r.rankCombinado }}</p>
                  <p class="font-black text-lg text-indigo-700 dark:text-indigo-300">{{ r.codigo }}</p>
                  <div class="mt-2 space-y-1 text-xs">
                    <div class="flex justify-between">
                      <span class="text-gray-500">ROIC</span>
                      <span class="font-bold"
                        :class="(r.roic??0) >= 15 ? 'text-green-600' : 'text-yellow-600'">
                        {{ r.roic?.toFixed(1) }}% (rank #{{ r.rankROIC }})
                      </span>
                    </div>
                    <div class="flex justify-between">
                      <span class="text-gray-500">Earnings Yield</span>
                      <span class="font-bold"
                        :class="(r.ey??0) >= 10 ? 'text-green-600' : 'text-yellow-600'">
                        {{ r.ey?.toFixed(1) }}% (rank #{{ r.rankEY }})
                      </span>
                    </div>
                    <div class="flex justify-between">
                      <span class="text-gray-500">EV/EBIT</span>
                      <span class="font-bold text-gray-600 dark:text-gray-300">{{ r.evEbit?.toFixed(1) }}x</span>
                    </div>
                  </div>
                </div>
              </div>

              <!-- Lista de insights -->
              <div class="space-y-2">
                <div v-for="(ins, i) in insights" :key="i"
                  :class="[
                    'flex items-start gap-3 p-3 rounded-xl text-sm',
                    ins.tipo === 'ok'   ? 'bg-green-50  dark:bg-green-950/20  text-green-700  dark:text-green-300'  :
                    ins.tipo === 'warn' ? 'bg-amber-50  dark:bg-amber-950/20  text-amber-700  dark:text-amber-300'  :
                                         'bg-gray-50   dark:bg-gray-800       text-gray-600   dark:text-gray-300',
                  ]">
                  <span class="flex-shrink-0 mt-0.5">
                    {{ ins.tipo === 'ok' ? '✅' : ins.tipo === 'warn' ? '⚠️' : 'ℹ️' }}
                  </span>
                  <p>{{ ins.msg }}</p>
                </div>
              </div>

              <!-- Tabela: ROIC + EY + Rank Final por ativo -->
              <div class="mt-2">
                <p class="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
                  Resumo por Ativo
                </p>
                <div class="overflow-x-auto">
                  <table class="w-full text-sm">
                    <thead>
                      <tr class="text-left text-xs text-gray-400 border-b border-gray-200 dark:border-gray-700">
                        <th class="py-1 pr-3">Ativo</th>
                        <th class="py-1 pr-3 text-right">ROIC</th>
                        <th class="py-1 pr-3 text-right">Earnings Yield</th>
                        <th class="py-1 pr-3 text-right">EV/EBIT</th>
                        <th class="py-1 text-center">Rank Final</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr v-for="r in ranked" :key="r.codigo"
                        class="border-b border-gray-100 dark:border-gray-800">
                        <td class="py-1.5 pr-3 font-mono font-bold text-indigo-600 dark:text-indigo-400">{{ r.codigo }}</td>
                        <td class="py-1.5 pr-3 text-right tabular-nums"
                          :class="(r.roic??0) >= 15 ? 'text-green-600 dark:text-green-400' : (r.roic??0) >= 5 ? 'text-yellow-600' : 'text-red-400'">
                          {{ r.roic != null && r.roic > 0 ? r.roic.toFixed(1) + "%" : "—" }}
                        </td>
                        <td class="py-1.5 pr-3 text-right tabular-nums"
                          :class="(r.ey??0) >= 10 ? 'text-green-600 dark:text-green-400' : (r.ey??0) >= 5 ? 'text-yellow-600' : 'text-red-400'">
                          {{ r.ey != null && r.ey > 0 ? r.ey.toFixed(1) + "%" : "—" }}
                        </td>
                        <td class="py-1.5 pr-3 text-right tabular-nums text-gray-500">
                          {{ r.evEbit != null && r.evEbit > 0 ? r.evEbit.toFixed(1) + "x" : "—" }}
                        </td>
                        <td class="py-1.5 text-center">
                          <span v-if="r.rankCombinado < 100" class="font-bold text-indigo-600 dark:text-indigo-400">
                            {{ r.rankCombinado }}
                          </span>
                          <span v-else class="text-gray-300 text-xs">—</span>
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
