# Eras de domínio na F1 - Visual Analytics com D3.js + DuckDB

Quem mandou na Fórmula 1, quando e por quanto (1950–2026).
Base mínima (Vite + TypeScript) com 3 abas, uma por view. As abas ainda não têm
gráfico: cada uma mostra as instruções do que deve ser feito nela.

## Como rodar

Pré-requisito: Node e npm.

```bash
npm install
npm run dev      # servidor local (http://localhost:5173)
```

Tudo roda no navegador: o Vite só serve os arquivos, e as consultas são feitas pelo DuckDB-Wasm.
O rodapé da página mostra "DuckDB: 8 tabelas carregadas" quando os dados estão prontos.

## O que foi decidido

### Tema e motivação

**Eras de domínio**: quem dominou a F1, em que época e por quanto.
O gancho é o título do Antonelli em 2026: foi domínio ou disputa? Como se compara com outras eras?

Público: fã que começou a acompanhar recentemente e quer entender a história.

### Perguntas

1. Quais equipes e pilotos dominaram cada época, e por quanto tempo? → aba **Linha do tempo**
2. Dentro de um período, quem foi mais dominante? → aba **Ranking de domínio**
3. Como o campeonato de uma temporada evoluiu, corrida a corrida? → aba **Temporada**

### Métricas

O sistema de pontos mudou várias vezes (vitória já valeu de 8 a 25 pontos, e até 1990
os piores resultados eram descartados). Então:

- **Entre eras, sem pontos.** Comparamos por **% de vitórias**, **% de pódios** e **posição média de chegada**.
- **Os % são sobre as corridas que cada piloto disputou no período**, não sobre o total.
  Ex.: num período de 2014 a 2020, quem estreou em 2018 não fica com os números diluídos.
- **Não recalculamos a história com um sistema de pontos único**: preferimos usar o que o dataset dá.
- **Pontos oficiais só dentro de uma temporada** (aba Temporada), onde o sistema é um só.
- "Em que corrida o título foi decidido" ficou de fora: depende de saber o sistema de pontos de cada ano.

Ainda em aberto (ranking):

- número mínimo de corridas para um piloto entrar no ranking (sem isso, quem correu 1 corrida e venceu tem 100%);
- posição média só das corridas que o piloto terminou, ou abandono contando como último;
- não contar "Did not qualify" como corrida (o piloto nem largou).

### Divisão

Cada pessoa faz query + gráfico + interação da sua aba:

| Aba | Pasta | O que fazer |
| --- | --- | --- |
| 01 Linha do tempo | `src/views/timeline/` | Equipe/piloto dominante por ano, com brush para selecionar um período. Também cuida da base (dados no DuckDB, layout). |
| 02 Ranking de domínio | `src/views/ranking/` | Compara pilotos/equipes do período em % vitórias, % pódios e posição média. |
| 03 Temporada | `src/views/season/` | Ao escolher um ano, mostra a evolução da pontuação de pilotos e de construtores. |

## Dados

Fonte: [Formula 1 Race Data](https://www.kaggle.com/datasets/jtrotman/formula-1-race-data) (Kaggle, jtrotman, licença CC0),
baseado na Ergast/Jolpica. Versão de 08/11/2026, até o GP do Brasil 2026.

O dataset completo (14 CSVs, 29 MB) está em `public/data/`. Para atualizar, baixe o dataset
do Kaggle e substitua os arquivos com o mesmo nome.

Nem todas as tabelas são carregadas no DuckDB: só as listadas em `TABLES`, no `src/data/load.ts`
(marcadas com ✓ abaixo). Para usar outra, é só adicionar o nome lá. Cuidado com o `lap_times`:
são 25 MB e ~889 mil linhas, então a página demora mais para abrir.

| Tabela | Carregada | O que guarda | Temporadas |
| --- | --- | --- | --- |
| `races` | ✓ | corrida: ano, rodada, circuito, data | 1950–2026 |
| `results` | ✓ | resultado de cada piloto: grid, posição, pontos, status | 1950–2026 |
| `sprint_results` | ✓ | resultados das sprints | 2021–2026 |
| `driver_standings` | ✓ | classificação de pilotos após cada corrida | 1950–2026 |
| `constructor_standings` | ✓ | classificação de construtores após cada corrida | 1958–2026 |
| `drivers`, `constructors` | ✓ | nomes, nacionalidade | - |
| `status` | ✓ | motivo do fim da prova (Finished, Engine, Did not qualify…) | - |
| `constructor_results` | | pontos de cada equipe em cada corrida | 1958–2026 |
| `qualifying` | | tempos de Q1/Q2/Q3 (com buracos, ex.: 1996 tem 7 de 16 corridas) | 1994–2026 |
| `lap_times` | | tempo de cada volta de cada piloto | 1982–2026 |
| `pit_stops` | | paradas: volta e duração | 1994–2026 |
| `circuits` | | nome, país, latitude/longitude | - |
| `seasons` | | ano + link da Wikipedia | 1950–2026 |

Limitações:

- sistema de pontos diferente entre épocas (ver Métricas);
- temporada 2026 incompleta: 20 de 23 corridas com resultado;
- construtores só têm classificação a partir de 1958;
- dados de detalhe (voltas, paradas, classificação) só existem nas épocas mais recentes.

## Estrutura

```text
public/data/            # dataset completo do Kaggle (14 CSVs)
src/
├── main.ts             # cabeçalho, abas, rodapé "Sobre os dados"
├── state.ts            # estado compartilhado (período e ano) - a coordenação entre abas
├── components/
│   ├── Tabs.ts         # troca de abas (limpa o container a cada troca)
│   └── Guide.ts        # cartão de instruções (some quando a view for implementada)
├── data/load.ts        # cada CSV vira uma tabela no DuckDB (races.csv -> races)
├── utils/duckdb.ts     # queryRows, execute, loadCsv
├── views/
│   ├── timeline/       # aba 01
│   ├── ranking/        # aba 02
│   └── season/         # aba 03
└── styles/main.css
```

## Como implementar uma view

Cada aba exporta uma função `render` que recebe um elemento **vazio** e desenha dentro dele.
Hoje ela só chama `renderGuide(...)`. Para começar, apague essa chamada e escreva a sua view:

```ts
// src/views/ranking/index.ts
import * as d3 from "d3";
import { dataReady } from "../../data/load.ts";
import { queryRows } from "../../utils/duckdb.ts";
import { getState, onStateChange } from "../../state.ts";

export function renderRanking(target: HTMLElement): void {
  draw(target);
  onStateChange(() => draw(target));   // redesenha quando o período mudar
}

async function draw(target: HTMLElement): Promise<void> {
  await dataReady();                   // garante que os CSVs já estão no DuckDB
  const [de, ate] = getState().periodo;
  const rows = await queryRows<{ piloto: string; vitorias: number }>(`
    SELECT ... FROM results JOIN races USING (raceId)
    WHERE year BETWEEN ${de} AND ${ate} ...
  `);
  target.innerHTML = "";
  const svg = d3.select(target).append("svg");
  // ...
}
```

Regras:

1. Edite **só** a pasta da sua aba.
2. `main.ts`, `state.ts`, `Tabs.ts` e `data/load.ts` são compartilhados: combine com o grupo antes de mudar.
3. Crie o SVG sempre **dentro** do `target`. A troca de aba limpa o container.
4. Agregue e filtre no SQL (DuckDB). O D3 só desenha.
5. Comente as queries, os gráficos e as interações (o enunciado cobra).
6. Trabalhe numa branch sua e abra PR para a `main`.

## Coordenação entre abas

O `state.ts` guarda o **período** (`[de, ate]`) e o **ano** selecionados.

- Para mudar: `setState({ periodo: [2014, 2020] })` ou `setState({ ano: 1988 })`.
- Para ler: `getState().periodo` / `getState().ano`.
- Para reagir na mesma aba: `onStateChange(() => ...)`.

O estado continua quando se troca de aba: o período escolhido na linha do tempo
já chega filtrado no ranking, e o ano clicado já abre na aba Temporada.

## DuckDB

DuckDB real no browser via `@duckdb/duckdb-wasm` (bundle MVP, sem COOP/COEP), mesma base do trabalho 1.

* `dataReady()` - carrega os CSVs na primeira chamada; nas próximas só espera.
* `queryRows<T>(sql)` - SELECT -> objetos JS. Inteiros (BIGINT, COUNT) já chegam como `number`.
* `loadCsv(tabela, url)` - usado pelo `load.ts`. Os valores ausentes do dataset (`\N`) viram `NULL`.
