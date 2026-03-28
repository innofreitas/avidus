<script setup lang="ts">
import { ref, computed, watch } from "vue";
import { useAuthStore, type InvestorProfileName } from "@/auth/stores/authStore";

const emit = defineEmits<{ (e: "done"): void }>();

const authStore = useAuthStore();

// ─── Modo ─────────────────────────────────────────────────────
type Mode = "intro" | "quest" | "result" | "choice";
const mode = ref<Mode>("intro");

// ─── Tipos do questionário ────────────────────────────────────

interface Option   { label: string; points: number }
interface Question {
  id: number;
  dimension: string;
  text: string;
  hint?: string;          // instrução extra (ex: "Selecione todas que se aplicam")
  multiSelect?: boolean;  // se true → checkboxes + score = max dos selecionados
  options: Option[];
}

// ─── Perguntas ────────────────────────────────────────────────

const QUESTIONS: Question[] = [
  // Tolerância Psicológica (1–7)
  {
    id: 1, dimension: "Tolerância Psicológica",
    text: "Com quais tipos de investimento você já tem experiência?",
    hint: "Selecione todos que se aplicam",
    multiSelect: true,
    options: [
      { label: "Nenhuma — ainda não invisto",                    points: 0 },
      { label: "Poupança / CDB / Tesouro Direto (renda fixa)",  points: 1 },
      { label: "Fundos de investimento (DI, multimercado...)",   points: 2 },
      { label: "FIIs (Fundos de Investimento Imobiliário)",      points: 3 },
      { label: "Ações (mercado à vista)",                        points: 4 },
      { label: "ETFs / BDRs",                                    points: 4 },
      { label: "Derivativos (opções, futuros)",                  points: 5 },
      { label: "Criptomoedas",                                   points: 4 },
    ],
  },
  {
    id: 2, dimension: "Tolerância Psicológica",
    text: "Como você reagiria se seu investimento caísse 10%?",
    options: [
      { label: "Resgataria imediatamente", points: 0 },
      { label: "Ficaria muito preocupado", points: 1 },
      { label: "Aguardaria recuperação",   points: 3 },
      { label: "Compraria mais",           points: 5 },
    ],
  },
  {
    id: 3, dimension: "Tolerância Psicológica",
    text: "Se sua carteira caísse 20% em um ano, você:",
    options: [
      { label: "Venderia tudo",       points: 0 },
      { label: "Reduziria exposição", points: 2 },
      { label: "Manteria posição",    points: 4 },
      { label: "Investiria mais",     points: 5 },
    ],
  },
  {
    id: 4, dimension: "Tolerância Psicológica",
    text: "Qual frase melhor descreve seu comportamento como investidor?",
    options: [
      { label: "Prefiro não correr riscos",            points: 0 },
      { label: "Aceito pouco risco",                   points: 2 },
      { label: "Aceito risco moderado",                points: 4 },
      { label: "Busco alto retorno mesmo com risco",   points: 5 },
    ],
  },
  {
    id: 5, dimension: "Tolerância Psicológica",
    text: "Qual volatilidade você tolera?",
    options: [
      { label: "Quase nenhuma", points: 0 },
      { label: "Baixa",         points: 2 },
      { label: "Moderada",      points: 4 },
      { label: "Alta",          points: 5 },
    ],
  },
  {
    id: 6, dimension: "Tolerância Psicológica",
    text: "Você já passou por ciclos de mercado (crises)?",
    options: [
      { label: "Nunca investi",       points: 0 },
      { label: "Não",                 points: 1 },
      { label: "Sim, parcialmente",   points: 3 },
      { label: "Sim, várias vezes",   points: 5 },
    ],
  },
  {
    id: 7, dimension: "Tolerância Psicológica",
    text: "Seu conhecimento sobre investimentos é:",
    options: [
      { label: "Básico",          points: 1 },
      { label: "Intermediário",   points: 3 },
      { label: "Avançado",        points: 5 },
    ],
  },
  // Capacidade Financeira (8–13)
  {
    id: 8, dimension: "Capacidade Financeira",
    text: "Qual percentual da sua renda mensal é investido?",
    options: [
      { label: "Menos de 5%",  points: 0 },
      { label: "5–10%",        points: 2 },
      { label: "10–20%",       points: 4 },
      { label: "Mais de 20%",  points: 5 },
    ],
  },
  {
    id: 9, dimension: "Capacidade Financeira",
    text: "Quantos meses de reserva de emergência você possui?",
    options: [
      { label: "Nenhuma",         points: 0 },
      { label: "Até 3 meses",     points: 2 },
      { label: "3–6 meses",       points: 4 },
      { label: "Mais de 6 meses", points: 5 },
    ],
  },
  {
    id: 10, dimension: "Capacidade Financeira",
    text: "Sua renda principal depende desses investimentos?",
    options: [
      { label: "Sim",          points: 0 },
      { label: "Parcialmente", points: 2 },
      { label: "Não",          points: 5 },
    ],
  },
  {
    id: 11, dimension: "Capacidade Financeira",
    text: "Qual sua estabilidade de renda?",
    options: [
      { label: "Instável",  points: 0 },
      { label: "Moderada",  points: 3 },
      { label: "Estável",   points: 5 },
    ],
  },
  {
    id: 12, dimension: "Capacidade Financeira",
    text: "Quanto do seu patrimônio está investido?",
    options: [
      { label: "Mais de 80%",  points: 0 },
      { label: "50–80%",       points: 2 },
      { label: "20–50%",       points: 4 },
      { label: "Menos de 20%", points: 5 },
    ],
  },
  {
    id: 13, dimension: "Capacidade Financeira",
    text: "Caso perca 20% do capital investido:",
    options: [
      { label: "Afetaria seriamente minha vida", points: 0 },
      { label: "Afetaria parcialmente",          points: 2 },
      { label: "Teria impacto limitado",         points: 4 },
      { label: "Não afetaria",                   points: 5 },
    ],
  },
  // Horizonte e Objetivos (14–18)
  {
    id: 14, dimension: "Horizonte e Objetivos",
    text: "Qual o prazo médio dos seus investimentos?",
    options: [
      { label: "Menos de 1 ano", points: 0 },
      { label: "1–3 anos",       points: 2 },
      { label: "3–5 anos",       points: 4 },
      { label: "Mais de 5 anos", points: 5 },
    ],
  },
  {
    id: 15, dimension: "Horizonte e Objetivos",
    text: "Seus principais objetivos são:",
    hint: "Selecione todos que se aplicam",
    multiSelect: true,
    options: [
      { label: "Preservar capital",        points: 0 },
      { label: "Gerar renda",              points: 2 },
      { label: "Crescimento moderado",     points: 4 },
      { label: "Crescimento agressivo",    points: 5 },
    ],
  },
  {
    id: 16, dimension: "Horizonte e Objetivos",
    text: "Você pretende fazer aportes regulares?",
    options: [
      { label: "Não",               points: 0 },
      { label: "Ocasionalmente",    points: 2 },
      { label: "Sim, regularmente", points: 5 },
    ],
  },
  {
    id: 17, dimension: "Horizonte e Objetivos",
    text: "Como você diversifica seus investimentos?",
    options: [
      { label: "Não diversifico",           points: 0 },
      { label: "Pouco",                     points: 2 },
      { label: "Diversificação moderada",   points: 4 },
      { label: "Forte diversificação",      points: 5 },
    ],
  },
  {
    id: 18, dimension: "Horizonte e Objetivos",
    text: "Qual classe de ativos você prefere?",
    options: [
      { label: "Poupança / Tesouro Selic", points: 0 },
      { label: "Renda fixa",              points: 2 },
      { label: "Fundos / FIIs",           points: 4 },
      { label: "Ações / ETFs / Cripto",   points: 5 },
    ],
  },
];

const TOTAL = QUESTIONS.length;

// ─── Estado das respostas ─────────────────────────────────────

const currentStep = ref(0);
// answers[i]: pontuação final de cada pergunta (null = não respondida)
const answers = ref<(number | null)[]>(Array(TOTAL).fill(null));
// Para perguntas multi-select: índices das opções selecionadas por pergunta
const multiSelections = ref<Record<number, Set<number>>>({});

const currentQ   = computed(() => QUESTIONS[currentStep.value]);
const currentAns = computed(() => answers.value[currentStep.value]);
const progress   = computed(() => (currentStep.value / TOTAL) * 100);

// Pontuação total considerando respostas de todas as perguntas
const totalScore = computed(() =>
  answers.value.reduce<number>((sum, v) => sum + (v ?? 0), 0)
);

// Conjunto de índices selecionados para a pergunta multi-select atual
const currentMultiSet = computed(() =>
  multiSelections.value[currentStep.value] ?? new Set<number>()
);

// A pergunta atual está respondida?
const currentAnswered = computed(() => {
  if (currentQ.value.multiSelect) return currentMultiSet.value.size > 0;
  return currentAns.value !== null;
});

// ─── Auto-fill Q17 e Q18 a partir de Q1 ──────────────────────

// Passos (0-based) que foram pré-preenchidos automaticamente
const autoFilled = ref<Set<number>>(new Set());

// Q1 = índice 0; Q17 = índice 16; Q18 = índice 17
function autoQ17(): number {
  const q1Indices = multiSelections.value[0] ?? new Set<number>();
  const nonNone   = [...q1Indices].filter(i => i !== 0).length;
  if (nonNone === 0) return 0;   // Não diversifico
  if (nonNone === 1) return 2;   // Pouco
  if (nonNone <= 3)  return 4;   // Diversificação moderada
  return 5;                      // Forte diversificação
}

function autoQ18(): number {
  const maxPts = answers.value[0] ?? 0;
  if (maxPts <= 0) return 0;   // Poupança / Tesouro Selic
  if (maxPts <= 1) return 2;   // Renda fixa
  if (maxPts <= 3) return 4;   // Fundos / FIIs
  return 5;                    // Ações / ETFs / Cripto
}

watch(currentStep, (step) => {
  if (step === 16 && answers.value[16] === null) {
    answers.value[16] = autoQ17();
    autoFilled.value  = new Set([...autoFilled.value, 16]);
  }
  if (step === 17 && answers.value[17] === null) {
    answers.value[17] = autoQ18();
    autoFilled.value  = new Set([...autoFilled.value, 17]);
  }
});

// ─── Lógica multi-select ──────────────────────────────────────

const NONE_IDX = 0; // índice da opção "Nenhuma" na Q1

function toggleMultiOption(optIdx: number) {
  const step = currentStep.value;
  const prev = new Set(multiSelections.value[step] ?? []);

  if (optIdx === NONE_IDX) {
    // "Nenhuma" → limpa tudo e seleciona só ela
    prev.clear();
    prev.add(NONE_IDX);
  } else {
    // Qualquer outra → desmarca "Nenhuma" se estiver selecionada
    prev.delete(NONE_IDX);
    if (prev.has(optIdx)) {
      prev.delete(optIdx);
    } else {
      prev.add(optIdx);
    }
  }

  multiSelections.value = { ...multiSelections.value, [step]: prev };

  // Calcula pontuação: max dos pontos das opções selecionadas
  if (prev.size === 0) {
    answers.value[step] = null;
  } else {
    const pts = [...prev].map(i => currentQ.value.options[i].points);
    answers.value[step] = Math.max(...pts);
  }
}

// ─── Lógica single-select ─────────────────────────────────────

function selectOption(points: number) {
  answers.value[currentStep.value] = points;
  // Avança automaticamente nas perguntas single-select (exceto a última)
  if (currentStep.value < TOTAL - 1) {
    setTimeout(() => { currentStep.value++; }, 220);
  }
}

function goBack()    { if (currentStep.value > 0) currentStep.value--; }
function goForward() { if (currentStep.value < TOTAL - 1) currentStep.value++; }

// ─── Classificação ────────────────────────────────────────────

function calcProfile(score: number): InvestorProfileName {
  if (score <= 30) return "CONSERVADOR";
  if (score <= 60) return "MODERADO";
  return "AGRESSIVO";
}

const questResult = computed<InvestorProfileName>(() => calcProfile(totalScore.value));

// ─── Escolha direta ───────────────────────────────────────────

const PROFILES: { name: InvestorProfileName; label: string; desc: string; icon: string; color: string }[] = [
  {
    name: "CONSERVADOR", label: "Conservador", icon: "🛡️",
    color: "border-blue-400 dark:border-blue-500",
    desc: "Prioriza preservar o capital. Prefere renda fixa e baixa volatilidade. Dorme tranquilo mesmo com retornos menores.",
  },
  {
    name: "MODERADO", label: "Moderado", icon: "⚖️",
    color: "border-indigo-400 dark:border-indigo-500",
    desc: "Equilíbrio entre segurança e crescimento. Aceita alguma oscilação em busca de retornos melhores no médio prazo.",
  },
  {
    name: "AGRESSIVO", label: "Agressivo", icon: "🚀",
    color: "border-emerald-400 dark:border-emerald-500",
    desc: "Busca maximizar retornos. Tolera alta volatilidade e perdas temporárias com foco no longo prazo.",
  },
];

const chosenProfile = ref<InvestorProfileName | null>(null);

// ─── Salvar ───────────────────────────────────────────────────

const saving   = ref(false);
const saveError = ref<string | null>(null);

async function confirmQuest() {
  saving.value    = true;
  saveError.value = null;
  try {
    await authStore.saveInvestorProfile(questResult.value, "quest", totalScore.value);
    emit("done");
  } catch (e: any) {
    saveError.value = e?.message ?? "Erro ao salvar perfil";
  } finally {
    saving.value = false;
  }
}

async function confirmChoice() {
  if (!chosenProfile.value) return;
  saving.value    = true;
  saveError.value = null;
  try {
    await authStore.saveInvestorProfile(chosenProfile.value, "choice");
    emit("done");
  } catch (e: any) {
    saveError.value = e?.message ?? "Erro ao salvar perfil";
  } finally {
    saving.value = false;
  }
}

// ─── Metadados de exibição do resultado ──────────────────────

const PROFILE_META: Record<InvestorProfileName, { label: string; icon: string; desc: string; bg: string; text: string }> = {
  CONSERVADOR: { label: "Conservador", icon: "🛡️", bg: "bg-blue-50 dark:bg-blue-950/40",     text: "text-blue-700 dark:text-blue-300",     desc: "Você prioriza segurança e preservação de capital." },
  MODERADO:    { label: "Moderado",    icon: "⚖️", bg: "bg-indigo-50 dark:bg-indigo-950/40",  text: "text-indigo-700 dark:text-indigo-300",  desc: "Você busca equilíbrio entre segurança e crescimento." },
  AGRESSIVO:   { label: "Agressivo",  icon: "🚀", bg: "bg-emerald-50 dark:bg-emerald-950/40", text: "text-emerald-700 dark:text-emerald-300", desc: "Você tolera riscos em busca de retornos maiores." },
};
</script>

<template>
  <!-- Overlay bloqueante -->
  <div class="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">

    <div class="w-full max-w-lg bg-white dark:bg-gray-900 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">

      <!-- ══════════════════ INTRO ══════════════════ -->
      <template v-if="mode === 'intro'">
        <div class="p-8 text-center space-y-4">
          <div class="text-5xl">📊</div>
          <h2 class="text-xl font-bold">Defina seu perfil de investidor</h2>
          <p class="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">
            Para personalizar sua experiência na plataforma, precisamos conhecer
            seu perfil de risco. Isso leva menos de 3 minutos.
          </p>
          <div class="grid grid-cols-2 gap-3 pt-2">
            <button @click="mode = 'quest'"
              class="btn-primary flex flex-col items-center gap-1 py-4 text-sm">
              <span class="text-2xl">📋</span>
              <span class="font-semibold">Responder questionário</span>
              <span class="text-xs opacity-75">18 perguntas · ~3 min</span>
            </button>
            <button @click="mode = 'choice'"
              class="flex flex-col items-center gap-1 py-4 px-3 rounded-xl text-sm border-2
                     border-gray-200 dark:border-gray-700 hover:border-indigo-400
                     dark:hover:border-indigo-500 transition-colors">
              <span class="text-2xl">🎯</span>
              <span class="font-semibold">Escolher diretamente</span>
              <span class="text-xs text-gray-400">Já sei meu perfil</span>
            </button>
          </div>
        </div>
      </template>

      <!-- ══════════════════ QUESTIONÁRIO ══════════════════ -->
      <template v-else-if="mode === 'quest'">

        <!-- Barra de progresso -->
        <div class="h-1.5 bg-gray-100 dark:bg-gray-800 flex-shrink-0">
          <div class="h-full bg-indigo-500 transition-all duration-300 ease-out rounded-r-full"
               :style="{ width: progress + '%' }" />
        </div>

        <div class="p-6 flex flex-col gap-4 overflow-y-auto">

          <!-- Cabeçalho -->
          <div class="flex items-center justify-between flex-shrink-0">
            <span class="text-xs font-semibold uppercase tracking-widest text-indigo-500">
              {{ currentQ.dimension }}
            </span>
            <span class="text-xs text-gray-400">{{ currentStep + 1 }} / {{ TOTAL }}</span>
          </div>

          <!-- Pergunta -->
          <div class="flex-shrink-0">
            <h3 class="text-base font-semibold leading-snug">{{ currentQ.text }}</h3>
            <p v-if="currentQ.hint" class="text-xs text-indigo-500 mt-1">
              ☑ {{ currentQ.hint }}
            </p>
          </div>

          <!-- Banner de auto-preenchimento -->
          <div v-if="autoFilled.has(currentStep)"
            class="flex items-center gap-2 text-xs text-amber-700 dark:text-amber-300
                   bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800
                   rounded-lg px-3 py-2">
            <span>✨</span>
            <span>Preenchido com base na sua resposta anterior — ajuste se necessário.</span>
          </div>

          <!-- ── Opções MULTI-SELECT (checkboxes) ── -->
          <div v-if="currentQ.multiSelect" class="space-y-2">
            <button v-for="(opt, idx) in currentQ.options" :key="idx"
              @click="toggleMultiOption(idx)"
              :class="[
                'w-full text-left px-4 py-3 rounded-xl border-2 text-sm transition-all duration-150 flex items-center gap-3',
                currentMultiSet.has(idx)
                  ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300 font-semibold'
                  : 'border-gray-200 dark:border-gray-700 hover:border-indigo-300 dark:hover:border-indigo-700',
              ]">
              <!-- Checkbox visual -->
              <span :class="[
                'w-4 h-4 flex-shrink-0 rounded border-2 flex items-center justify-center transition-colors',
                currentMultiSet.has(idx)
                  ? 'border-indigo-500 bg-indigo-500'
                  : 'border-gray-300 dark:border-gray-600',
              ]">
                <svg v-if="currentMultiSet.has(idx)" class="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7"/>
                </svg>
              </span>
              {{ opt.label }}
            </button>
          </div>

          <!-- ── Opções SINGLE-SELECT (radio) ── -->
          <div v-else class="space-y-2">
            <button v-for="opt in currentQ.options" :key="opt.points"
              @click="selectOption(opt.points)"
              :class="[
                'w-full text-left px-4 py-3 rounded-xl border-2 text-sm transition-all duration-150',
                currentAns === opt.points
                  ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300 font-semibold'
                  : 'border-gray-200 dark:border-gray-700 hover:border-indigo-300 dark:hover:border-indigo-700',
              ]">
              {{ opt.label }}
            </button>
          </div>

          <!-- Navegação -->
          <div class="flex items-center justify-between pt-1 flex-shrink-0">
            <button @click="goBack" :disabled="currentStep === 0"
              class="text-sm text-gray-500 hover:text-gray-800 dark:hover:text-gray-200
                     disabled:opacity-30 disabled:cursor-not-allowed">
              ← Voltar
            </button>

            <div class="flex gap-2">
              <button v-if="currentStep === TOTAL - 1 && currentAnswered"
                @click="mode = 'result'"
                class="btn-primary text-sm px-5 py-2">
                Ver resultado →
              </button>
              <button v-else-if="currentStep < TOTAL - 1 && currentAnswered"
                @click="goForward"
                class="text-sm text-indigo-600 dark:text-indigo-400 hover:underline">
                Avançar →
              </button>
            </div>
          </div>

        </div>
      </template>

      <!-- ══════════════════ RESULTADO ══════════════════ -->
      <template v-else-if="mode === 'result'">
        <div class="p-8 flex flex-col items-center gap-5 text-center overflow-y-auto">

          <div :class="['w-full rounded-xl p-5', PROFILE_META[questResult].bg]">
            <div class="text-4xl mb-2">{{ PROFILE_META[questResult].icon }}</div>
            <p class="text-xs uppercase tracking-widest font-semibold text-gray-500 mb-1">
              Seu perfil de investidor
            </p>
            <h2 :class="['text-2xl font-black', PROFILE_META[questResult].text]">
              {{ PROFILE_META[questResult].label }}
            </h2>
            <p class="text-sm text-gray-600 dark:text-gray-400 mt-2">
              {{ PROFILE_META[questResult].desc }}
            </p>
            <p class="text-xs text-gray-400 mt-3">
              Pontuação: <strong>{{ totalScore }} / 90</strong>
            </p>
          </div>

          <p class="text-xs text-gray-400">
            Você pode alterar seu perfil a qualquer momento nas configurações de conta.
          </p>

          <div v-if="saveError" class="text-sm text-red-600 dark:text-red-400">{{ saveError }}</div>

          <div class="flex gap-3 w-full">
            <button @click="mode = 'quest'; currentStep = 0"
              class="flex-1 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-xl
                     hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
              Refazer
            </button>
            <button @click="confirmQuest" :disabled="saving"
              class="flex-1 btn-primary text-sm py-2">
              {{ saving ? "Salvando..." : "Confirmar perfil" }}
            </button>
          </div>
        </div>
      </template>

      <!-- ══════════════════ ESCOLHA DIRETA ══════════════════ -->
      <template v-else-if="mode === 'choice'">
        <div class="p-6 flex flex-col gap-5 overflow-y-auto">
          <div class="text-center space-y-1">
            <h2 class="text-lg font-bold">Escolha seu perfil</h2>
            <p class="text-xs text-gray-400">Selecione o perfil que melhor representa você</p>
          </div>

          <div class="space-y-3">
            <button v-for="p in PROFILES" :key="p.name"
              @click="chosenProfile = p.name"
              :class="[
                'w-full text-left p-4 rounded-xl border-2 transition-all duration-150',
                chosenProfile === p.name
                  ? p.color + ' bg-gray-50 dark:bg-gray-800/60'
                  : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600',
              ]">
              <div class="flex items-center gap-3">
                <span class="text-2xl">{{ p.icon }}</span>
                <div class="flex-1">
                  <p class="font-semibold text-sm">{{ p.label }}</p>
                  <p class="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{{ p.desc }}</p>
                </div>
                <div :class="[
                  'w-4 h-4 rounded-full border-2 flex-shrink-0 transition-colors',
                  chosenProfile === p.name
                    ? 'border-indigo-500 bg-indigo-500'
                    : 'border-gray-300 dark:border-gray-600',
                ]" />
              </div>
            </button>
          </div>

          <div v-if="saveError" class="text-sm text-red-600 dark:text-red-400 text-center">{{ saveError }}</div>

          <div class="flex gap-3">
            <button @click="mode = 'intro'"
              class="flex-1 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-xl
                     hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
              ← Voltar
            </button>
            <button @click="confirmChoice" :disabled="!chosenProfile || saving"
              class="flex-1 btn-primary text-sm py-2 disabled:opacity-50 disabled:cursor-not-allowed">
              {{ saving ? "Salvando..." : "Confirmar" }}
            </button>
          </div>
        </div>
      </template>

    </div>
  </div>
</template>
