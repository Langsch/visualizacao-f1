// Carrega todos os CSVs no DuckDB uma unica vez.
// Cada CSV vira uma tabela com o mesmo nome (races.csv -> races).
// O dataset completo esta em public/data; so as tabelas desta lista sao carregadas.
// Para usar outra (ex: "qualifying"), e so adicionar o nome aqui.
//
// Uso numa view, antes de qualquer consulta:
//   await dataReady();
//   const rows = await queryRows(`SELECT ...`);
import { loadCsv } from "../utils/duckdb.ts";

export const TABLES = [
  "races",
  "results",
  "sprint_results",
  "drivers",
  "constructors",
  "driver_standings",
  "constructor_standings",
  "status",
];

let ready: Promise<void> | null = null;

// Pode chamar quantas vezes quiser: so carrega na primeira.
export function dataReady(): Promise<void> {
  if (!ready) {
    ready = (async () => {
      for (const t of TABLES) {
        await loadCsv(t, `${import.meta.env.BASE_URL}data/${t}.csv`);
      }
    })();
  }
  return ready;
}
