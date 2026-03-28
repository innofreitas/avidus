import { defineStore } from "pinia";
import { ref } from "vue";
import api from "@/shared/utils/api";

// Espelha os tipos de linha do PortfolioView
export interface StockRow   { ticker: string; name: string; quantity: number | null; closePrice: number | null; updatedValue: number | null }
export interface EtfRow     { ticker: string; name: string; quantity: number | null; closePrice: number | null; updatedValue: number | null }
export interface FundRow    { ticker: string; name: string; quantity: number | null; closePrice: number | null; updatedValue: number | null }
export interface FixedIncomeRow { name: string; quantity: number | null; issuanceDate: string | null; maturityDate: string | null; currentPrice: number | null; updatedValue: number | null }
export interface TreasuryRow    { name: string; indexer: string | null; maturityDate: string | null; quantity: number | null; investedValue: number | null; grossValue: number | null; netValue: number | null; updatedValue: number | null }

export interface PortfolioData {
  stocks:       StockRow[];
  etfs:         EtfRow[];
  funds:        FundRow[];
  fixedIncomes: FixedIncomeRow[];
  treasury:     TreasuryRow[];
}

export const useUserPortfolioStore = defineStore("userPortfolio", () => {
  const data    = ref<PortfolioData | null>(null);
  const loading = ref(false);
  const saving  = ref(false);
  const error   = ref<string | null>(null);

  const hasData = () =>
    !!data.value && (
      data.value.stocks.length > 0 || data.value.etfs.length > 0 ||
      data.value.funds.length > 0  || data.value.fixedIncomes.length > 0 ||
      data.value.treasury.length > 0
    );

  async function fetch() {
    loading.value = true;
    error.value   = null;
    try {
      const res = await api.get<{ success: boolean; data: PortfolioData }>("/user/portfolio");
      data.value = res.data.data ?? null;
    } catch (e: any) {
      error.value = e?.response?.data?.message ?? e.message;
    } finally {
      loading.value = false;
    }
  }

  async function save(payload: PortfolioData) {
    saving.value = true;
    error.value  = null;
    try {
      await api.put("/user/portfolio", payload);
      data.value = payload;
    } catch (e: any) {
      error.value = e?.response?.data?.message ?? e.message;
      throw e;
    } finally {
      saving.value = false;
    }
  }

  return { data, loading, saving, error, hasData, fetch, save };
});
