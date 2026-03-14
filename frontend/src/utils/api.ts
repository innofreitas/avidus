import axios from "axios";

const api = axios.create({ baseURL: "/api", timeout: 60_000, headers: { "Content-Type": "application/json" } });

api.interceptors.response.use(
  (res) => res,
  (err) => {
    const msg = err.response?.data?.error?.message ?? err.message ?? "Erro desconhecido";
    console.error("[API]", msg);
    return Promise.reject(new Error(msg));
  }
);

export default api;
