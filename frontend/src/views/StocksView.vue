<script setup lang="ts">
import { ref, computed, watch, onMounted } from "vue";
import api from "@/utils/api";
import Pagination from "@/components/table/Pagination.vue";

// ─── Tradução de setores ─────────────────────────────────────
// Backend retorna sectorPt já traduzido
// Frontend usa diretamente sem processamento adicional

// ─── Tipos ────────────────────────────────────────────────────

interface StockRow {
  id:       string;
  ticker:   string;
  sector:   string;       // Setor original (inglês)
  sectorPt: string;       // Setor traduzido (português)
  name:     string;
  updatedAt: string;
}

interface Toast {
  type: "success" | "error";
  text: string;
}

// ─── Estado ───────────────────────────────────────────────────

const rows       = ref<StockRow[]>([]);
const loading    = ref(false);
const loadingDB  = ref(false);
const error      = ref<string | null>(null);
const filterText = ref("");
const sortField  = ref<"ticker" | "sectorPt" | "name">("ticker");
const sortDir    = ref<"asc" | "desc">("asc");

// ─── Paginação ───────────────────────────────────────────────

const PAGE_SIZE_OPTIONS = [15, 50, 100] as const;
const pageSize    = ref<number>(15);
const currentPage = ref(1);

// ─── Toast ───────────────────────────────────────────────────

const toast       = ref<Toast | null>(null);
let   toastTimer: ReturnType<typeof setTimeout> | null = null;

function showToast(type: Toast["type"], text: string) {
  if (toastTimer) clearTimeout(toastTimer);
  toast.value = { type, text };
  toastTimer = setTimeout(() => { toast.value = null; }, 5000);
}

function dismissToast() {
  if (toastTimer) clearTimeout(toastTimer);
  toast.value = null;
}

// ─── Setores únicos (para filtro) ────────────────────────────

const sectors = computed(() => {
  const s = new Set(rows.value.map(r => r.sectorPt));
  return ["Todos", ...Array.from(s).sort()];
});
const selectedSector = ref("Todos");

// Reseta para página 1 ao mudar qualquer filtro ou ordenação
watch([filterText, selectedSector, sortField, sortDir, pageSize], () => {
  currentPage.value = 1;
});

// ─── Fetch da lista local (banco) ────────────────────────────

async function fetchList() {
  loading.value = true;
  error.value   = null;
  try {
    const res = await api.get<{ success: boolean; data: StockRow[] }>("/stocks");
    // Backend retorna rows com sectorPt já traduzido
    rows.value  = res.data.data ?? [];
  } catch (e: any) {
    error.value = e?.message ?? "Erro ao carregar ações";
  } finally {
    loading.value = false;
  }
}

// ─── Carregar da brapi e salvar no banco ─────────────────────

async function loadFromBrapi() {
  loadingDB.value = true;
  error.value     = null;
  try {
    const res = await api.post<{
      success:  boolean;
      upserted: number;
      skipped:  number;
      total:    number;
    }>("/stocks/load");
    await fetchList();
    const { upserted, skipped, total } = res.data;
    showToast(
      "success",
      `${upserted} ativos salvos · ${skipped} ignorados (ticker = nome) · ${total} recebidos da brapi`
    );
  } catch (e: any) {
    showToast("error", e?.response?.data?.error ?? e?.message ?? "Erro ao carregar dados da brapi");
  } finally {
    loadingDB.value = false;
  }
}

onMounted(fetchList);

// ─── Filtragem + ordenação ───────────────────────────────────

const filtered = computed(() => {
  const q = filterText.value.trim().toUpperCase();
  return rows.value.filter(r => {
    const matchText   = !q || r.ticker.includes(q) || r.name.toUpperCase().includes(q);
    const matchSector = selectedSector.value === "Todos" || r.sectorPt === selectedSector.value;
    return matchText && matchSector;
  });
});

const sorted = computed(() =>
  [...filtered.value].sort((a, b) => {
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

function setSort(f: "ticker" | "sectorPt" | "name") {
  if (sortField.value === f) sortDir.value = sortDir.value === "asc" ? "desc" : "asc";
  else { sortField.value = f; sortDir.value = "asc"; }
}

function sortIcon(f: string) {
  if (sortField.value !== f) return "↕";
  return sortDir.value === "asc" ? "↑" : "↓";
}
</script>

<template>
  <div class="p-6 max-w-full">
    <!-- Cabeçalho -->
    <div class="flex items-center justify-between mb-6">
      <div>
        <h1 class="text-2xl font-bold text-gray-900 dark:text-white">Ações B3</h1>
        <p class="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
          {{ rows.length }} ativo{{ rows.length !== 1 ? "s" : "" }} no banco
        </p>
      </div>

      <button
        @click="loadFromBrapi"
        :disabled="loadingDB"
        class="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium
               bg-indigo-600 hover:bg-indigo-700 text-white disabled:opacity-50
               transition-colors"
      >
        <span v-if="loadingDB" class="animate-spin inline-block">⏳</span>
        <span v-else>📥</span>
        {{ loadingDB ? "Carregando..." : "Carregar dados" }}
      </button>
    </div>

    <!-- Toast de feedback -->
    <Transition
      enter-active-class="transition duration-300 ease-out"
      enter-from-class="opacity-0 -translate-y-2"
      enter-to-class="opacity-100 translate-y-0"
      leave-active-class="transition duration-200 ease-in"
      leave-from-class="opacity-100 translate-y-0"
      leave-to-class="opacity-0 -translate-y-2"
    >
      <div
        v-if="toast"
        :class="[
          'mb-4 flex items-start gap-3 p-4 rounded-xl text-sm font-medium shadow-sm',
          toast.type === 'success'
            ? 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
            : 'bg-red-50 dark:bg-red-900/30 text-red-800 dark:text-red-300 border border-red-200 dark:border-red-800',
        ]"
      >
        <span class="text-base mt-0.5 flex-shrink-0">{{ toast.type === "success" ? "✅" : "❌" }}</span>
        <span class="flex-1">{{ toast.text }}</span>
        <button @click="dismissToast" class="ml-2 opacity-60 hover:opacity-100 transition-opacity text-base leading-none">✕</button>
      </div>
    </Transition>

    <!-- Filtros -->
    <div class="flex flex-wrap gap-3 mb-4">
      <input
        v-model="filterText"
        placeholder="Filtrar por ticker ou nome..."
        class="flex-1 min-w-[200px] px-3 py-2 rounded-lg border text-sm
               border-gray-300 dark:border-gray-600
               bg-white dark:bg-gray-800
               text-gray-900 dark:text-white
               placeholder-gray-400 dark:placeholder-gray-500
               focus:outline-none focus:ring-2 focus:ring-indigo-500"
      />

      <select
        v-model="selectedSector"
        class="px-3 py-2 rounded-lg border text-sm
               border-gray-300 dark:border-gray-600
               bg-white dark:bg-gray-800
               text-gray-900 dark:text-white
               focus:outline-none focus:ring-2 focus:ring-indigo-500"
      >
        <option v-for="s in sectors" :key="s" :value="s">{{ s }}</option>
      </select>
    </div>

    <!-- Erro de carregamento inicial -->
    <div v-if="error" class="mb-4 p-3 rounded-lg bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300 text-sm">
      {{ error }}
    </div>

    <!-- Loading inicial -->
    <div v-if="loading" class="flex items-center justify-center py-20 text-gray-500 dark:text-gray-400">
      <span class="animate-spin mr-2 text-xl">⏳</span> Carregando...
    </div>

    <!-- Tabela vazia -->
    <div v-else-if="!rows.length" class="flex flex-col items-center justify-center py-20 text-gray-400">
      <span class="text-4xl mb-3">📋</span>
      <p class="text-sm">Nenhum ativo no banco.</p>
      <p class="text-xs mt-1">Clique em <strong>Carregar dados</strong> para buscar da brapi.</p>
    </div>

    <!-- Sem resultados no filtro -->
    <div v-else-if="!sorted.length" class="flex flex-col items-center justify-center py-20 text-gray-400">
      <span class="text-4xl mb-3">🔍</span>
      <p class="text-sm">Nenhum ativo encontrado para os filtros aplicados.</p>
    </div>

    <!-- Tabela -->
    <template v-else>
      <div class="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-700">
        <table class="w-full text-sm">
          <thead class="bg-gray-50 dark:bg-gray-800 text-gray-600 dark:text-gray-300">
            <tr>
              <!-- Ticker — coluna congelada -->
              <th
                @click="setSort('ticker')"
                class="sticky left-0 z-10 px-4 py-3 text-left font-semibold cursor-pointer select-none
                       bg-gray-50 dark:bg-gray-800
                       hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors
                       after:absolute after:inset-y-0 after:right-0 after:w-px after:bg-gray-200 after:dark:bg-gray-700"
              >
                Ticker <span class="ml-1 text-xs opacity-60">{{ sortIcon("ticker") }}</span>
              </th>

              <!-- Nome -->
              <th
                @click="setSort('name')"
                class="px-4 py-3 text-left font-semibold cursor-pointer select-none
                       hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              >
                Nome <span class="ml-1 text-xs opacity-60">{{ sortIcon("name") }}</span>
              </th>

              <!-- Setor -->
              <th
                @click="setSort('sectorPt')"
                class="px-4 py-3 text-left font-semibold cursor-pointer select-none
                       hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              >
                Setor <span class="ml-1 text-xs opacity-60">{{ sortIcon("sectorPt") }}</span>
              </th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-100 dark:divide-gray-800">
            <tr
              v-for="row in paginated"
              :key="row.id"
              class="group bg-white dark:bg-gray-900 hover:bg-gray-50 dark:hover:bg-gray-800/60 transition-colors"
            >
              <!-- Ticker — congelado -->
              <td
                class="sticky left-0 z-10 px-4 py-3 font-mono font-semibold
                       text-indigo-700 dark:text-indigo-400
                       bg-white dark:bg-gray-900
                       group-hover:bg-gray-50 dark:group-hover:bg-gray-800/60
                       after:absolute after:inset-y-0 after:right-0 after:w-px after:bg-gray-200 after:dark:bg-gray-700"
              >
                {{ row.ticker }}
              </td>

              <td class="px-4 py-3 text-gray-800 dark:text-gray-200 max-w-[320px] truncate">
                {{ row.name }}
              </td>

              <td class="px-4 py-3">
                <span class="inline-block px-2 py-0.5 rounded-full text-xs font-medium
                             bg-indigo-50 dark:bg-indigo-900/40
                             text-indigo-700 dark:text-indigo-300">
                  {{ row.sectorPt }}
                </span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Paginação -->
      <div class="mt-4">
        <Pagination
          :total-items="sorted.length"
          :page-size="pageSize"
          :current-page="currentPage"
          :page-size-options="PAGE_SIZE_OPTIONS"
          @update:page-size="pageSize = $event"
          @update:current-page="currentPage = $event"
        />
      </div>
    </template>
  </div>
</template>
