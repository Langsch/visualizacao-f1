import { defineConfig } from "vite";

// MVP do DuckDB dispensa COOP/COEP. Excluimos o wasm do pre-bundle.
// Os CSVs ficam em public/data e sao servidos como arquivos estaticos.
export default defineConfig({
  optimizeDeps: { exclude: ["@duckdb/duckdb-wasm"] },
});
