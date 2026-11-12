// Util do DuckDB (browser) - singleton compartilhado por todas as views.
// Base: o mesmo util do trabalho 1 (visualizacao-Redesign).
//
// Uso:
//   import { queryRows } from "../../utils/duckdb.ts";
//   const rows = await queryRows<{ year: number }>(`SELECT DISTINCT year FROM races`);
//
// Usa o bundle MVP (sem SharedArrayBuffer), entao NAO exige headers COOP/COEP.
import * as duckdb from "@duckdb/duckdb-wasm";
import duckdbWasmUrl from "@duckdb/duckdb-wasm/dist/duckdb-mvp.wasm?url";
import mvpWorkerUrl from "@duckdb/duckdb-wasm/dist/duckdb-browser-mvp.worker.js?url";

let dbPromise: Promise<duckdb.AsyncDuckDB> | null = null;
let connPromise: Promise<duckdb.AsyncDuckDBConnection> | null = null;

async function getDB(): Promise<duckdb.AsyncDuckDB> {
  if (!dbPromise) {
    dbPromise = (async () => {
      const MANUAL_BUNDLES: duckdb.DuckDBBundles = {
        mvp: {
          mainModule: duckdbWasmUrl,
          mainWorker: mvpWorkerUrl,
        },
      };
      const bundle = await duckdb.selectBundle(MANUAL_BUNDLES);
      const worker = new Worker(bundle.mainWorker!, { type: "module" });
      const logger = new duckdb.ConsoleLogger();
      const db = new duckdb.AsyncDuckDB(logger, worker);
      await db.instantiate(bundle.mainModule, bundle.pthreadWorker);
      return db;
    })();
  }
  return dbPromise;
}

export async function getConnection(): Promise<duckdb.AsyncDuckDBConnection> {
  if (!connPromise) {
    connPromise = (async () => {
      const db = await getDB();
      return await db.connect();
    })();
  }
  return connPromise;
}

export async function execute(sql: string): Promise<void> {
  const conn = await getConnection();
  await conn.query(sql);
}

// SELECT -> objetos JS simples (converte Arrow Table para JSON).
export async function queryRows<T>(sql: string): Promise<T[]> {
  const conn = await getConnection();
  const result = await conn.query(sql);
  // toArray() retorna StructRow; toJSON() achata para objeto puro.
  // Inteiros do DuckDB (BIGINT, COUNT) chegam como BigInt, que o d3 nao entende.
  // Convertemos para number aqui para nenhuma view precisar se preocupar.
  return result.toArray().map((r) => {
    const obj = r.toJSON() as Record<string, unknown>;
    for (const k in obj) {
      if (typeof obj[k] === "bigint") obj[k] = Number(obj[k]);
    }
    return obj as T;
  });
}

// Baixa um CSV servido pelo Vite (public/) e cria uma tabela com ele.
// No dataset os valores ausentes vem como \N, por isso o nullstr.
export async function loadCsv(table: string, url: string): Promise<void> {
  const db = await getDB();
  const text = await (await fetch(url)).text();
  await db.registerFileText(`${table}.csv`, text);
  await execute(
    `CREATE OR REPLACE TABLE ${table} AS
     SELECT * FROM read_csv('${table}.csv', header = true, nullstr = '\\N')`,
  );
}
