// stores/themeStore.ts
import { defineStore } from "pinia";
import { ref, watch } from "vue";

export const useThemeStore = defineStore("theme", () => {
  const isDark = ref(
    localStorage.getItem("avidus-theme") === "dark" ||
    (!localStorage.getItem("avidus-theme") && window.matchMedia("(prefers-color-scheme: dark)").matches)
  );

  function apply() {
    document.documentElement.classList.toggle("dark", isDark.value);
    localStorage.setItem("avidus-theme", isDark.value ? "dark" : "light");
  }

  function toggle() { isDark.value = !isDark.value; }

  apply();
  watch(isDark, apply);

  return { isDark, toggle };
});
