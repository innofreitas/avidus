<script setup lang="ts">
import { ref, computed, watch, onMounted } from "vue";
import Swal from "sweetalert2";
import api from "@/utils/api";
import { fmtDate } from "@/utils/formatters";
import Pagination from "@/components/table/Pagination.vue";

const MySwal = Swal.mixin({
  customClass: {
    popup:         "swal-avidus",
    confirmButton: "btn-danger text-sm",
    cancelButton:  "btn-secondary text-sm",
  },
  buttonsStyling: false,
  reverseButtons: true,
});

// ─── Tipos ────────────────────────────────────────────────────

interface CacheRow {
  id:        string;
  ticker:    string;
  date:      string;
  createdAt: string;
  updatedAt: string;
  rawData:   Record<string, any>;
}

// ─── Estado ───────────────────────────────────────────────────

const rows      = ref<CacheRow[]>([]);
const loading   = ref(false);
const error     = ref<string | null>(null);
const filter    = ref("");
const sortField = ref<"ticker" | "date" | "updatedAt">("ticker");
const sortDir   = ref<"asc" | "desc">("asc");

// Um único id expandido — ref<string|null> é 100% reativo no Vue 3
const expandedId = ref<string | null>(null);
const activeTab  = ref("meta");
const deleting   = ref(false);
const copied     = ref(false);

// ─── Paginação ───────────────────────────────────────────────

const PAGE_SIZE_OPTIONS = [15, 50, 100] as const;
const pageSize    = ref<number>(15);
const currentPage = ref(1);

// Reseta para página 1 ao mudar filtro ou ordenação
watch([filter, sortField, sortDir], () => {
  currentPage.value = 1;
});

// ─── Fetch ────────────────────────────────────────────────────

async function load() {
  loading.value    = true;
  error.value      = null;
  expandedId.value = null;
  try {
    const q   = filter.value.trim() ? `?ticker=${filter.value.trim().toUpperCase()}` : "";
    const res = await api.get<{ success: boolean; data: CacheRow[] }>(`/stock/cache${q}`);
    rows.value = res.data.data ?? [];
  } catch (e: any) {
    error.value = e?.message ?? "Erro ao carregar cache";
  } finally {
    loading.value = false;
  }
}

onMounted(load);

// ─── Ordenação ────────────────────────────────────────────────

function setSort(f: "ticker" | "date" | "updatedAt") {
  if (sortField.value === f) sortDir.value = sortDir.value === "asc" ? "desc" : "asc";
  else { sortField.value = f; sortDir.value = "asc"; }
}

const sorted = computed(() =>
  [...rows.value].sort((a, b) => {
    const va = String(a[sortField.value] ?? "");
    const vb = String(b[sortField.value] ?? "");
    return sortDir.value === "asc" ? va.localeCompare(vb) : vb.localeCompare(va);
  })
);

// ─── Paginação — computed ────────────────────────────────────

const paginated = computed(() => {
  const start = (currentPage.value - 1) * pageSize.value;
  return sorted.value.slice(start, start + pageSize.value);
});

function sortIcon(f: string) {
  if (sortField.value !== f) return "↕";
  return sortDir.value === "asc" ? "↑" : "↓";
}

// ─── Expand / collapse ────────────────────────────────────────

function toggleExpand(row: CacheRow) {
  if (expandedId.value === row.id) {
    expandedId.value = null;
  } else {
    expandedId.value = row.id;
    activeTab.value  = "meta";
  }
}

// ─── Dado da aba ativa ────────────────────────────────────────

const TABS = [
  { key: "meta",            label: "Meta"          },
  { key: "fundamental",     label: "Fundamental"   },
  { key: "technical",       label: "Técnico"       },
  { key: "recommendations", label: "Recomendações" },
  { key: "raw",             label: "JSON Completo" },
];

const expandedRow = computed(() =>
  rows.value.find(r => r.id === expandedId.value) ?? null
);

const tabContent = computed(() => {
  const row = expandedRow.value;
  if (!row) return null;
  if (activeTab.value === "raw") return row.rawData;
  return row.rawData[activeTab.value] ?? null;
});

// ─── Copiar JSON ──────────────────────────────────────────────

async function copyJson() {
  if (!tabContent.value) return;
  try {
    await navigator.clipboard.writeText(JSON.stringify(tabContent.value, null, 2));
    copied.value = true;
    setTimeout(() => { copied.value = false; }, 1500);
  } catch { /**/ }
}

// ─── Delete ───────────────────────────────────────────────────

async function deleteEntry(row: CacheRow) {
  const { isConfirmed } = await MySwal.fire({
    title: "Remover cache",
    html: `Deseja remover o cache de <strong class="font-mono text-indigo-600 dark:text-indigo-400">${row.ticker}</strong>?`,
    icon: "warning",
    showCancelButton: true,
    confirmButtonText: "🗑️ Remover",
    cancelButtonText: "Cancelar",
  });
  if (!isConfirmed) return;

  deleting.value = true;
  try {
    await api.delete(`/stock/cache/${row.ticker}`);
    if (expandedId.value === row.id) expandedId.value = null;
    rows.value = rows.value.filter(r => r.id !== row.id);
  } catch (e: any) {
    await MySwal.fire({
      title: "Erro ao remover",
      text: e?.message ?? "Não foi possível remover o cache.",
      icon: "error",
      confirmButtonText: "OK",
    });
  } finally {
    deleting.value = false;
  }
}

// ─── Helpers ──────────────────────────────────────────────────

function jsonSize(data: any) {
  const b = new Blob([JSON.stringify(data)]).size;
  return b < 1024 ? `${b} B` : `${(b / 1024).toFixed(1)} KB`;
}

// JSON formatado com indentação — texto puro, sem v-html
function fmtJson(obj: any): string {
  return JSON.stringify(obj, null, 2);
}
</script>

<template>
  <div class="max-w-7xl mx-auto space-y-5">

    <!-- Header -->
    <div class="flex items-center justify-between">
      <div>
        <h1 class="text-lg font-bold">🗄️ StockDataCache</h1>
        <p class="text-xs text-gray-500 mt-0.5">
          Cache diário por ticker —
          <span class="font-semibold">{{ rows.length }}</span>
          registro{{ rows.length !== 1 ? "s" : "" }}
        </p>
      </div>
      <button @click="load" :disabled="loading" class="btn-secondary text-sm">
        {{ loading ? "⏳ Carregando..." : "🔄 Atualizar" }}
      </button>
    </div>

    <!-- Filtro -->
    <div class="card flex items-center gap-3 py-3">
      <input
        v-model="filter"
        @keyup.enter="load"
        placeholder="Filtrar por ticker (ex: PETR4) — Enter para buscar"
        class="input flex-1 font-mono text-sm uppercase"
      />
      <button @click="load" :disabled="loading" class="btn-primary text-sm">
        Buscar
      </button>
      <button v-if="filter" @click="filter = ''; load()" class="btn-secondary text-sm">
        ✕ Limpar
      </button>
    </div>

    <!-- Erro -->
    <div v-if="error"
      class="card text-sm text-red-700 dark:text-red-300
             bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800">
      ❌ {{ error }}
    </div>

    <!-- Loading -->
    <div v-if="loading && rows.length === 0" class="card text-center py-14 text-gray-400">
      <p class="text-3xl mb-2 animate-spin inline-block">⏳</p>
      <p class="text-sm mt-2">Carregando...</p>
    </div>

    <!-- Vazio -->
    <div v-else-if="!loading && rows.length === 0"
      class="card text-center py-14 text-gray-400">
      <p class="text-3xl mb-2">📭</p>
      <p class="text-sm font-semibold">Nenhum registro encontrado</p>
      <p class="text-xs mt-1">Analise algum ativo para popular o cache</p>
    </div>

    <!-- Tabela -->
    <div v-else class="card p-0 overflow-hidden">
      <table class="w-full text-sm">

        <!-- Cabeçalho -->
        <thead class="bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
          <tr class="text-left">

            <th class="py-3 px-4">
              <button @click="setSort('ticker')"
                class="flex items-center gap-1.5 font-semibold text-gray-600 dark:text-gray-300
                       hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors">
                Ticker <span class="text-gray-400 text-xs">{{ sortIcon("ticker") }}</span>
              </button>
            </th>

            <th class="py-3 px-4">
              <button @click="setSort('date')"
                class="flex items-center gap-1.5 font-semibold text-gray-600 dark:text-gray-300
                       hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors">
                Data <span class="text-gray-400 text-xs">{{ sortIcon("date") }}</span>
              </button>
            </th>

            <th class="py-3 px-4">
              <button @click="setSort('updatedAt')"
                class="flex items-center gap-1.5 font-semibold text-gray-600 dark:text-gray-300
                       hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors">
                Atualizado em <span class="text-gray-400 text-xs">{{ sortIcon("updatedAt") }}</span>
              </button>
            </th>

            <th class="py-3 px-4 text-right font-semibold text-gray-600 dark:text-gray-300">
              Tamanho
            </th>

            <th class="py-3 px-4 text-center font-semibold text-gray-600 dark:text-gray-300">
              Ações
            </th>

          </tr>
        </thead>

        <tbody>
          <template v-for="row in paginated" :key="row.id">

            <!-- Linha principal -->
            <tr
              :class="[
                'border-b border-gray-100 dark:border-gray-800 transition-colors',
                expandedId === row.id
                  ? 'bg-indigo-50/50 dark:bg-indigo-950/20'
                  : 'hover:bg-gray-50 dark:hover:bg-gray-800/40',
              ]"
            >
              <!-- Ticker -->
              <td class="py-3 px-4">
                <span class="font-mono font-bold text-indigo-600 dark:text-indigo-400">
                  {{ row.ticker }}
                </span>
              </td>

              <!-- Data -->
              <td class="py-3 px-4 tabular-nums text-gray-600 dark:text-gray-400">
                {{ fmtDate(row.date) }}
              </td>

              <!-- Atualizado em -->
              <td class="py-3 px-4 text-xs text-gray-500 tabular-nums">
                {{ fmtDate(row.updatedAt) }}
              </td>

              <!-- Tamanho -->
              <td class="py-3 px-4 text-right text-xs text-gray-500 tabular-nums">
                {{ jsonSize(row.rawData) }}
              </td>

              <!-- Ações -->
              <td class="py-3 px-4">
                <div class="flex items-center justify-center gap-2">

                  <!-- Botão expandir -->
                  <button
                    @click="toggleExpand(row)"
                    :class="[
                      'text-xs font-medium px-3 py-1.5 rounded-lg border transition-colors',
                      expandedId === row.id
                        ? 'bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300 border-indigo-300 dark:border-indigo-700'
                        : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 border-gray-200 dark:border-gray-700 hover:border-indigo-400 hover:text-indigo-600 dark:hover:text-indigo-400',
                    ]"
                  >
                    {{ expandedId === row.id ? "▲ Ocultar" : "▼ rawData" }}
                  </button>

                  <!-- Botão deletar -->
                  <button
                    @click="deleteEntry(row)"
                    :disabled="deleting"
                    class="text-xs font-medium px-3 py-1.5 rounded-lg border
                           border-red-200 dark:border-red-800
                           text-red-500 dark:text-red-400
                           hover:bg-red-50 dark:hover:bg-red-950/30
                           disabled:opacity-40 disabled:cursor-not-allowed
                           transition-colors"
                  >
                    🗑️
                  </button>

                </div>
              </td>
            </tr>

            <!-- Linha expandida — JSON viewer -->
            <tr v-if="expandedId === row.id" :key="row.id + '_exp'">
              <td colspan="5" class="p-0 border-b border-indigo-200 dark:border-indigo-800">
                <div class="bg-gray-950">

                  <!-- Barra de abas -->
                  <div class="flex items-center border-b border-gray-800 overflow-x-auto">
                    <button
                      v-for="tab in TABS"
                      :key="tab.key"
                      @click="activeTab = tab.key"
                      :class="[
                        'px-4 py-2.5 text-xs font-medium whitespace-nowrap flex-shrink-0 transition-colors border-b-2',
                        activeTab === tab.key
                          ? 'text-indigo-400 border-indigo-500 bg-gray-900'
                          : 'text-gray-500 border-transparent hover:text-gray-300 hover:bg-gray-900',
                      ]"
                    >
                      {{ tab.label }}
                      <!-- indicador de aba vazia -->
                      <span
                        v-if="tab.key !== 'raw' && row.rawData[tab.key] == null"
                        class="ml-1 text-gray-700"
                      >∅</span>
                    </button>

                    <!-- Spacer + botão copiar -->
                    <div class="flex-1" />
                    <button
                      @click="copyJson"
                      :disabled="!tabContent"
                      class="px-4 py-2.5 text-xs text-gray-500 hover:text-gray-300
                             disabled:opacity-30 transition-colors whitespace-nowrap flex-shrink-0"
                    >
                      {{ copied ? "✅ Copiado!" : "📋 Copiar" }}
                    </button>
                  </div>

                  <!-- Conteúdo -->
                  <div class="overflow-auto max-h-[540px] p-4">

                    <!-- Aba sem dados -->
                    <p v-if="tabContent === null"
                      class="text-gray-600 text-xs italic">
                      Sem dados nesta seção.
                    </p>

                    <!-- JSON formatado — <pre> sem v-html, texto puro -->
                    <pre
                      v-else
                      class="text-xs font-mono leading-relaxed text-green-300 whitespace-pre-wrap break-all"
                    >{{ fmtJson(tabContent) }}</pre>

                  </div>

                </div>
              </td>
            </tr>

          </template>
        </tbody>
      </table>

      <!-- Paginação -->
      <div class="px-4 py-2.5 border-t border-gray-200 dark:border-gray-700">
        <Pagination
          :total-items="sorted.length"
          :page-size="pageSize"
          :current-page="currentPage"
          :page-size-options="PAGE_SIZE_OPTIONS"
          @update:page-size="pageSize = $event"
          @update:current-page="currentPage = $event"
        />
      </div>
    </div>

  </div>
</template>