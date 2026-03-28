import { defineStore } from "pinia";
import { ref, computed } from "vue";
import api from "@/shared/utils/api";

// ─── Tipos ────────────────────────────────────────────────────

export type UserRole             = "USER" | "ADMIN";
export type InvestorProfileName  = "CONSERVADOR" | "MODERADO" | "AGRESSIVO";
export type InvestorProfileChoice = "quest" | "choice";

export interface AuthUser {
  id:                    string;
  email:                 string;
  name:                  string | null;
  role:                  UserRole;
  investorProfile:       InvestorProfileName | null;
  investorProfileChoice: InvestorProfileChoice | null;
  investorProfileScore:  number | null;
  createdAt:             string;
}

// ─── Store ────────────────────────────────────────────────────

export const useAuthStore = defineStore("auth", () => {
  const token   = ref<string | null>(localStorage.getItem("auth_token"));
  const user    = ref<AuthUser | null>(JSON.parse(localStorage.getItem("auth_user") ?? "null"));
  const loading = ref(false);
  const error   = ref<string | null>(null);

  const isAuthenticated  = computed(() => !!token.value);
  const isAdmin          = computed(() => user.value?.role === "ADMIN");
  const userName         = computed(() => user.value?.name ?? user.value?.email ?? "");
  // Perfil definido = tem investorProfile. Admin está sempre isento.
  const needsProfile     = computed(() =>
    isAuthenticated.value && !isAdmin.value && !user.value?.investorProfile
  );

  // ─── Persistir no localStorage ─────────────────────────────

  function persist() {
    if (token.value) {
      localStorage.setItem("auth_token", token.value);
      localStorage.setItem("auth_user",  JSON.stringify(user.value));
    } else {
      localStorage.removeItem("auth_token");
      localStorage.removeItem("auth_user");
    }
  }

  // ─── Login ─────────────────────────────────────────────────

  async function login(email: string, password: string) {
    loading.value = true;
    error.value   = null;
    try {
      const res = await api.post<{ success: boolean; data: { token: string; user: AuthUser } }>(
        "/auth/login", { email, password }
      );
      token.value = res.data.data.token;
      user.value  = res.data.data.user;
      persist();
    } catch (e: any) {
      error.value = e?.message ?? "Erro ao fazer login";
      throw e;
    } finally {
      loading.value = false;
    }
  }

  // ─── Register ──────────────────────────────────────────────

  async function register(email: string, password: string, name?: string) {
    loading.value = true;
    error.value   = null;
    try {
      const res = await api.post<{ success: boolean; data: { token: string; user: AuthUser } }>(
        "/auth/register", { email, password, name }
      );
      token.value = res.data.data.token;
      user.value  = res.data.data.user;
      persist();
    } catch (e: any) {
      error.value = e?.message ?? "Erro ao criar conta";
      throw e;
    } finally {
      loading.value = false;
    }
  }

  // ─── Logout ────────────────────────────────────────────────

  function logout() {
    token.value = null;
    user.value  = null;
    persist();
  }

  // ─── Verificar sessão atual ────────────────────────────────

  async function checkAuth() {
    if (!token.value) return false;
    try {
      const res = await api.get<{ success: boolean; data: { user: AuthUser } }>("/auth/me");
      user.value = res.data.data.user;
      persist();
      return true;
    } catch {
      logout();
      return false;
    }
  }

  // ─── Salvar perfil de investidor ───────────────────────────

  // ─── Atualizar dados da conta ──────────────────────────────

  async function updateAccount(data: {
    name?: string;
    email?: string;
    currentPassword?: string;
    newPassword?: string;
  }) {
    loading.value = true;
    error.value   = null;
    try {
      const res = await api.put<{ success: boolean; data: { user: AuthUser } }>("/auth/account", data);
      user.value = res.data.data.user;
      persist();
    } catch (e: any) {
      error.value = e?.message ?? "Erro ao atualizar conta";
      throw e;
    } finally {
      loading.value = false;
    }
  }

  // ─── Salvar perfil de investidor ───────────────────────────

  async function saveInvestorProfile(
    profile: InvestorProfileName,
    method:  InvestorProfileChoice,
    score?:  number
  ) {
    const res = await api.put<{ success: boolean; data: { user: AuthUser } }>(
      "/auth/investor-profile", { profile, method, score }
    );
    user.value = res.data.data.user;
    persist();
  }

  return {
    token, user, loading, error,
    isAuthenticated, isAdmin, userName, needsProfile,
    login, register, logout, checkAuth, updateAccount, saveInvestorProfile,
  };
});
