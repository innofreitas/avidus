<script setup lang="ts">
import { ref, computed, onMounted } from "vue";
import api from "@/utils/api";

interface StockItem {
  ticker: string;
  name: string | null;
  sector: string; 
}

const props = defineProps<{
  ticker: string;
  sector: string;
}>();

const emit = defineEmits<{
  compare: [tickers: string[]];
  close: [];
}>();

// Estado
const loading = ref(true);
const error = ref<string | null>(null);
const stocks = ref<StockItem[]>([]);
const selected = ref<Set<string>>(new Set());
const sectorPt = ref("");
const saveAsFavorite = ref(true);
const filterText = ref("");

const MAX_SELECTION = 5;
const canSelectMore = computed(() => selected.value.size < MAX_SELECTION);
const showFilter = computed(() => stocks.value.length > 5);
const filteredStocks = computed(() => {
  if (!filterText.value.trim()) return stocks.value;
  const query = filterText.value.toLowerCase();
  return stocks.value.filter(s =>
    s.ticker.toLowerCase().includes(query) ||
    (s.name?.toLowerCase().includes(query) ?? false)
  );
});

// LocalStorage para favoritos
const FAVORITES_KEY = "avidus_sector_favorites";

function getFavorites(): Record<string, string[]> {
  try {
    const stored = localStorage.getItem(FAVORITES_KEY);
    return stored ? JSON.parse(stored) : {};
  } catch {
    return {};
  }
}

function saveFavorites(sector: string, tickers: string[]) {
  try {
    const favorites = getFavorites();
    favorites[sector] = tickers;
    localStorage.setItem(FAVORITES_KEY, JSON.stringify(favorites));
    console.log(`⭐ Favoritos salvos para ${sector}:`, tickers);
  } catch (e) {
    console.warn("⚠️ Erro ao salvar favoritos:", e);
  }
}

function loadFavorites(sector: string): string[] {
  const favorites = getFavorites();
  return favorites[sector] || [];
}

async function loadStocks() {
  loading.value = true;
  error.value = null;

  try {
    console.log(`🔍 Buscando stocks: setor="${props.sector}", ticker="${props.ticker}"`);
    // Passar o ticker como query param para o backend descobrir o setor correto
    const response = await api.get<{
      success: boolean;
      data: StockItem[];
      sectorPt: string;
      sector: string;
      error?: { message: string };
    }>(`/stocks/by-sector/${encodeURIComponent(props.sector)}?ticker=${encodeURIComponent(props.ticker)}`);

    console.log(`📊 Resposta da API:`, response.data);

    if (!response.data.success) {
      error.value = response.data.error?.message ?? "Erro ao carregar stocks";
      return;
    }

    // Filtrar para excluir o ticker selecionado da lista
    stocks.value = response.data.data.filter(s => s.ticker !== props.ticker);
    sectorPt.value = response.data.sectorPt;

    console.log(`✅ Encontrados ${response.data.data.length} stocks, exibindo ${stocks.value.length} (excluindo ${props.ticker})`);

    // Carregar favoritos salvos para este setor
    const favorites = loadFavorites(props.sector);
    if (favorites.length > 0) {
      selected.value = new Set(favorites);
      console.log(`⭐ Favoritos carregados para ${props.sector}:`, favorites);
    }

    // Se não há stocks (além do selecionado), mostrar aviso
    if (stocks.value.length === 0) {
      error.value = `⚠️ Apenas ${props.ticker} foi encontrado neste setor. Nenhuma comparação disponível.`;
    }
  } catch (e: any) {
    error.value = e?.message ?? "Erro ao carregar stocks";
    console.error("❌ Erro ao carregar stocks:", e);
  } finally {
    loading.value = false;
  }
}

function toggleStock(ticker: string) {
  const newSelected = new Set(selected.value);

  if (newSelected.has(ticker)) {
    // Sempre permitir desselecionar
    newSelected.delete(ticker);
  } else {
    // Permitir selecionar se não atingiu o máximo
    if (newSelected.size < MAX_SELECTION) {
      newSelected.add(ticker);
    }
  }

  selected.value = newSelected;
}

function handleCompare() {
  // Salvar como favoritos se checkbox marcado
  if (saveAsFavorite.value && selected.value.size > 0) {
    saveFavorites(props.sector, Array.from(selected.value).sort());
  }

  // Incluir sempre o ticker selecionado + os selecionados pelo user
  const tickers = [props.ticker, ...Array.from(selected.value)].sort();
  console.log("Comparando tickers:", tickers);
  emit("compare", tickers);
}

onMounted(() => {
  loadStocks();
});
</script>

<template>
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
    <div class="relative max-h-[85vh] w-full max-w-2xl overflow-auto rounded-lg
                bg-white dark:bg-gray-900 shadow-2xl flex flex-col">
      <!-- Header -->
      <div class="sticky top-0 z-10 border-b border-gray-200 dark:border-gray-800
                  bg-white dark:bg-gray-900 px-6 py-4 flex items-center justify-between">
        <div>
          <h1 class="text-2xl font-bold text-gray-900 dark:text-white">
            🔍 Selecionar Ações para Comparação
          </h1>
          <p class="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            Comparando: <span class="font-semibold text-indigo-600 dark:text-indigo-400">{{ ticker }}</span> — Setor: <span class="font-semibold">{{ sectorPt || sector }}</span> — Máx. 5 comparações
          </p>
        </div>
        <button
          @click="emit('close')"
          class="text-2xl text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
        >
          ✕
        </button>
      </div>

      <!-- Conteúdo -->
      <div class="flex-1 overflow-auto">
        <!-- Loading -->
        <div v-if="loading" class="flex flex-col items-center justify-center py-20">
          <span class="text-4xl animate-spin">⏳</span>
          <p class="mt-4 text-gray-500 dark:text-gray-400">Carregando ações do setor...</p>
        </div>

        <!-- Erro -->
        <div v-else-if="error" class="m-6 p-4 rounded-lg bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300">
          ❌ {{ error }}
        </div>

        <!-- Lista de stocks -->
        <div v-else class="space-y-4 p-6">
          <!-- Input de filtro (aparece se houver mais de 5 itens) -->
          <div v-if="showFilter" class="relative">
            <input
              v-model="filterText"
              type="text"
              placeholder="🔍 Filtrar por ticker ou nome..."
              class="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600
                     bg-white dark:bg-gray-800 text-gray-900 dark:text-white
                     placeholder-gray-400 dark:placeholder-gray-500
                     focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:focus:ring-indigo-400"
            />
          </div>

          <!-- Info de seleção -->
          <div class="space-y-2">
            <div class="flex items-center gap-2">
              <span class="text-sm font-semibold text-gray-700 dark:text-gray-300">
                Selecionadas: {{ selected.size }} / {{ MAX_SELECTION }}
              </span>
              <span class="text-xs text-gray-500 dark:text-gray-400">
                (Total: {{ selected.size + 1 }} com {{ ticker }})
              </span>
            </div>
            <div class="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
              <div
                class="h-2 rounded-full bg-indigo-500 transition-all"
                :style="{ width: (selected.size / MAX_SELECTION) * 100 + '%' }"
              />
            </div>
          </div>

          <!-- Tickers selecionados (badges) -->
          <div v-if="selected.size > 0" class="flex flex-wrap gap-2">
            <span
              v-for="ticker in Array.from(selected).sort()"
              :key="ticker"
              class="inline-flex items-center gap-1 px-3 py-1 rounded-full
                     bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300
                     text-xs font-medium"
            >
              ✓ {{ ticker }}
              <button
                @click="toggleStock(ticker)"
                class="ml-1 text-indigo-500 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300"
              >
                ✕
              </button>
            </span>
          </div>

          <!-- Mensagem quando filtro não retorna resultados -->
          <div v-if="showFilter && filteredStocks.length === 0" class="text-center py-8 text-gray-500 dark:text-gray-400">
            <p class="text-sm">❌ Nenhuma ação encontrada para "<strong>{{ filterText }}</strong>"</p>
          </div>

          <!-- Lista de checkboxes -->
          <div v-if="!canSelectMore && filteredStocks.length > 0" class="p-3 rounded-lg bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-300 text-xs">
            ℹ️ Limite de 5 seleções atingido. Desselecione uma ação para adicionar outra.
          </div>
          <div v-if="filteredStocks.length > 0" class="space-y-2 max-h-[50vh] overflow-y-auto">
            <label
              v-for="stock in filteredStocks"
              :key="stock.ticker"
              :class="[
                'flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-colors',
                selected.has(stock.ticker)
                  ? 'bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800'
                  : 'bg-gray-50 dark:bg-gray-800/40 border border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800/60'
              ]"
            >
              <input
                type="checkbox"
                :checked="selected.has(stock.ticker)"
                :disabled="!selected.has(stock.ticker) && !canSelectMore"
                @change="toggleStock(stock.ticker)"
                class="w-4 h-4 rounded cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              />
              <div class="flex-1 min-w-0">
                <div class="font-semibold text-gray-900 dark:text-white">
                  {{ stock.ticker }}
                </div>
                <div class="text-sm text-gray-500 dark:text-gray-400 truncate">
                  {{ stock.name || "—" }}
                </div>
              </div>
            </label>
          </div>
        </div>
      </div>

      <!-- Footer com checkbox e botões -->
      <div class="sticky bottom-0 border-t border-gray-200 dark:border-gray-800
                  bg-gray-50 dark:bg-gray-800/50 px-6 py-4 flex gap-3 items-center">
        <!-- Checkbox de favoritos (só aparece se há seleções) -->
        <label v-if="selected.size > 0" class="flex items-center gap-2 cursor-pointer whitespace-nowrap">
          <input
            v-model="saveAsFavorite"
            type="checkbox"
            class="w-4 h-4 rounded"
          />
          <span class="text-sm text-gray-600 dark:text-gray-300">
            ⭐ Guardar como favorito
          </span>
        </label>

        <!-- Espaço flexível -->
        <div class="flex-1"></div>

        <!-- Botões -->
        <div class="flex gap-3 justify-end">
        <button
          @click="emit('close')"
          class="px-4 py-2 rounded-lg text-sm font-medium
                 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300
                 border border-gray-300 dark:border-gray-600
                 hover:bg-gray-50 dark:hover:bg-gray-600
                 transition-colors"
        >
          Cancelar
        </button>
          <button
            @click="handleCompare"
            :disabled="loading"
            class="px-6 py-2 rounded-lg text-sm font-medium
                   bg-indigo-600 hover:bg-indigo-700 text-white
                   disabled:opacity-50 disabled:cursor-not-allowed
                   transition-colors"
          >
            ⚖️ Comparar ({{ selected.size + 1 }})
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
