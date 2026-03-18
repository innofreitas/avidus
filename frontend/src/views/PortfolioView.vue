<script setup lang="ts">
import { ref, computed, shallowRef } from "vue";
import * as XLSX from "xlsx";
import api from "@/utils/api";
import type { AnalysisResult, ProfileName } from "@/types";
import { PROFILE_LABELS, PROFILE_ICONS, ALL_PROFILES } from "@/types";
import { decisionColor, decisionBadgeClass, formatNumber } from "@/utils/formatters";
import AnalysisDetail from "@/components/analysis/AnalysisDetail.vue";

// ─── Tipos ────────────────────────────────────────────────────

interface AcaoRow {
  codigo: string;
  produto: string;
  quantidade: number | null;
  precoFechamento: number | null;
  valorAtualizado: number | null;
  recomendacao: RecomendacaoState | null;
}
interface EtfRow {
  codigo: string;
  produto: string;
  quantidade: number | null;
  precoFechamento: number | null;
  valorAtualizado: number | null;
}
interface FundoRow {
  codigo: string;
  produto: string;
  quantidade: number | null;
  precoFechamento: number | null;
  valorAtualizado: number | null;
}
interface RendaFixaRow {
  produto: string;
  quantidade: number | null;
  dataEmissao: string | null;
  vencimento: string | null;
  precoAtualizado: number | null;
  valorAtualizado: number | null;
}
interface TesouroDiretoRow {
  produto: string;
  indexador: string | null;
  vencimento: string | null;
  quantidade: number | null;
  valorAplicado: number | null;
  valorBruto: number | null;
  valorLiquido: number | null;
  valorAtualizado: number | null;
}
interface RecomendacaoState {
  loading: boolean;
  error: string | null;
  result: AnalysisResult | null;
}

// ─── Estado ───────────────────────────────────────────────────

const fileInput      = ref<HTMLInputElement | null>(null);
const fileName       = ref<string | null>(null);
const isDragging     = ref(false);
const processing     = ref(false);
const processError   = ref<string | null>(null);
const analisando     = ref(false);
const analisandoIdx  = ref<number | null>(null);

const acoes         = ref<AcaoRow[]>([]);
const etfs          = ref<EtfRow[]>([]);
const fundos        = ref<FundoRow[]>([]);
const rendaFixa     = ref<RendaFixaRow[]>([]);
const tesouroDireto = ref<TesouroDiretoRow[]>([]);

const filterAcoes  = ref("");
const filterEtf    = ref("");
const filterFundo  = ref("");
const filterRF     = ref("");
const filterTD     = ref("");

const modalResult  = shallowRef<AnalysisResult | null>(null);
const modalTicker  = ref("");
const showModal    = ref(false);

const activeTab    = ref<"acoes" | "etf" | "fundos" | "renda_fixa" | "tesouro">("acoes");

const hasData = computed(() =>
  acoes.value.length || etfs.value.length || fundos.value.length ||
  rendaFixa.value.length || tesouroDireto.value.length
);

// ─── Helpers de parsing ───────────────────────────────────────

function n(v: any): number | null {
  if (v == null || v === "" || v === "-") return null;
  const x = typeof v === "number" ? v : parseFloat(String(v).replace(/\./g, "").replace(",", "."));
  return isFinite(x) ? x : null;
}

function fmtDate(v: any): string | null {
  if (v == null || v === "") return null;
  // SheetJS pode retornar Date, número serial ou string
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "number") {
    // número serial Excel → Date
    const d = XLSX.SSF.parse_date_code(v);
    if (d) return `${d.y}-${String(d.m).padStart(2, "0")}-${String(d.d).padStart(2, "0")}`;
  }
  return String(v);
}

function fmtDateDisplay(v: string | null): string {
  if (!v) return "—";
  const [y, m, d] = v.split("-");
  if (!d) return v;
  return `${d}/${m}/${y}`;
}

function fmtCurrency(v: number | null): string {
  if (v == null) return "—";
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2 });
}

function fmtQtd(v: number | null): string {
  if (v == null) return "—";
  return v.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 6 });
}

// ─── Mapeamento de colunas (case-insensitive, contém) ─────────

function findCol(headers: string[], keywords: string[]): number {
  const normalize = (s: string) => s.toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "");
  const normKw = keywords.map(normalize);
  return headers.findIndex(h => normKw.every(k => normalize(h).includes(k)));
}

// ─── Parser por aba ───────────────────────────────────────────

function parseAcoesSheet(ws: XLSX.WorkSheet): AcaoRow[] {
  const data = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, defval: null });
  if (data.length < 2) return [];
  const headers = (data[0] as any[]).map(h => String(h ?? ""));
  const cCodigo   = findCol(headers, ["código", "negociação"]);
  const cProduto  = findCol(headers, ["produto"]);
  const cQtd      = findCol(headers, ["quantidade"]);
  const cPreco    = findCol(headers, ["preço", "fechamento"]);
  const cValor    = findCol(headers, ["valor", "atualizado"]);
  return data.slice(1)
    .filter((r: any[]) => r[cCodigo])
    .map((r: any[]) => ({
      codigo:          String(r[cCodigo] ?? "").trim(),
      produto:         String(r[cProduto] ?? "").trim(),
      quantidade:      n(r[cQtd]),
      precoFechamento: n(r[cPreco]),
      valorAtualizado: n(r[cValor]),
      recomendacao:    null,
    }));
}

function parseEtfSheet(ws: XLSX.WorkSheet): EtfRow[] {
  const data = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, defval: null });
  if (data.length < 2) return [];
  const headers = (data[0] as any[]).map(h => String(h ?? ""));
  const cCodigo  = findCol(headers, ["código", "negociação"]);
  const cProduto = findCol(headers, ["produto"]);
  const cQtd     = findCol(headers, ["quantidade"]);
  const cPreco   = findCol(headers, ["preço", "fechamento"]);
  const cValor   = findCol(headers, ["valor", "atualizado"]);
  return data.slice(1)
    .filter((r: any[]) => r[cCodigo])
    .map((r: any[]) => ({
      codigo:          String(r[cCodigo] ?? "").trim(),
      produto:         String(r[cProduto] ?? "").trim(),
      quantidade:      n(r[cQtd]),
      precoFechamento: n(r[cPreco]),
      valorAtualizado: n(r[cValor]),
    }));
}

function parseFundoSheet(ws: XLSX.WorkSheet): FundoRow[] {
  const data = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, defval: null });
  if (data.length < 2) return [];
  const headers = (data[0] as any[]).map(h => String(h ?? ""));
  const cCodigo  = findCol(headers, ["código", "negociação"]);
  const cProduto = findCol(headers, ["produto"]);
  const cQtd     = findCol(headers, ["quantidade"]);
  const cPreco   = findCol(headers, ["preço", "fechamento"]);
  const cValor   = findCol(headers, ["valor", "atualizado"]);
  return data.slice(1)
    .filter((r: any[]) => r[cCodigo])
    .map((r: any[]) => ({
      codigo:          String(r[cCodigo] ?? "").trim(),
      produto:         String(r[cProduto] ?? "").trim(),
      quantidade:      n(r[cQtd]),
      precoFechamento: n(r[cPreco]),
      valorAtualizado: n(r[cValor]),
    }));
}

function parseRendaFixaSheet(ws: XLSX.WorkSheet): RendaFixaRow[] {
  const data = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, defval: null });
  if (data.length < 2) return [];
  const headers = (data[0] as any[]).map(h => String(h ?? ""));
  const cProduto  = findCol(headers, ["produto"]);
  const cQtd      = findCol(headers, ["quantidade"]);
  const cEmissao  = findCol(headers, ["emissão"]);
  const cVenc     = findCol(headers, ["vencimento"]);
  const cPreco    = findCol(headers, ["preço", "curva"]);
  const cValor    = findCol(headers, ["valor", "curva"]);
  return data.slice(1)
    .filter((r: any[]) => r[cProduto])
    .map((r: any[]) => ({
      produto:         String(r[cProduto] ?? "").trim(),
      quantidade:      n(r[cQtd]),
      dataEmissao:     fmtDate(r[cEmissao]),
      vencimento:      fmtDate(r[cVenc]),
      precoAtualizado: n(r[cPreco]),
      valorAtualizado: n(r[cValor]),
    }));
}

function parseTesouroDiretoSheet(ws: XLSX.WorkSheet): TesouroDiretoRow[] {
  const data = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, defval: null });
  if (data.length < 2) return [];
  const headers = (data[0] as any[]).map(h => String(h ?? ""));
  const cProduto  = findCol(headers, ["produto"]);
  const cIndex    = findCol(headers, ["indexador"]);
  const cVenc     = findCol(headers, ["vencimento"]);
  const cQtd      = findCol(headers, ["quantidade"]);
  const cAplicado = findCol(headers, ["aplicado"]);
  const cBruto    = findCol(headers, ["bruto"]);
  const cLiquido  = findCol(headers, ["líquido"]);
  const cAtual    = findCol(headers, ["atualizado"]);
  return data.slice(1)
    .filter((r: any[]) => r[cProduto])
    .map((r: any[]) => ({
      produto:         String(r[cProduto] ?? "").trim(),
      indexador:       r[cIndex] != null ? String(r[cIndex]).trim() : null,
      vencimento:      fmtDate(r[cVenc]),
      quantidade:      n(r[cQtd]),
      valorAplicado:   n(r[cAplicado]),
      valorBruto:      n(r[cBruto]),
      valorLiquido:    n(r[cLiquido]),
      valorAtualizado: n(r[cAtual]),
    }));
}

// ─── Processamento do arquivo ─────────────────────────────────

const SHEET_MAP: Record<string, { keywords: string[]; parser: (ws: XLSX.WorkSheet) => any[] }> = {
  acoes:        { keywords: ["acoes", "acao", "acão"],   parser: parseAcoesSheet },
  etf:          { keywords: ["etf"],                     parser: parseEtfSheet },
  fundos:       { keywords: ["fundo"],                   parser: parseFundoSheet },
  renda_fixa:   { keywords: ["renda", "fixa"],           parser: parseRendaFixaSheet },
  tesouro:      { keywords: ["tesouro"],                 parser: parseTesouroDiretoSheet },
};

function matchSheet(name: string, keywords: string[]): boolean {
  // Normaliza removendo acentos para comparação robusta
  const normalize = (s: string) => s.toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "");
  const normName = normalize(name);
  // Usa some() — qualquer keyword que bata confirma a aba
  return keywords.some(k => normName.includes(normalize(k)));
}

async function processFile(file: File) {
  processing.value  = true;
  processError.value = null;

  // Reset
  acoes.value = []; etfs.value = []; fundos.value = [];
  rendaFixa.value = []; tesouroDireto.value = [];

  try {
    const buf  = await file.arrayBuffer();
    const wb   = XLSX.read(buf, { type: "array", cellDates: false });
    const names = wb.SheetNames;

    console.log("[Portfolio] Abas encontradas na planilha:", names);

    let found = 0;
    for (const [key, cfg] of Object.entries(SHEET_MAP)) {
      const sheetName = names.find(n => matchSheet(n, cfg.keywords));
      console.log(`[Portfolio] Buscando aba '${key}' (keywords: ${cfg.keywords}) →`, sheetName ?? "NÃO ENCONTRADA");
      if (!sheetName) continue;
      const ws   = wb.Sheets[sheetName];
      const rows = cfg.parser(ws);
      if (key === "acoes")      acoes.value      = rows;
      if (key === "etf")        etfs.value       = rows;
      if (key === "fundos")     fundos.value     = rows;
      if (key === "renda_fixa") rendaFixa.value  = rows;
      if (key === "tesouro")    tesouroDireto.value = rows;
      found += rows.length;
    }

    if (!found) throw new Error("Nenhum dado encontrado. Verifique se os nomes das abas e colunas estão corretos.");

    fileName.value = file.name;
    // Ativa a primeira aba com dados
    if (acoes.value.length)        activeTab.value = "acoes";
    else if (etfs.value.length)    activeTab.value = "etf";
    else if (fundos.value.length)  activeTab.value = "fundos";
    else if (rendaFixa.value.length) activeTab.value = "renda_fixa";
    else                            activeTab.value = "tesouro";
  } catch (e: any) {
    processError.value = e.message;
  } finally {
    processing.value = false;
  }
}

function onFileChange(e: Event) {
  const f = (e.target as HTMLInputElement).files?.[0];
  if (f) processFile(f);
}
function onDrop(e: DragEvent) {
  isDragging.value = false;
  const f = e.dataTransfer?.files?.[0];
  if (f) processFile(f);
}

// ─── Análise de Ações ─────────────────────────────────────────

async function analisarTodas() {
  if (!acoes.value.length || analisando.value) return;
  analisando.value = true;
  for (let i = 0; i < acoes.value.length; i++) {
    const row = acoes.value[i];
    analisandoIdx.value = i;
    row.recomendacao = { loading: true, error: null, result: null };
    try {
      const ticker = row.codigo.toUpperCase().endsWith(".SA") ? row.codigo : row.codigo + ".SA";
      const res = await api.get<{ success: boolean; data: AnalysisResult }>(`/stock/analyze/${ticker}`);
      row.recomendacao = { loading: false, error: null, result: res.data.data ?? null };
    } catch (e: any) {
      row.recomendacao = { loading: false, error: e.message, result: null };
    }
  }
  analisandoIdx.value = null;
  analisando.value    = false;
}

function openModal(rec: RecomendacaoState, ticker: string) {
  if (!rec.result) return;
  modalResult.value = rec.result;
  modalTicker.value = ticker;
  showModal.value   = true;
}
function closeModal() { showModal.value = false; modalResult.value = null; }

// ─── Filtros ──────────────────────────────────────────────────

const filteredAcoes  = computed(() => acoes.value.filter(r =>
  !filterAcoes.value || r.produto.toLowerCase().includes(filterAcoes.value.toLowerCase()) ||
  r.codigo.toLowerCase().includes(filterAcoes.value.toLowerCase())));
const filteredEtfs   = computed(() => etfs.value.filter(r =>
  !filterEtf.value || r.produto.toLowerCase().includes(filterEtf.value.toLowerCase()) ||
  r.codigo.toLowerCase().includes(filterEtf.value.toLowerCase())));
const filteredFundos = computed(() => fundos.value.filter(r =>
  !filterFundo.value || r.produto.toLowerCase().includes(filterFundo.value.toLowerCase()) ||
  r.codigo.toLowerCase().includes(filterFundo.value.toLowerCase())));
const filteredRF     = computed(() => rendaFixa.value.filter(r =>
  !filterRF.value || r.produto.toLowerCase().includes(filterRF.value.toLowerCase())));
const filteredTD     = computed(() => tesouroDireto.value.filter(r =>
  !filterTD.value || r.produto.toLowerCase().includes(filterTD.value.toLowerCase())));

// ─── Totalizadores ────────────────────────────────────────────
const totalAcoes  = computed(() => acoes.value.reduce((s, r) => s + (r.valorAtualizado ?? 0), 0));
const totalEtfs   = computed(() => etfs.value.reduce((s, r) => s + (r.valorAtualizado ?? 0), 0));
const totalFundos = computed(() => fundos.value.reduce((s, r) => s + (r.valorAtualizado ?? 0), 0));
const totalRF     = computed(() => rendaFixa.value.reduce((s, r) => s + (r.valorAtualizado ?? 0), 0));
const totalTD     = computed(() => tesouroDireto.value.reduce((s, r) => s + (r.valorAtualizado ?? 0), 0));
const totalCart   = computed(() => totalAcoes.value + totalEtfs.value + totalFundos.value + totalRF.value + totalTD.value);

// Computed para os cards do resumo — evita acesso a .value dentro de v-for inline
const tabSummary = computed(() => [
  { key: "acoes",      label: "Ações",          icon: "📈", count: acoes.value.length,          total: totalAcoes.value   },
  { key: "etf",        label: "ETFs",           icon: "🗂️", count: etfs.value.length,           total: totalEtfs.value    },
  { key: "fundos",     label: "Fundos",         icon: "🏦", count: fundos.value.length,         total: totalFundos.value  },
  { key: "renda_fixa", label: "Renda Fixa",     icon: "📄", count: rendaFixa.value.length,      total: totalRF.value      },
  { key: "tesouro",    label: "Tesouro Direto", icon: "🏛️", count: tesouroDireto.value.length,   total: totalTD.value      },
]);

// decisão mais recorrente para o badge de resumo

function decisaoSummary(rec: RecomendacaoState | null): { label: string; emoji: string; color: string } | null {
  const r = rec?.result;
  if (!r) return null;
  const s = r.scores?.MODERADO;
  if (!s) return null;
  return { label: s.decision.replace(/_/g, " "), emoji: s.emoji, color: decisionColor(s.decision) };
}
</script>

<template>
  <div class="max-w-7xl mx-auto space-y-6">

    <!-- ── Header ────────────────────────────────────────────── -->
    <div class="flex items-start justify-between flex-wrap gap-4">
      <div>
        <h1 class="text-2xl font-bold">💼 Portfólio</h1>
        <p class="text-sm text-gray-500 mt-1">
          Importe sua carteira B3 e analise seus ativos automaticamente
        </p>
      </div>
      <div v-if="hasData" class="text-right">
        <p class="text-xs text-gray-400">Patrimônio total</p>
        <p class="text-2xl font-black tabular-nums text-indigo-600 dark:text-indigo-400">
          {{ fmtCurrency(totalCart) }}
        </p>
      </div>
    </div>

    <!-- ── Upload ─────────────────────────────────────────────── -->
    <div
      class="card border-2 border-dashed transition-colors cursor-pointer"
      :class="isDragging
        ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950/30'
        : 'border-gray-300 dark:border-gray-700 hover:border-indigo-400'"
      @dragover.prevent="isDragging = true"
      @dragleave="isDragging = false"
      @drop.prevent="onDrop"
      @click="fileInput?.click()">

      <input ref="fileInput" type="file" accept=".xlsx,.xls" class="hidden" @change="onFileChange" />

      <div class="flex flex-col items-center justify-center py-8 gap-3 text-center">
        <div class="text-4xl">
          {{ processing ? "⏳" : fileName ? "✅" : "📂" }}
        </div>
        <div v-if="processing">
          <p class="font-semibold text-indigo-600">Processando planilha...</p>
        </div>
        <div v-else-if="fileName">
          <p class="font-semibold text-green-600 dark:text-green-400">{{ fileName }}</p>
          <p class="text-xs text-gray-400 mt-1">Clique para substituir por outra planilha</p>
        </div>
        <div v-else>
          <p class="font-semibold text-gray-700 dark:text-gray-300">
            Arraste sua planilha B3 aqui
          </p>
          <p class="text-xs text-gray-400 mt-1">
            ou clique para selecionar o arquivo .xlsx
          </p>
          <p class="text-xs text-gray-400 mt-2">
            Abas esperadas: <span class="font-mono">Ações · ETF · Fundo de Investimento · Renda Fixa · Tesouro Direto</span>
          </p>
        </div>
      </div>
    </div>

    <!-- ── Erro de processamento ──────────────────────────────── -->
    <div v-if="processError"
      class="p-4 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-xl
             text-red-700 dark:text-red-300 flex gap-3 items-start">
      <span class="text-xl flex-shrink-0">❌</span>
      <div>
        <p class="font-semibold">Erro ao processar planilha</p>
        <p class="text-sm mt-0.5">{{ processError }}</p>
      </div>
    </div>

    <!-- ── Resumo por categoria ───────────────────────────────── -->
    <div v-if="hasData" class="grid grid-cols-2 sm:grid-cols-5 gap-3">
      <button v-for="tab in tabSummary" :key="tab.key"
        @click="activeTab = tab.key as any"
        :class="[
          'card text-left transition-all cursor-pointer p-3',
          activeTab === tab.key
            ? 'ring-2 ring-indigo-500 bg-indigo-50/50 dark:bg-indigo-950/30'
            : 'hover:ring-1 hover:ring-indigo-300',
          tab.count === 0 ? 'opacity-40 cursor-not-allowed' : '',
        ]"
        :disabled="tab.count === 0">
        <div class="flex items-center gap-2 mb-1">
          <span>{{ tab.icon }}</span>
          <span class="text-xs font-semibold text-gray-500 truncate">{{ tab.label }}</span>
          <span class="ml-auto text-xs bg-gray-100 dark:bg-gray-800 rounded-full px-1.5 py-0.5">
            {{ tab.count }}
          </span>
        </div>
        <p class="text-sm font-bold tabular-nums truncate">{{ fmtCurrency(tab.total) }}</p>
        <p class="text-xs text-gray-400">
          {{ totalCart > 0 ? ((tab.total / totalCart) * 100).toFixed(1) + '%' : '—' }}
        </p>
      </button>
    </div>

    <!-- ══════════════════════════════════════════════════════════
         ABA AÇÕES
    ═══════════════════════════════════════════════════════════ -->
    <div v-if="hasData && activeTab === 'acoes'" class="card space-y-4">
      <div class="flex items-center gap-3 flex-wrap">
        <h2 class="font-semibold text-lg">📈 Ações</h2>
        <span class="text-xs text-gray-400">({{ acoes.length }} ativos)</span>
        <div class="flex-1" />
        <!-- Filtro -->
        <input v-model="filterAcoes" placeholder="Filtrar produto / código..."
          class="input w-48 text-sm py-1.5" />
        <!-- Botão analisar -->
        <button @click="analisarTodas"
          :disabled="analisando || !acoes.length"
          class="btn-primary text-sm flex items-center gap-2">
          <span v-if="analisando" class="animate-spin">⏳</span>
          <span v-else">🔍</span>
          {{ analisando
            ? `Analisando ${analisandoIdx !== null ? analisandoIdx + 1 : ''}/${acoes.length}...`
            : "Analisar Todos" }}
        </button>
      </div>

      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead>
            <tr class="text-left text-xs text-gray-400 border-b border-gray-200 dark:border-gray-700">
              <th class="py-2 pr-3 sticky left-0 bg-white dark:bg-gray-900 z-10 min-w-[90px]">Código</th>
              <th class="py-2 pr-3 min-w-[180px]">Produto</th>
              <th class="py-2 pr-3 text-right">Quantidade</th>
              <th class="py-2 pr-3 text-right">Preço Fechamento</th>
              <th class="py-2 pr-3 text-right">Valor Atualizado</th>
              <th class="py-2 min-w-[280px]">Recomendação</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(row, i) in filteredAcoes" :key="i"
              class="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50">
              <td class="py-2 pr-3 sticky left-0 bg-white dark:bg-gray-900 font-mono font-bold text-indigo-600 dark:text-indigo-400">
                {{ row.codigo }}
              </td>
              <td class="py-2 pr-3 text-gray-600 dark:text-gray-300 max-w-[220px] truncate">{{ row.produto }}</td>
              <td class="py-2 pr-3 text-right tabular-nums">{{ fmtQtd(row.quantidade) }}</td>
              <td class="py-2 pr-3 text-right tabular-nums">{{ fmtCurrency(row.precoFechamento) }}</td>
              <td class="py-2 pr-3 text-right tabular-nums font-semibold">{{ fmtCurrency(row.valorAtualizado) }}</td>
              <td class="py-2">
                <!-- Loading -->
                <div v-if="row.recomendacao?.loading"
                  class="flex items-center gap-2 text-xs text-gray-400">
                  <span class="animate-spin">⏳</span> Analisando...
                </div>
                <!-- Erro -->
                <div v-else-if="row.recomendacao?.error"
                  class="text-xs text-red-400 flex items-center gap-1">
                  <span>❌</span>
                  <span class="truncate max-w-[140px]" :title="row.recomendacao.error">
                    {{ row.recomendacao.error }}
                  </span>
                </div>
                <!-- Resultado -->
                <div v-else-if="row.recomendacao?.result" class="flex items-start gap-2">
                  <!-- Badges por perfil + analistas -->
                  <div class="flex flex-col gap-1 flex-1">
                    <!-- 4 perfis -->
                    <div v-for="p in ALL_PROFILES" :key="p" class="flex items-center gap-1.5">
                      <span class="text-gray-400 w-20 text-xs truncate flex-shrink-0">
                        {{ PROFILE_ICONS[p] }} {{ PROFILE_LABELS[p] }}
                      </span>
                      <span v-if="row.recomendacao.result.scores?.[p]"
                        :class="['badge text-xs', decisionBadgeClass(row.recomendacao.result.scores[p].decision)]">
                        {{ row.recomendacao.result.scores[p].emoji }}
                        {{ row.recomendacao.result.scores[p].decision.replace(/_/g, " ") }}
                      </span>
                      <span v-else class="text-xs text-gray-400">—</span>
                    </div>
                    <!-- Analistas -->
                    <div v-if="row.recomendacao.result.recommendations?.available"
                      class="flex items-center gap-1.5 mt-0.5 pt-1 border-t border-gray-100 dark:border-gray-700">
                      <span class="text-gray-400 w-20 text-xs flex-shrink-0">🏦 Analistas</span>
                      <span class="text-xs font-semibold"
                        :style="{ color: row.recomendacao.result.recommendations.currentClassify?.color }">
                        {{ row.recomendacao.result.recommendations.currentClassify?.label }}
                      </span>
                      <span class="text-xs text-gray-400">
                        ({{ row.recomendacao.result.recommendations.numberOfAnalystOpinions }})
                      </span>
                    </div>
                  </div>
                  <!-- Botão ver detalhes -->
                  <button @click="openModal(row.recomendacao, row.codigo)"
                    title="Ver detalhes"
                    class="flex-shrink-0 p-1.5 rounded-lg text-indigo-500 hover:text-indigo-700
                           hover:bg-indigo-50 dark:hover:bg-indigo-950/50 transition-colors mt-0.5">
                    <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none"
                      viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                      <path stroke-linecap="round" stroke-linejoin="round"
                        d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
                      <path stroke-linecap="round" stroke-linejoin="round"
                        d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7
                           -1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/>
                    </svg>
                  </button>
                </div>
                <!-- Sem análise -->
                <span v-else class="text-xs text-gray-300 dark:text-gray-600">—</span>
              </td>
            </tr>
            <!-- Rodapé totalizador -->
            <tr class="border-t-2 border-gray-200 dark:border-gray-700 font-bold text-sm bg-gray-50 dark:bg-gray-800/30">
              <td colspan="4" class="py-2 pr-3 text-right text-gray-500">Total Ações:</td>
              <td class="py-2 pr-3 text-right tabular-nums text-indigo-600 dark:text-indigo-400">
                {{ fmtCurrency(totalAcoes) }}
              </td>
              <td></td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- ══════════════════════════════════════════════════════════
         ABA ETF
    ═══════════════════════════════════════════════════════════ -->
    <div v-if="hasData && activeTab === 'etf'" class="card space-y-4">
      <div class="flex items-center gap-3 flex-wrap">
        <h2 class="font-semibold text-lg">🗂️ ETFs</h2>
        <span class="text-xs text-gray-400">({{ etfs.length }} ativos)</span>
        <div class="flex-1" />
        <input v-model="filterEtf" placeholder="Filtrar produto / código..."
          class="input w-48 text-sm py-1.5" />
      </div>
      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead>
            <tr class="text-left text-xs text-gray-400 border-b border-gray-200 dark:border-gray-700">
              <th class="py-2 pr-3 sticky left-0 bg-white dark:bg-gray-900 z-10 min-w-[90px]">Código</th>
              <th class="py-2 pr-3">Produto</th>
              <th class="py-2 pr-3 text-right">Quantidade</th>
              <th class="py-2 pr-3 text-right">Preço Fechamento</th>
              <th class="py-2 text-right">Valor Atualizado</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(row, i) in filteredEtfs" :key="i"
              class="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50">
              <td class="py-2 pr-3 sticky left-0 bg-white dark:bg-gray-900 font-mono font-bold text-indigo-600 dark:text-indigo-400">{{ row.codigo }}</td>
              <td class="py-2 pr-3 text-gray-600 dark:text-gray-300 max-w-[220px] truncate">{{ row.produto }}</td>
              <td class="py-2 pr-3 text-right tabular-nums">{{ fmtQtd(row.quantidade) }}</td>
              <td class="py-2 pr-3 text-right tabular-nums">{{ fmtCurrency(row.precoFechamento) }}</td>
              <td class="py-2 text-right tabular-nums font-semibold">{{ fmtCurrency(row.valorAtualizado) }}</td>
            </tr>
            <tr class="border-t-2 border-gray-200 dark:border-gray-700 font-bold text-sm bg-gray-50 dark:bg-gray-800/30">
              <td colspan="4" class="py-2 pr-3 text-right text-gray-500">Total ETFs:</td>
              <td class="py-2 text-right tabular-nums text-indigo-600 dark:text-indigo-400">{{ fmtCurrency(totalEtfs) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- ══════════════════════════════════════════════════════════
         ABA FUNDOS
    ═══════════════════════════════════════════════════════════ -->
    <div v-if="hasData && activeTab === 'fundos'" class="card space-y-4">
      <div class="flex items-center gap-3 flex-wrap">
        <h2 class="font-semibold text-lg">🏦 Fundos de Investimento</h2>
        <span class="text-xs text-gray-400">({{ fundos.length }} ativos)</span>
        <div class="flex-1" />
        <input v-model="filterFundo" placeholder="Filtrar produto / código..."
          class="input w-48 text-sm py-1.5" />
      </div>
      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead>
            <tr class="text-left text-xs text-gray-400 border-b border-gray-200 dark:border-gray-700">
              <th class="py-2 pr-3 sticky left-0 bg-white dark:bg-gray-900 z-10 min-w-[90px]">Código</th>
              <th class="py-2 pr-3">Produto</th>
              <th class="py-2 pr-3 text-right">Quantidade</th>
              <th class="py-2 pr-3 text-right">Preço Fechamento</th>
              <th class="py-2 text-right">Valor Atualizado</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(row, i) in filteredFundos" :key="i"
              class="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50">
              <td class="py-2 pr-3 sticky left-0 bg-white dark:bg-gray-900 font-mono font-bold text-indigo-600 dark:text-indigo-400">{{ row.codigo }}</td>
              <td class="py-2 pr-3 text-gray-600 dark:text-gray-300 max-w-[220px] truncate">{{ row.produto }}</td>
              <td class="py-2 pr-3 text-right tabular-nums">{{ fmtQtd(row.quantidade) }}</td>
              <td class="py-2 pr-3 text-right tabular-nums">{{ fmtCurrency(row.precoFechamento) }}</td>
              <td class="py-2 text-right tabular-nums font-semibold">{{ fmtCurrency(row.valorAtualizado) }}</td>
            </tr>
            <tr class="border-t-2 border-gray-200 dark:border-gray-700 font-bold text-sm bg-gray-50 dark:bg-gray-800/30">
              <td colspan="4" class="py-2 pr-3 text-right text-gray-500">Total Fundos:</td>
              <td class="py-2 text-right tabular-nums text-indigo-600 dark:text-indigo-400">{{ fmtCurrency(totalFundos) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- ══════════════════════════════════════════════════════════
         ABA RENDA FIXA
    ═══════════════════════════════════════════════════════════ -->
    <div v-if="hasData && activeTab === 'renda_fixa'" class="card space-y-4">
      <div class="flex items-center gap-3 flex-wrap">
        <h2 class="font-semibold text-lg">📄 Renda Fixa</h2>
        <span class="text-xs text-gray-400">({{ rendaFixa.length }} ativos)</span>
        <div class="flex-1" />
        <input v-model="filterRF" placeholder="Filtrar produto..."
          class="input w-48 text-sm py-1.5" />
      </div>
      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead>
            <tr class="text-left text-xs text-gray-400 border-b border-gray-200 dark:border-gray-700">
              <th class="py-2 pr-3 sticky left-0 bg-white dark:bg-gray-900 z-10 min-w-[180px]">Produto</th>
              <th class="py-2 pr-3 text-right">Quantidade</th>
              <th class="py-2 pr-3">Emissão</th>
              <th class="py-2 pr-3">Vencimento</th>
              <th class="py-2 pr-3 text-right">Preço Curva</th>
              <th class="py-2 text-right">Valor Atualizado</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(row, i) in filteredRF" :key="i"
              class="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50">
              <td class="py-2 pr-3 sticky left-0 bg-white dark:bg-gray-900 font-medium max-w-[200px] truncate" :title="row.produto">
                {{ row.produto }}
              </td>
              <td class="py-2 pr-3 text-right tabular-nums">{{ fmtQtd(row.quantidade) }}</td>
              <td class="py-2 pr-3 text-gray-500 tabular-nums">{{ fmtDateDisplay(row.dataEmissao) }}</td>
              <td class="py-2 pr-3 text-gray-500 tabular-nums">{{ fmtDateDisplay(row.vencimento) }}</td>
              <td class="py-2 pr-3 text-right tabular-nums">{{ fmtCurrency(row.precoAtualizado) }}</td>
              <td class="py-2 text-right tabular-nums font-semibold">{{ fmtCurrency(row.valorAtualizado) }}</td>
            </tr>
            <tr class="border-t-2 border-gray-200 dark:border-gray-700 font-bold text-sm bg-gray-50 dark:bg-gray-800/30">
              <td colspan="5" class="py-2 pr-3 text-right text-gray-500">Total Renda Fixa:</td>
              <td class="py-2 text-right tabular-nums text-indigo-600 dark:text-indigo-400">{{ fmtCurrency(totalRF) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- ══════════════════════════════════════════════════════════
         ABA TESOURO DIRETO
    ═══════════════════════════════════════════════════════════ -->
    <div v-if="hasData && activeTab === 'tesouro'" class="card space-y-4">
      <div class="flex items-center gap-3 flex-wrap">
        <h2 class="font-semibold text-lg">🏛️ Tesouro Direto</h2>
        <span class="text-xs text-gray-400">({{ tesouroDireto.length }} títulos)</span>
        <div class="flex-1" />
        <input v-model="filterTD" placeholder="Filtrar produto..."
          class="input w-48 text-sm py-1.5" />
      </div>
      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead>
            <tr class="text-left text-xs text-gray-400 border-b border-gray-200 dark:border-gray-700">
              <th class="py-2 pr-3 sticky left-0 bg-white dark:bg-gray-900 z-10 min-w-[180px]">Produto</th>
              <th class="py-2 pr-3">Indexador</th>
              <th class="py-2 pr-3">Vencimento</th>
              <th class="py-2 pr-3 text-right">Quantidade</th>
              <th class="py-2 pr-3 text-right">Valor Aplicado</th>
              <th class="py-2 pr-3 text-right">Valor Bruto</th>
              <th class="py-2 pr-3 text-right">Valor Líquido</th>
              <th class="py-2 text-right">Valor Atualizado</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(row, i) in filteredTD" :key="i"
              class="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50">
              <td class="py-2 pr-3 sticky left-0 bg-white dark:bg-gray-900 font-medium max-w-[200px] truncate" :title="row.produto">
                {{ row.produto }}
              </td>
              <td class="py-2 pr-3 text-gray-500">{{ row.indexador ?? "—" }}</td>
              <td class="py-2 pr-3 text-gray-500 tabular-nums">{{ fmtDateDisplay(row.vencimento) }}</td>
              <td class="py-2 pr-3 text-right tabular-nums">{{ fmtQtd(row.quantidade) }}</td>
              <td class="py-2 pr-3 text-right tabular-nums">{{ fmtCurrency(row.valorAplicado) }}</td>
              <td class="py-2 pr-3 text-right tabular-nums">{{ fmtCurrency(row.valorBruto) }}</td>
              <td class="py-2 pr-3 text-right tabular-nums">{{ fmtCurrency(row.valorLiquido) }}</td>
              <td class="py-2 text-right tabular-nums font-semibold">{{ fmtCurrency(row.valorAtualizado) }}</td>
            </tr>
            <tr class="border-t-2 border-gray-200 dark:border-gray-700 font-bold text-sm bg-gray-50 dark:bg-gray-800/30">
              <td colspan="7" class="py-2 pr-3 text-right text-gray-500">Total Tesouro Direto:</td>
              <td class="py-2 text-right tabular-nums text-indigo-600 dark:text-indigo-400">{{ fmtCurrency(totalTD) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- ── Empty state ────────────────────────────────────────── -->
    <div v-if="!hasData && !processing && !processError"
      class="text-center py-16 text-gray-400">
      <p class="text-5xl mb-4">📊</p>
      <p class="text-lg font-semibold text-gray-500 dark:text-gray-400">Nenhum dado carregado</p>
      <p class="text-sm mt-1">Faça o upload da sua planilha B3 para começar</p>
    </div>

    <!-- ══════════════════════════════════════════════════════════
         MODAL DE DETALHES DA ANÁLISE
    ═══════════════════════════════════════════════════════════ -->
    <Teleport to="body">
      <Transition name="modal">
        <div v-if="showModal"
          class="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto py-8 px-4"
          @click.self="closeModal">

          <!-- Backdrop -->
          <div class="fixed inset-0 bg-black/60 backdrop-blur-sm" @click="closeModal" />

          <!-- Modal content -->
          <div class="relative w-full max-w-4xl bg-white dark:bg-gray-900 rounded-2xl shadow-2xl
                      border border-gray-200 dark:border-gray-700 z-10">

            <!-- Header -->
            <div class="flex items-center justify-between p-5 border-b border-gray-200 dark:border-gray-700">
              <div>
                <h2 class="text-xl font-black">
                  {{ modalTicker }}
                  <span class="text-gray-500 font-normal text-base ml-2">
                    {{ modalResult?.meta?.shortName ?? "" }}
                  </span>
                </h2>
                <p class="text-xs text-gray-400 mt-0.5">
                  {{ modalResult?.meta?.sector }} · {{ modalResult?.meta?.currency }}
                </p>
              </div>
              <button @click="closeModal"
                class="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-gray-500">
                ✕
              </button>
            </div>

            <!-- Body — usa o mesmo componente da AnalysisView -->
            <div v-if="modalResult" class="p-5 overflow-y-auto max-h-[80vh]">
              <AnalysisDetail :result="modalResult" />
            </div><!-- /body -->
          </div><!-- /modal -->
        </div>
      </Transition>
    </Teleport>

  </div>
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