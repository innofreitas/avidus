import axios from "axios";
import router from "@/router";

const api = axios.create({ baseURL: "/api", timeout: 60_000, headers: { "Content-Type": "application/json" } });

// Injeta o token JWT em toda requisição
api.interceptors.request.use((config) => {
  const token = localStorage.getItem("auth_token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    // Se o backend retornar 401, redireciona para login e limpa a sessão
    if (err.response?.status === 401) {
      localStorage.removeItem("auth_token");
      localStorage.removeItem("auth_user");
      router.push("/login").catch(() => {});
    }
    const msg = err.response?.data?.message ?? err.response?.data?.error?.message ?? err.message ?? "Erro desconhecido";
    console.error("[API]", msg);
    return Promise.reject(new Error(msg));
  }
);

export default api;
