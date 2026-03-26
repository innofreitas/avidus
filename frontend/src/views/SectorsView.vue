<script setup lang="ts">
import { ref, computed, watch, onMounted } from "vue";
import Swal from "sweetalert2";
import api from "@/utils/api";
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

interface Sector {
  sectorEn: string;
  sectorPt: string;
}

interface Toast {
  type: "success" | "error" | "info";
  text: string;
}

// ─── Estado ───────────────────────────────────────────────────

const rows      = ref<Sector[]>([]);
const loading   = ref(false);
const error     = ref<string | null>(null);
const filter    = ref("");
const sortField = ref<"sectorEn" | "sectorPt">("sectorEn");
const sortDir   = ref<"asc" | "desc">("asc");

// Paginação
const PAGE_SIZE_OPTIONS = [15, 50, 100] as const;
const pageSize    = ref<number>(15);
const currentPage = ref(1);

// Edição inline
const editingId   = ref<string | null>(null);
const editValues  = ref<Record<string, string>>({});

// Toast
const toast = ref<Toast | null>(null);
let toastTimer: ReturnType<typeof setTimeout> | null = null;

function showToast(type: Toast["type"], text: string) {
  if (toastTimer) clearTimeout(toastTimer);
  toast.value = { type, text };
  toastTimer = setTimeout(() => { toast.value = null; }, 4000);
}

function dismissToast() {
  if (toastTimer) clearTimeout(toastTimer);
  toast.value = null;
}

// ─── Fetch ────────────────────────────────────────────────────

async function load() {
  loading.value = true;
  error.value   = null;
  editingId.value = null;
  try {
    const res = await api.get<{ success: boolean; data: Sector[] }>("/stocks/sectors");
    rows.value = res.data.data ?? [];
  } catch (e: any) {
    error.value = e?.message ?? "Erro ao carregar setores";
  } finally {
    loading.value = false;
  }
}

onMounted(load);

// ─── Filtragem + ordenação ────────────────────────────────────

watch([filter, sortField, sortDir, pageSize], () => {
  currentPage.value = 1;
});

const filtered = computed(() => {
  const q = filter.value.trim().toUpperCase();
  return rows.value.filter(r => {
    const matchEn = r.sectorEn.toUpperCase().includes(q);
    const matchPt = r.sectorPt.toUpperCase().includes(q);
    return matchEn || matchPt;
  });
});

const sorted = computed(() =>
  [...filtered.value].sort((a, b) => {
    const va = String(a[sortField.value] ?? "");
    const vb = String(b[sortField.value] ?? "");
    return sortDir.value === "asc" ? va.localeCompare(vb, "pt-BR") : vb.localeCompare(va, "pt-BR");
  })
);

const paginated = computed(() => {
  const start = (currentPage.value - 1) * pageSize.value;
  return sorted.value.slice(start, start + pageSize.value);
});

function setSort(f: "sectorEn" | "sectorPt") {
  if (sortField.value === f) sortDir.value = sortDir.value === "asc" ? "desc" : "asc";
  else { sortField.value = f; sortDir.value = "asc"; }
}

function sortIcon(f: string) {
  if (sortField.value !== f) return "↕";
  return sortDir.value === "asc" ? "↑" : "↓";
}

// ─── CRUD Inline ──────────────────────────────────────────────

function startEdit(row: Sector) {
  editingId.value = row.sectorEn;
  editValues.value = { ...row };
}

function cancelEdit() {
  editingId.value = null;
  editValues.value = {};
}

async function saveEdit() {
  if (!editingId.value) return;

  const sectorEn = editingId.value;
  const sectorPt = editValues.value.sectorPt?.trim();

  if (!sectorPt) {
    showToast("error", "Tradução obrigatória");
    return;
  }

  try {
    await api.put(`/stocks/sectors/${sectorEn}`, { sectorPt });
    const idx = rows.value.findIndex(r => r.sectorEn === sectorEn);
    if (idx >= 0) {
      rows.value[idx].sectorPt = sectorPt;
    }
    editingId.value = null;
    editValues.value = {};
    showToast("success", "Setor atualizado");
  } catch (e: any) {
    showToast("error", e?.response?.data?.error ?? "Erro ao atualizar");
  }
}

async function createNew() {
  const { value: formValues } = await MySwal.fire({
    title: "Novo Setor",
    html: `
      <input type="text" id="sectorEn" placeholder="Setor em inglês" class="swal2-input" />
      <input type="text" id="sectorPt" placeholder="Setor em português" class="swal2-input" />
    `,
    didOpen: () => {
      (document.getElementById("sectorEn") as HTMLInputElement)?.focus();
    },
    preConfirm: () => {
      const sectorEn = (document.getElementById("sectorEn") as HTMLInputElement)?.value?.trim();
      const sectorPt = (document.getElementById("sectorPt") as HTMLInputElement)?.value?.trim();
      if (!sectorEn || !sectorPt) {
        MySwal.showValidationMessage("Preencha todos os campos");
        return false;
      }
      return { sectorEn, sectorPt };
    },
    confirmButtonText: "✅ Criar",
    cancelButtonText: "Cancelar",
    showCancelButton: true,
  });

  if (!formValues) return;

  try {
    await api.post("/stocks/sectors", formValues);
    rows.value.push(formValues);
    showToast("success", `Setor "${formValues.sectorPt}" criado`);
  } catch (e: any) {
    showToast("error", e?.response?.data?.error ?? "Erro ao criar");
  }
}

async function deleteSector(row: Sector) {
  const { isConfirmed } = await MySwal.fire({
    title: "Remover Setor",
    html: `Deseja remover <strong>${row.sectorPt}</strong> (${row.sectorEn})?`,
    icon: "warning",
    showCancelButton: true,
    confirmButtonText: "🗑️ Remover",
    cancelButtonText: "Cancelar",
  });

  if (!isConfirmed) return;

  try {
    await api.delete(`/stocks/sectors/${row.sectorEn}`);
    rows.value = rows.value.filter(r => r.sectorEn !== row.sectorEn);
    showToast("success", "Setor removido");
  } catch (e: any) {
    showToast("error", e?.response?.data?.error ?? "Erro ao remover");
  }
}
</script>

<template>
  <div class="max-w-6xl mx-auto space-y-5">

    <!-- Header -->
    <div class="flex items-center justify-between">
      <div>
        <h1 class="text-lg font-bold">🏷️ Setores</h1>
        <p class="text-xs text-gray-500 mt-0.5">
          <span class="font-semibold">{{ rows.length }}</span>
          setor{{ rows.length !== 1 ? "es" : "" }}
        </p>
      </div>
      <div class="flex gap-2">
        <button @click="load" :disabled="loading" class="btn-secondary text-sm">
          {{ loading ? "⏳ Carregando..." : "🔄 Atualizar" }}
        </button>
        <button @click="createNew" class="btn-primary text-sm">
          ➕ Novo Setor
        </button>
      </div>
    </div>

    <!-- Toast -->
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
            : toast.type === 'error'
            ? 'bg-red-50 dark:bg-red-900/30 text-red-800 dark:text-red-300 border border-red-200 dark:border-red-800'
            : 'bg-blue-50 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300 border border-blue-200 dark:border-blue-800',
        ]"
      >
        <span class="text-base mt-0.5 flex-shrink-0">
          {{ toast.type === 'success' ? '✅' : toast.type === 'error' ? '❌' : 'ℹ️' }}
        </span>
        <span class="flex-1">{{ toast.text }}</span>
        <button @click="dismissToast" class="ml-2 opacity-60 hover:opacity-100 transition-opacity text-base leading-none">✕</button>
      </div>
    </Transition>

    <!-- Filtro -->
    <div class="card flex items-center gap-3 py-3">
      <input
        v-model="filter"
        placeholder="Filtrar por setor (português ou inglês)..."
        class="input flex-1 text-sm"
      />
      <button v-if="filter" @click="filter = ''" class="btn-secondary text-sm">
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
      <p class="text-sm font-semibold">Nenhum setor encontrado</p>
      <p class="text-xs mt-1">Clique em <strong>Novo Setor</strong> para adicionar</p>
    </div>

    <!-- Tabela -->
    <div v-else class="card p-0 overflow-hidden">
      <table class="w-full text-sm">

        <!-- Cabeçalho -->
        <thead class="bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
          <tr class="text-left">
            <th class="py-3 px-4">
              <button @click="setSort('sectorEn')"
                class="flex items-center gap-1.5 font-semibold text-gray-600 dark:text-gray-300
                       hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors">
                Setor (Inglês) <span class="text-gray-400 text-xs">{{ sortIcon("sectorEn") }}</span>
              </button>
            </th>

            <th class="py-3 px-4">
              <button @click="setSort('sectorPt')"
                class="flex items-center gap-1.5 font-semibold text-gray-600 dark:text-gray-300
                       hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors">
                Setor (Português) <span class="text-gray-400 text-xs">{{ sortIcon("sectorPt") }}</span>
              </button>
            </th>

            <th class="py-3 px-4 text-center font-semibold text-gray-600 dark:text-gray-300 w-24">
              Ações
            </th>
          </tr>
        </thead>

        <tbody>
          <tr
            v-for="row in paginated"
            :key="row.sectorEn"
            :class="[
              'border-b border-gray-100 dark:border-gray-800 transition-colors',
              editingId === row.sectorEn
                ? 'bg-indigo-50 dark:bg-indigo-950/20'
                : 'hover:bg-gray-50 dark:hover:bg-gray-800/40',
            ]"
          >
            <!-- Setor EN -->
            <td class="py-3 px-4">
              <span v-if="editingId !== row.sectorEn" class="font-mono font-medium text-gray-700 dark:text-gray-300">
                {{ row.sectorEn }}
              </span>
              <input
                v-else
                disabled
                :value="editValues.sectorEn"
                class="input text-sm font-mono bg-gray-200 dark:bg-gray-700 cursor-not-allowed w-full"
              />
            </td>

            <!-- Setor PT -->
            <td class="py-3 px-4">
              <span v-if="editingId !== row.sectorEn" class="text-gray-800 dark:text-gray-200">
                {{ row.sectorPt }}
              </span>
              <input
                v-else
                v-model="editValues.sectorPt"
                class="input text-sm w-full"
                @keyup.enter="saveEdit"
                @keyup.escape="cancelEdit"
                autofocus
              />
            </td>

            <!-- Ações -->
            <td class="py-3 px-4">
              <div class="flex items-center justify-center gap-2">
                <!-- Edit / Save / Cancel -->
                <template v-if="editingId === row.sectorEn">
                  <button
                    @click="saveEdit"
                    class="text-xs font-medium px-2.5 py-1.5 rounded-lg border
                           border-emerald-300 dark:border-emerald-700
                           bg-emerald-100 dark:bg-emerald-900/50
                           text-emerald-700 dark:text-emerald-300
                           hover:bg-emerald-200 dark:hover:bg-emerald-900
                           transition-colors"
                  >
                    ✅ Salvar
                  </button>
                  <button
                    @click="cancelEdit"
                    class="text-xs font-medium px-2.5 py-1.5 rounded-lg border
                           border-gray-300 dark:border-gray-600
                           bg-white dark:bg-gray-800
                           text-gray-700 dark:text-gray-300
                           hover:bg-gray-100 dark:hover:bg-gray-700
                           transition-colors"
                  >
                    ✕ Cancelar
                  </button>
                </template>

                <template v-else>
                  <button
                    @click="startEdit(row)"
                    class="text-xs font-medium px-2.5 py-1.5 rounded-lg border
                           border-indigo-300 dark:border-indigo-700
                           bg-indigo-100 dark:bg-indigo-900/50
                           text-indigo-700 dark:text-indigo-300
                           hover:bg-indigo-200 dark:hover:bg-indigo-900
                           transition-colors"
                  >
                    ✏️ Editar
                  </button>

                  <button
                    @click="deleteSector(row)"
                    class="text-xs font-medium px-2.5 py-1.5 rounded-lg border
                           border-red-200 dark:border-red-800
                           text-red-500 dark:text-red-400
                           hover:bg-red-50 dark:hover:bg-red-950/30
                           transition-colors"
                  >
                    🗑️ Deletar
                  </button>
                </template>
              </div>
            </td>
          </tr>
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
