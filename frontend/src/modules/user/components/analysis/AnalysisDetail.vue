<script setup lang="ts">
import { ref, computed, getCurrentInstance } from "vue";
import type { AnalysisResult, ProfileName } from "@/types";
import { ALL_PROFILES, PROFILE_LABELS, PROFILE_ICONS, PROFILE_DESCS, INDICATOR_LABELS } from "@/types";
import ScoreGauge          from "@/modules/user/components/analysis/ScoreGauge.vue";
import RecommendationChart from "@/modules/user/components/charts/RecommendationChart.vue";
import TrendChart          from "@/modules/user/components/charts/TrendChart.vue";
import ScoreRadarChart     from "@/modules/user/components/charts/ScoreRadarChart.vue";
import { formatPercent, formatNumber, formatDate, decisionColor, decisionBadgeClass } from "@/shared/utils/formatters";

const props = defineProps<{
  result:      AnalysisResult;
  fromCache?:  boolean;
  refreshing?: boolean;
}>();

const emit  = defineEmits<{ (e: "refresh"): void }>();
// Mostra o botão de refresh apenas quando o pai escuta o evento @refresh
const onRefresh = computed(() => !!getCurrentInstance()?.vnode.props?.onRefresh);

const activeProfile = ref<ProfileName>("MODERADO");

const activeScore = computed(() => props.result.scores?.[activeProfile.value] ?? null);
const activeColor = computed(() => activeScore.value ? decisionColor(activeScore.value.decision) : "#6b7280");
const currSymbol  = computed(() => props.result.meta?.currency === "USD" ? "US$" : "R$");

function indicatorRawValue(id: string): string {
  const tech = props.result.technical;
  const fund = props.result.fundamental;
  const f2   = (v: number | null | undefined, dec = 2) => v != null ? v.toFixed(dec) : "—";
  switch (id) {
    case "pl":            return fund?.pl?.value            != null ? `${f2(fund.pl.value)}x`             : "—";
    case "pvp":           return fund?.pvp?.value           != null ? `${f2(fund.pvp.value)}x`            : "—";
    case "roe":           return fund?.roe?.value           != null ? `${f2(fund.roe.value)}%`            : "—";
    case "margemLiquida": return fund?.margemLiquida?.value != null ? `${f2(fund.margemLiquida.value)}%`  : "—";
    case "dividaEbitda":  return fund?.dividaEbitda?.value  != null ? `${f2(fund.dividaEbitda.value)}x`   : "—";
    case "earningsGrowth":return fund?.earningsGrowth?.value!= null ? `${f2(fund.earningsGrowth.value)}%` : "—";
    case "dividendYield": return fund?.dividendYield?.value != null ? `${f2(fund.dividendYield.value)}%`  : "—";
    case "beta":          return fund?.beta?.value          != null ? `β ${f2(fund.beta.value)}`          : "—";
    case "rsi":           return tech?.rsi?.value != null ? f2(tech.rsi.value, 1) : "—";
    case "precoVsMMs": {
      const ma = tech?.movingAverages;
      if (!ma) return "—";
      const parts: string[] = [];
      if (ma.pctVsMM20  != null) parts.push(`MM20 ${ma.pctVsMM20  >= 0 ? "+" : ""}${ma.pctVsMM20.toFixed(1)}%`);
      if (ma.pctVsMM50  != null) parts.push(`MM50 ${ma.pctVsMM50  >= 0 ? "+" : ""}${ma.pctVsMM50.toFixed(1)}%`);
      if (ma.pctVsMM200 != null) parts.push(`MM200 ${ma.pctVsMM200 >= 0 ? "+" : ""}${ma.pctVsMM200.toFixed(1)}%`);
      return parts.length ? parts.join(" · ") : "—";
    }
    case "macd":
      return tech?.macd?.histogram != null
        ? `hist ${tech.macd.histogram >= 0 ? "+" : ""}${tech.macd.histogram.toFixed(4)}` : "—";
    case "tendencia":    return tech?.trend?.label ?? "—";
    case "breakout":
      return tech?.breakout52w?.positionInRangePct != null
        ? `${tech.breakout52w.positionInRangePct}% faixa` : "—";
    case "volatilidade":
      return tech?.volatility?.annualizedPct != null
        ? `${f2(tech.volatility.annualizedPct)}% a.a.` : "—";
    case "drawdown":
      return tech?.maxDrawdown?.maxDrawdownPct != null
        ? `${f2(tech.maxDrawdown.maxDrawdownPct)}%` : "—";
    default: return "—";
  }
}
</script>

<template>
  <div class="space-y-6">

    <!-- ── Header do ativo ───────────────────────────────────── -->
    <div class="card">
      <div class="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div class="flex items-center gap-3 flex-wrap">
            <h1 class="text-3xl font-black tracking-tight">{{ result.meta.ticker }}</h1>
            <span v-if="result.meta.shortName" class="text-gray-500 text-lg">{{ result.meta.shortName }}</span>
            <span v-if="fromCache"
              class="text-xs bg-amber-100 dark:bg-amber-900 text-amber-700 dark:text-amber-300 px-2 py-0.5 rounded-full">
              📦 cache
            </span>
          </div>
          <div class="flex gap-3 mt-1 text-sm text-gray-500 flex-wrap">
            <span v-if="result.meta.sector">{{ result.meta.sector }}</span>
            <span v-if="result.meta.industry" class="text-gray-400">· {{ result.meta.industry }}</span>
            <span class="font-mono text-gray-400">{{ result.meta.currency }}</span>
          </div>
          <p v-if="result.technical?.dataRange" class="text-xs text-gray-400 mt-1">
            Período: {{ formatDate(result.technical.dataRange.from) }} → {{ formatDate(result.technical.dataRange.to) }}
          </p>
        </div>
        <div class="text-right">
          <p class="text-4xl font-black tabular-nums">
            {{ currSymbol }} {{ formatNumber(result.technical?.price ?? null) }}
          </p>
          <button v-if="onRefresh" @click="emit('refresh')" :disabled="refreshing"
            class="btn-secondary text-xs mt-2">
            {{ refreshing ? "Atualizando..." : "🔄 Forçar atualização" }}
          </button>
        </div>
      </div>
    </div>

    <!-- ── Score destaque do perfil ativo ────────────────────── -->
    <div v-if="activeScore"
      class="card border-2 border-indigo-200 dark:border-indigo-800 bg-indigo-50/40 dark:bg-indigo-950/30">
      <div class="flex items-center gap-2 mb-4">
        <span class="text-lg">{{ PROFILE_ICONS[activeProfile] }}</span>
        <h2 class="font-bold text-indigo-700 dark:text-indigo-300">
          Análise — Perfil {{ PROFILE_LABELS[activeProfile] }}
        </h2>
        <span class="ml-auto text-xs text-gray-400">{{ PROFILE_DESCS[activeProfile] }}</span>
      </div>
      <div class="flex flex-wrap gap-6 items-center">
        <div class="flex flex-col items-center min-w-[120px]">
          <div class="relative w-28 h-28">
            <svg viewBox="0 0 100 100" class="w-full h-full -rotate-90">
              <circle cx="50" cy="50" r="40" fill="none"
                class="text-gray-200 dark:text-gray-700" stroke="currentColor" stroke-width="12"/>
              <circle cx="50" cy="50" r="40" fill="none"
                :stroke="activeColor" stroke-width="12" stroke-linecap="round"
                :stroke-dasharray="`${(activeScore.score / 100) * 251.3} 251.3`"/>
            </svg>
            <div class="absolute inset-0 flex flex-col items-center justify-center">
              <span class="text-2xl font-black tabular-nums">{{ activeScore.score.toFixed(0) }}</span>
              <span class="text-xs text-gray-400">/ 100</span>
            </div>
          </div>
          <span :class="['text-sm font-bold mt-1', decisionBadgeClass(activeScore.decision)]">
            {{ activeScore.emoji }} {{ activeScore.decision.replace(/_/g, " ") }}
          </span>
        </div>
        <div class="flex-1 min-w-[200px]">
          <p class="text-sm text-gray-700 dark:text-gray-300 mb-2">{{ activeScore.desc }}</p>
          <p v-if="activeScore.indicadoresAusentes.length" class="text-xs text-amber-600 dark:text-amber-400">
            ⚠️ Sem dados: {{ activeScore.indicadoresAusentes.join(", ") }}
          </p>
        </div>
      </div>
    </div>

    <!-- ── Grid de perfis clicáveis ──────────────────────────── -->
    <div>
      <p class="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Score por Perfil</p>
      <div class="grid grid-cols-2 xl:grid-cols-4 gap-3">
        <div v-for="p in ALL_PROFILES" :key="p"
          @click="activeProfile = p"
          :class="[
            'cursor-pointer transition-all',
            activeProfile === p ? 'ring-2 ring-indigo-500 rounded-xl' : 'hover:ring-1 hover:ring-indigo-300 rounded-xl',
          ]">
          <ScoreGauge v-if="result.scores?.[p]"
            :score="result.scores[p]"
            :profile-label="PROFILE_ICONS[p] + ' ' + PROFILE_LABELS[p]" />
          <div v-else class="card text-center text-gray-400 text-sm py-6">
            {{ PROFILE_ICONS[p] }} {{ PROFILE_LABELS[p] }}<br/>
            <span class="text-xs">Sem dados</span>
          </div>
        </div>
      </div>
      <p class="text-xs text-gray-400 mt-2">Clique em um perfil para ver o detalhe.</p>
    </div>

    <!-- ── Tabela de indicadores ──────────────────────────────── -->
    <div v-if="activeScore?.detalhes?.length" class="card">
      <h2 class="font-semibold mb-4">
        🎯 Indicadores — {{ PROFILE_ICONS[activeProfile] }} {{ PROFILE_LABELS[activeProfile] }}
      </h2>
      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead>
            <tr class="text-left text-xs text-gray-400 border-b border-gray-200 dark:border-gray-700">
              <th class="py-2 pr-4">Indicador</th>
              <th class="py-2 pr-4 text-right">Pts</th>
              <th class="py-2 pr-4 text-right">Peso</th>
              <th class="py-2 pr-4 text-right">Contribuição</th>
              <th class="py-2 pr-4">Faixa ideal</th>
              <th class="py-2 text-right">Valor real</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="d in activeScore.detalhes" :key="d.id"
              :class="['border-b border-gray-100 dark:border-gray-800', d.disponivel ? '' : 'opacity-40']">
              <td class="py-2 pr-4 font-medium">{{ INDICATOR_LABELS[d.id] ?? d.id }}</td>
              <td class="py-2 pr-4 text-right tabular-nums">
                {{ d.disponivel ? (d.rawPts?.toFixed(1) ?? "—") : "—" }}
              </td>
              <td class="py-2 pr-4 text-right tabular-nums text-gray-500">{{ d.peso.toFixed(1) }}%</td>
              <td class="py-2 pr-4 text-right tabular-nums font-semibold"
                :class="d.disponivel ? (d.contribuicao >= 0 ? 'text-green-600' : 'text-red-500') : 'text-gray-400'">
                {{ d.disponivel ? d.contribuicao.toFixed(1) : "—" }}
              </td>
              <td class="py-2 pr-4 text-xs text-gray-400">{{ d.idealRange ?? "—" }}</td>
              <td class="py-2 text-right text-xs font-mono"
                :class="d.disponivel ? 'text-indigo-400 dark:text-indigo-300' : 'text-gray-400'">
                {{ indicatorRawValue(d.id) }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- ── Técnica + Fundamentalista ─────────────────────────── -->
    <div class="grid grid-cols-1 xl:grid-cols-2 gap-6">

      <!-- Técnica -->
      <div v-if="result.technical" class="card space-y-3">
        <h2 class="font-semibold text-lg">📈 Análise Técnica</h2>
        <div class="grid grid-cols-2 gap-3 text-sm">
          <div class="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
            <p class="text-xs text-gray-400">RSI (14)</p>
            <p class="font-bold text-lg tabular-nums">{{ result.technical.rsi?.value ?? "N/A" }}</p>
            <p class="text-xs text-gray-500">{{ result.technical.rsi?.interpretation }}</p>
          </div>
          <div class="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
            <p class="text-xs text-gray-400">Tendência</p>
            <p class="font-bold">{{ result.technical.trend?.label }}</p>
            <p class="text-xs text-gray-500">Vol: {{ result.technical.trend?.vol20Pct }}%</p>
          </div>
          <div class="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
            <p class="text-xs text-gray-400">MACD</p>
            <p class="text-xs leading-relaxed">{{ result.technical.macd?.interpretation }}</p>
          </div>
          <div class="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
            <p class="text-xs text-gray-400">Volatilidade 12m</p>
            <p class="font-bold tabular-nums">{{ result.technical.volatility?.annualizedPct ?? "N/A" }}%</p>
            <p class="text-xs text-gray-500">{{ result.technical.volatility?.label }}</p>
          </div>
        </div>

        <div>
          <p class="text-xs text-gray-400 mb-2">Médias Móveis</p>
          <div class="grid grid-cols-3 gap-2 text-sm text-center">
            <div v-for="(val, label) in { MM20: result.technical.movingAverages?.mm20, MM50: result.technical.movingAverages?.mm50, MM200: result.technical.movingAverages?.mm200 }"
              :key="label" class="p-2 bg-gray-50 dark:bg-gray-800 rounded-lg">
              <p class="text-xs text-gray-400">{{ label }}</p>
              <p class="font-mono font-bold text-sm tabular-nums">{{ val != null ? formatNumber(val) : "N/A" }}</p>
            </div>
          </div>
          <p v-if="result.technical.movingAverages?.crossAlert" class="text-xs mt-2 text-amber-600 dark:text-amber-400">
            ⚡ {{ result.technical.movingAverages.crossAlert }}
          </p>
        </div>

        <div class="grid grid-cols-2 gap-3 text-sm">
          <div class="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
            <p class="text-xs text-gray-400">Breakout 52s</p>
            <p class="font-bold">{{ result.technical.breakout52w?.label }}</p>
            <p class="text-xs text-gray-500">{{ result.technical.breakout52w?.positionInRangePct }}% da faixa</p>
          </div>
          <div class="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
            <p class="text-xs text-gray-400">Drawdown Máx.</p>
            <p class="font-bold text-red-500 tabular-nums">{{ result.technical.maxDrawdown?.maxDrawdownPct ?? "N/A" }}%</p>
            <p class="text-xs text-gray-500">{{ result.technical.maxDrawdown?.interpretation }}</p>
          </div>
        </div>

        <div class="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg text-sm">
          <p class="text-xs text-gray-400">Liquidez Média Diária (63d)</p>
          <p class="font-bold">{{ result.technical.liquidity?.mainFormatted }}</p>
          <p class="text-xs text-gray-500">{{ result.technical.liquidity?.score?.label }}</p>
        </div>
      </div>
      <div v-else class="card flex items-center justify-center text-gray-400 py-12">
        <p>Dados técnicos não disponíveis</p>
      </div>

      <!-- Fundamentalista -->
      <div v-if="result.fundamental" class="card">
        <h2 class="font-semibold text-lg mb-3">💼 Análise Fundamentalista</h2>
        <div class="space-y-1 text-sm">
          <div v-for="(item, label) in {
            'P/L':           { v: result.fundamental.pl?.value,             u: 'x',     i: result.fundamental.pl?.interpretation },
            'P/VP':          { v: result.fundamental.pvp?.value,            u: 'x',     i: result.fundamental.pvp?.interpretation },
            'ROE':           { v: result.fundamental.roe?.value,            u: '%',     i: result.fundamental.roe?.interpretation },
            'Margem Liq.':   { v: result.fundamental.margemLiquida?.value,  u: '%',     i: result.fundamental.margemLiquida?.interpretation },
            'Dív./EBITDA':   { v: result.fundamental.dividaEbitda?.value,   u: 'x',     i: result.fundamental.dividaEbitda?.interpretation },
            'Cresc. Lucro':  { v: result.fundamental.earningsGrowth?.value, u: '%a.a.', i: result.fundamental.earningsGrowth?.interpretation },
            'Div. Yield':    { v: result.fundamental.dividendYield?.value,  u: '%',     i: result.fundamental.dividendYield?.interpretation },
            'Beta':          { v: result.fundamental.beta?.value,           u: '',      i: result.fundamental.beta?.interpretation },
            'Payout':        { v: result.fundamental.payout?.value,         u: '%',     i: result.fundamental.payout?.interpretation },
          }" :key="label"
            class="flex items-start gap-2 p-2 rounded hover:bg-gray-50 dark:hover:bg-gray-800">
            <span class="text-gray-500 w-28 flex-shrink-0">{{ label }}</span>
            <span class="font-mono font-bold tabular-nums">
              {{ item.v != null ? `${item.v}${item.u}` : "N/A" }}
            </span>
            <span class="text-xs text-gray-400 text-right flex-1">{{ item.i }}</span>
          </div>
        </div>
      </div>
      <div v-else class="card flex items-center justify-center text-gray-400 py-12">
        <p>Dados fundamentalistas não disponíveis</p>
      </div>
    </div>

    <!-- ── Preço Justo ────────────────────────────────────────── -->
    <div v-if="result.fairPrice" class="card">
      <h2 class="font-semibold text-lg mb-4">💰 Preço Justo</h2>
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div v-for="(model, name) in { Graham: result.fairPrice.graham, Bazin: result.fairPrice.bazin, Consenso: result.fairPrice.consenso }"
          :key="name" class="p-4 bg-gray-50 dark:bg-gray-800 rounded-xl">
          <p class="font-semibold mb-2">{{ name }}</p>
          <template v-if="model && ((model as any).valid !== false || name === 'Consenso') && model.price">
            <p class="text-2xl font-black tabular-nums">
              {{ currSymbol }} {{ formatNumber(model.price) }}
            </p>
            <p :class="[(model.upside ?? 0) >= 0 ? 'text-green-600' : 'text-red-500', 'font-bold text-sm']">
              {{ formatPercent(model.upside) }} upside
            </p>
            <p class="text-xs text-gray-400 mt-1">{{ model.classification?.label }}</p>
          </template>
          <template v-else>
            <p class="text-gray-400 text-sm">Não calculável</p>
            <p class="text-xs text-gray-400">{{ (model as any)?.reason }}</p>
          </template>
        </div>
      </div>
    </div>

    <!-- ── Recomendações Analistas ───────────────────────────── -->
    <div v-if="result.recommendations?.available" class="card">
      <h2 class="font-semibold text-lg mb-3">🏦 Recomendações dos Analistas</h2>
      <div class="flex items-center gap-4 mb-4 flex-wrap">
        <div>
          <p class="text-3xl font-black" :style="{ color: result.recommendations.currentClassify?.color }">
            {{ result.recommendations.currentClassify?.label }}
          </p>
          <p class="text-xs text-gray-400">{{ result.recommendations.numberOfAnalystOpinions }} analistas</p>
        </div>
        <div v-if="result.recommendations.tendencia" class="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
          <p class="font-bold text-sm">
            {{ result.recommendations.tendencia.emoji }} {{ result.recommendations.tendencia.label }}
          </p>
          <p class="text-xs text-gray-500">{{ result.recommendations.tendencia.desc }}</p>
        </div>
      </div>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
        <RecommendationChart :trends="result.recommendations.trends" />
        <TrendChart :scores="result.recommendations.scores" />
      </div>
    </div>

    <!-- ── Radar por Perfil ───────────────────────────────────── -->
    <div class="card">
      <h2 class="font-semibold mb-4">🕸️ Radar por Perfil</h2>
      <ScoreRadarChart :scores="result.scores" />
    </div>

  </div>
</template>