import "./styles/main.css";
import { createTabs } from "./components/Tabs.ts";
import { dataReady, TABLES } from "./data/load.ts";
import { renderTimeline } from "./views/timeline/index.ts";
import { renderRanking } from "./views/ranking/index.ts";
import { renderSeason } from "./views/season/index.ts";

// Ponto de entrada unico da aplicacao.
// A navegacao (abas) e independente das views: cada aba expoe
// so uma funcao render que recebe um container vazio.
const app = document.querySelector<HTMLElement>("#app");
if (!app) throw new Error("Elemento #app nao encontrado em index.html.");

app.innerHTML = `
  <header class="header">
    <div class="header-inner">
      <p class="kicker">Visual Analytics · F1 1950–2026</p>
      <h1>Eras de domínio</h1>
      <p class="subtitle">Quem mandou na Fórmula 1, quando e por quanto.</p>
    </div>
    <nav class="tabs" role="tablist" aria-label="Views"></nav>
  </header>
  <main id="tab-content" class="content"></main>
  <footer class="about">
    <div>
      <h2>Sobre os dados</h2>
      <p>Fonte: <a href="https://www.kaggle.com/datasets/jtrotman/formula-1-race-data">Formula 1 Race Data</a>
      (Kaggle, jtrotman, CC0), baseado na Ergast/Jolpica. Versão de 08/11/2026, até o GP do Brasil 2026.</p>
      <ul>
        <li>O sistema de pontos mudou várias vezes: entre eras comparamos % de vitórias, % de pódios e posição média.</li>
        <li>Pontos oficiais só dentro de uma temporada, onde o sistema é um só.</li>
        <li>A temporada 2026 ainda tem 3 corridas pela frente.</li>
      </ul>
    </div>
    <p id="db-status" class="db-status">DuckDB: carregando…</p>
  </footer>
`;

const nav = app.querySelector<HTMLElement>(".tabs")!;
const content = app.querySelector<HTMLElement>("#tab-content")!;

createTabs(nav, content, [
  { id: "timeline", label: "Linha do tempo", render: renderTimeline },
  { id: "ranking", label: "Ranking de domínio", render: renderRanking },
  { id: "season", label: "Temporada", render: renderSeason },
]);

// Comeca a carregar os CSVs no DuckDB ja na abertura da pagina.
// As views chamam dataReady() de novo antes de consultar (nao recarrega).
const status = app.querySelector<HTMLElement>("#db-status")!;
dataReady()
  .then(() => {
    status.textContent = `DuckDB: ${TABLES.length} tabelas carregadas`;
    status.classList.add("ok");
  })
  .catch((e) => {
    status.textContent = `DuckDB: erro ao carregar (${e})`;
  });
