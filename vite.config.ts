import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import path from "node:path";

export default defineConfig(({ mode }) => ({
  base: mode === "pages" ? "/SubscriptIQ/" : "/",
  build: { outDir: mode === "pages" ? "dist-pages" : "dist" },
  optimizeDeps: { exclude: ["@electric-sql/pglite", "@electric-sql/pglite/worker"] },
  worker: { format: "es" },
  plugins: [tanstackRouter({ target: "react", autoCodeSplitting: true }), react(), tailwindcss()],
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "src") } },
  server: {
    host: "0.0.0.0",
    port: 3000,
    strictPort: true,
    proxy: { "/api": "http://127.0.0.1:3001" },
  },
}));
