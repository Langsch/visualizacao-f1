// Aba 3 - Temporada corrida a corrida
// Como o campeonato de um ano evoluiu: pontos ACUMULADOS de pilotos (ou construtores) rodada a rodada.
//
// Modelo de dados:
//   driver_standings / constructor_standings guardam a classificacao APOS cada corrida
//
// Cor:
//   A cor identifica a EQUIPE (construtor): pilotos da mesma construtora dividem a mesma cor.
//
// Interacao:
//   - select de ano: escreve setState({ ano }) - e o mesmo ano clicado na linha do tempo, que chega aqui ja escolhido
//   - alternador Pilotos/Construtores
//   - alternador Top 8/Todos: "Todos" mostra toda a tabela do ano.
//   - hover no grafico: "foto" da classificacao na rodada mais proxima do
//     cursor; cada linha do bloco traz uma amostra da cor do piloto (como na
//     legenda) e o nome em preto - em negrito quando o mouse esta na linha dele.
//   - hover em cima de uma linha (ou da legenda): destaca o piloto e esmaece os outros.
//
// Pendencias:
//   - TODO: marcar em que corrida o titulo foi decidido (criterio a definir).
//   - TODO: redesenhar no resize da janela (a v1 mede o container 1 vez).

import * as d3 from "d3";
import { dataReady } from "../../data/load.ts";
import { queryRows } from "../../utils/duckdb.ts";
import { getState, onStateChange, setState } from "../../state.ts";

// No modo "top", quantas linhas aparecem de uma vez.
const TOP_N = 8;

// Os construtores so tem classificacao a partir de 1958
const ANO_MIN_CONSTRUTORES = 1958;

interface RaceRow { round: number; name: string }
interface StandingRow { round: number; position: number; points: number }
interface Visivel { id: number; name: string; pontos: number; rank: number; cor: string }

// Modo de exibicao: series de pilotos ou de construtores.
type Modo = "pilotos" | "construtores";
// Quantidade de linhas: top-N ou a tabela inteira do ano.
type ModoLinhas = "top" | "todos";

// Sobrevive as trocas de aba e aos redraws.
let modoAtual: Modo = "pilotos";
let modoLinhas: ModoLinhas = "top";

// Lista de anos, cacheada: nao muda durante a sessao.
let anosCache: number[] | null = null;

async function anosDisponiveis(): Promise<number[]> {
  if (!anosCache) {
    const rows = await queryRows<{ year: number }>(`SELECT year FROM races GROUP BY year ORDER BY year`);
    anosCache = rows.map((r) => r.year);
  }
  return anosCache;
}

// Monta a query de classificacao de acordo com o modo.
function sqlStandings(ano: number, modo: Modo): string {
  const tabela = modo === "pilotos" ? "driver_standings" : "constructor_standings";
  const joinId = modo === "pilotos"
    ? "JOIN drivers d ON d.driverId = ds.driverId"
    : "JOIN constructors c ON c.constructorId = ds.constructorId";
  const nome = modo === "pilotos" ? "d.forename || ' ' || d.surname" : "c.name";
  const id = modo === "pilotos" ? "ds.driverId" : "ds.constructorId";
  return `
    SELECT r.round AS round, ${id} AS id, ${nome} AS name,
           ds.position AS position, ds.points AS points
    FROM ${tabela} ds
    JOIN races r ON r.raceId = ds.raceId
    ${joinId}
    WHERE r.year = ${ano} AND ds.position IS NOT NULL
    ORDER BY r.round, ds.points DESC
  `;
}

// Paleta de cores das equipes (11 cores - o maximo de construtores numa temporada)
const PALETA_CONSTRUTORES = [
  "#a6cee3", "#1f78b4", "#b2df8a", "#33a02c", "#fb9a99", "#e31a1c",
  "#fdbf6f", "#ff7f00", "#cab2d6", "#6a3d9a", "#ffff99",
];
// Cor de reserva para quem nao tiver equipe mapeada.
const COR_INDEFINIDO = "#8a8a8a";

// Ordem das equipes no campeonato do ano: a primeira do ranking fica com a primeira cor da paleta
async function ordemConstrutores(ano: number): Promise<number[]> {
  if (ano >= ANO_MIN_CONSTRUTORES) {
    const rows = await queryRows<{ id: number }>(`
      SELECT cs.constructorId AS id
      FROM constructor_standings cs
      JOIN races r ON r.raceId = cs.raceId
      WHERE r.year = ${ano} AND cs.position IS NOT NULL
      ORDER BY r.round DESC, cs.position ASC
    `);
    const ordem: number[] = [];
    for (const r of rows) if (!ordem.includes(r.id)) ordem.push(r.id);
    return ordem;
  }
  const rows = await queryRows<{ id: number }>(`
    SELECT constructorId AS id, SUM(points) AS pts
    FROM results rs
    JOIN races r ON r.raceId = rs.raceId
    WHERE r.year = ${ano}
    GROUP BY constructorId ORDER BY pts DESC
  `);
  return rows.map((r) => r.id);
}

// Equipe principal de cada piloto no ano
async function construtorPorPiloto(ano: number): Promise<Map<number, number>> {
  const rows = await queryRows<{ driverId: number; constructorId: number; n: number }>(`
    SELECT driverId, constructorId, COUNT(*) AS n
    FROM results rs
    JOIN races r ON r.raceId = rs.raceId
    WHERE r.year = ${ano}
    GROUP BY driverId, constructorId
  `);
  const melhor = new Map<number, { id: number; n: number }>();
  for (const r of rows) {
    const atual = melhor.get(r.driverId);
    if (atual === undefined || r.n > atual.n) melhor.set(r.driverId, { id: r.constructorId, n: r.n });
  }
  return new Map([...melhor.entries()].map(([d, v]) => [d, v.id]));
}

export function renderSeason(target: HTMLElement): void {
  draw(target);
  // Redesenha quando o ano mudar.
  onStateChange(() => draw(target));
}

// Guarda contra redraws concorrentes: so o ultimo draw continua.
let drawId = 0;

async function draw(target: HTMLElement): Promise<void> {
  const myId = ++drawId;
  await dataReady();
  if (myId !== drawId) return;

  const ano = getState().ano ?? (anosCache ? anosCache[anosCache.length - 1] : 2026);

  // Se o ano escolhido nao tem construtores, recai para pilotos.
  let modo = modoAtual;
  if (modo === "construtores" && ano < ANO_MIN_CONSTRUTORES) modo = "pilotos";

  // --- dados ---
  const [anos, corridas, linhas, ordemEquipes, equipePorPiloto] = await Promise.all([
    anosDisponiveis(),
    queryRows<RaceRow>(`SELECT round, name FROM races WHERE year = ${ano} ORDER BY round`),
    queryRows<StandingRow & { id: number; name: string }>(sqlStandings(ano, modo)),
    ordemConstrutores(ano),
    modo === "pilotos" ? construtorPorPiloto(ano) : Promise.resolve(new Map<number, number>()),
  ]);
  if (myId !== drawId) return;

  // Cor de cada equipe: paleta na ordem do campeonato de construtores.id -> cor;
  const corPorEquipe = new Map<number, string>();
  ordemEquipes.forEach((id, i) => {
    corPorEquipe.set(id, PALETA_CONSTRUTORES[i % PALETA_CONSTRUTORES.length]);
  });

  // --- DOM ---
  target.innerHTML = "";

  const titulo = document.createElement("div");
  titulo.innerHTML = cabecalho(ano, emAndamento(corridas, linhas));
  target.appendChild(titulo);

  const controles = document.createElement("div");
  montarControles(controles, anos, ano, modo);
  target.appendChild(controles);

  // Container do grafico
  const area = document.createElement("div");
  area.style.position = "relative";
  area.style.marginTop = "16px";
  target.appendChild(area);

  if (!linhas.length) {
    area.innerHTML = `<p class="note">Sem classificações no dataset para ${ano}.</p>`;
    return;
  }

  // Ultima rodada com classificacao: depois dela (se houver) e calendario futuro.
  const ultimaComDados = Math.max(...linhas.map((l) => l.round));

  // --- series ---
  // Uma por piloto/construtor: as linhas dele ordenadas por round.
  const series = new Map<number, { name: string; s: StandingRow[] }>();
  for (const l of linhas) {
    if (!series.has(l.id)) series.set(l.id, { name: l.name, s: [] });
    series.get(l.id)!.s.push({ round: l.round, position: l.position, points: l.points });
  }
  for (const v of series.values()) v.s.sort((a, b) => a.round - b.round);

  // Pontos finais de cada um = ultima linha da serie (crescente)
  const corDe = (id: number): string =>
    modo === "pilotos"
      ? corPorEquipe.get(equipePorPiloto.get(id) ?? -1) ?? COR_INDEFINIDO
      : corPorEquipe.get(id) ?? COR_INDEFINIDO;
  const todos: Visivel[] = [...series.entries()]
    .map(([id, v]) => ({
      id,
      name: v.name,
      pontos: v.s[v.s.length - 1].points,
      cor: corDe(id),
    }))
    .sort((a, b) => b.pontos - a.pontos)
    .map((v, i) => ({ ...v, rank: i + 1 }));
  const visiveis = modoLinhas === "top" ? todos.slice(0, TOP_N) : todos;

  desenharGrafico(area, corridas, visiveis, series, ultimaComDados);
}

// Temporada em andamento = ha corridas no calendario sem classificacao ainda.
function emAndamento(corridas: RaceRow[], linhas: StandingRow[]): boolean {
  if (!linhas.length) return false;
  const ultima = Math.max(...linhas.map((l) => l.round));
  return corridas.length > ultima;
}

function cabecalho(ano: number, temporadaEmAndamento: boolean): string {
  return `
    <p class="question">Como o campeonato de ${ano} evoluiu, corrida a corrida?</p>
    <ul class="note" style="margin: -12px 0 0; padding-left: 18px;">
      <li>Pontos oficiais do dataset, acumulados a cada corrida
          (sprints de 2021+ já embutidos). O sistema de pontos varia entre
          anos - por isso a comparação só vale dentro desta temporada.
          Pilotos da mesma equipe dividem a mesma cor.</li>
      ${temporadaEmAndamento
        ? "<li>Temporada em andamento no dataset: há corridas do calendário sem resultado.</li>"
        : ""}
    </ul>
  `;
}

// Select de ano + alternadores. O select dispara redesenho via estado, os alternadores sao locais da aba e redesenham direto.
function montarControles(root: HTMLElement, anos: number[], ano: number, modo: Modo): void {
  root.style.display = "flex";
  root.style.gap = "12px";
  root.style.alignItems = "center";
  root.style.marginTop = "16px";
  root.style.flexWrap = "wrap";

  const label = document.createElement("label");
  label.className = "note";
  label.textContent = "Temporada: ";
  const select = document.createElement("select");
  for (const y of anos) {
    const op = document.createElement("option");
    op.value = String(y);
    op.textContent = String(y);
    select.appendChild(op);
  }
  select.value = String(ano);
  select.addEventListener("change", () => setState({ ano: Number(select.value) }));
  label.appendChild(select);
  root.appendChild(label);

  // Alternador generico de botoes colados (Pilotos/Construtores, Top 8/Todos).
  function alternador<T extends string>(
    opcoes: Array<{ id: T; label: string }>,
    atual: T,
    aoTrocar: (novo: T) => void,
    desabilitarAntesDe?: number,
  ): void {
    const grupo = document.createElement("span");
    grupo.style.display = "inline-flex";
    for (const op of opcoes) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = op.label;
      const ativo = op.id === atual;
      btn.style.padding = "4px 12px";
      btn.style.fontSize = "0.85rem";
      btn.style.border = "1px solid var(--line)";
      btn.style.borderRadius = op.id === opcoes[0].id ? "4px 0 0 4px" : "0 4px 4px 0";
      btn.style.background = ativo ? "var(--asphalt)" : "var(--card)";
      btn.style.color = ativo ? "#fff" : "var(--ink)";
      btn.style.fontWeight = ativo ? "600" : "400";
      btn.style.cursor = "pointer";
      if (desabilitarAntesDe !== undefined && op.id === opcoes[1].id && ano < desabilitarAntesDe) {
        btn.disabled = true;
        btn.title = `Sem classificação de construtores antes de ${desabilitarAntesDe}`;
        btn.style.opacity = "0.45";
        btn.style.cursor = "not-allowed";
      }
      btn.addEventListener("click", () => {
        if (op.id === atual) return;
        aoTrocar(op.id);
        const target = document.querySelector<HTMLElement>("#tab-content");
        if (target) draw(target);
      });
      grupo.appendChild(btn);
    }
    root.appendChild(grupo);
  }

  alternador<Modo>(
    [
      { id: "pilotos", label: "Pilotos" },
      { id: "construtores", label: "Construtores" },
    ],
    modo,
    (novo) => { modoAtual = novo; },
    ANO_MIN_CONSTRUTORES,
  );

  alternador<ModoLinhas>(
    [
      { id: "top", label: `Top ${TOP_N}` },
      { id: "todos", label: "Todos" },
    ],
    modoLinhas,
    (novo) => { modoLinhas = novo; },
  );
}

// Grafico de linhas: x = rodada, y = pontos acumulados.
// Uma linha por piloto/construtor visivel; a do lider 
function desenharGrafico(
  area: HTMLElement,
  corridas: RaceRow[],
  visiveis: Visivel[],
  series: Map<number, { name: string; s: StandingRow[] }>,
  ultimaComDados: number,
): void {
  const largura = Math.max(area.clientWidth, 640);
  const altura = 460;
  // right folgado: a legenda (nome e pontos final) vive nessa margem.
  const margem = { top: 20, right: 240, bottom: 34, left: 52 };
  const w = largura - margem.left - margem.right;
  const h = altura - margem.top - margem.bottom;

  const svg = d3
    .select(area)
    .append("svg")
    .attr("width", largura)
    .attr("height", altura)
    .attr("viewBox", `0 0 ${largura} ${altura}`)
    .style("max-width", "100%")
    .style("font-family", "var(--font-body)");

  const g = svg.append("g").attr("transform", `translate(${margem.left},${margem.top})`);

  const totalRounds = Math.max(corridas.length, 1);
  const maxPontos = d3.max(visiveis, (d) => d.pontos) ?? 1;

  const x = d3.scaleLinear().domain([1, totalRounds]).range([0, w]);
  const y = d3.scaleLinear().domain([0, maxPontos]).nice().range([h, 0]);

  // Eixo de rodadas: UM rotulo por corrida (R1..Rn) e uma fina linha vertical
  g.append("g")
    .attr("transform", `translate(0,${h})`)
    .call(
      d3
        .axisBottom(x)
        .tickValues(d3.range(1, totalRounds + 1))
        .tickFormat((d) => `R${d}`)
        .tickSize(0)
        .tickPadding(8),
    )
    .call((ax) => {
      ax.select(".domain").attr("stroke", "var(--line)");
      ax.selectAll("text").attr("font-size", "10px").attr("fill", "var(--muted)");
    });
  g.append("g")
    .call(d3.axisLeft(y).ticks(6).tickSize(0).tickPadding(8))
    .call((ax) => ax.select(".domain").attr("stroke", "var(--line)"));
  g.append("text")
    .attr("transform", "rotate(-90)")
    .attr("x", -h / 2)
    .attr("y", -42)
    .attr("fill", "var(--muted)")
    .attr("font-size", "11px")
    .text("Pontos acumulados");

  // Grade: horizontal e vertical
  g.append("g")
    .selectAll("line")
    .data(y.ticks(6))
    .join("line")
    .attr("x2", w)
    .attr("y1", (d) => y(d))
    .attr("y2", (d) => y(d))
    .attr("stroke", "var(--line)")
    .attr("stroke-opacity", 0.6);
  g.append("g")
    .selectAll("line")
    .data(d3.range(1, totalRounds + 1))
    .join("line")
    .attr("x1", (r) => x(r))
    .attr("x2", (r) => x(r))
    .attr("y1", 0)
    .attr("y2", h)
    .attr("stroke", "var(--line)")
    .attr("stroke-opacity", 0.45);

  // Regiao das corridas que ainda nao aconteceram (ex.: 2026).
  if (totalRounds > ultimaComDados) {
    g.append("rect")
      .attr("x", x(ultimaComDados + 0.5))
      .attr("y", 0)
      .attr("width", x(totalRounds) - x(ultimaComDados + 0.5))
      .attr("height", h)
      .attr("fill", "var(--line)")
      .attr("fill-opacity", 0.25);
    g.append("text")
      .attr("x", x(ultimaComDados + 0.5) + 6)
      .attr("y", 14)
      .attr("fill", "var(--muted)")
      .attr("font-size", "11px")
      .text(`faltam ${totalRounds - ultimaComDados} corridas`);
  }

  // Linhas de dados
  const cor = (d: Visivel) => d.cor;
  const linha = d3
    .line<StandingRow>()
    .x((d) => x(d.round))
    .y((d) => y(d.points));

  const camada = g.append("g");
  const paths = camada
    .selectAll("path")
    .data([...visiveis].reverse())
    .join("path")
    .attr("fill", "none")
    .attr("stroke", cor)
    .attr("stroke-opacity", 0.92)
    .attr("stroke-width", (d) => (d.rank === 1 ? 3 : 1.6))
    .attr("stroke-linejoin", "round")
    .attr("stroke-linecap", "round")
    .attr("d", (d) => linha(series.get(d.id)!.s));

  // Legenda a direita, na ordem de classificacao final, hover destaca a linha.
  // Com "Todos" sao ~22 itens: encolhe o passo da fileira para caber.
  const legenda = svg
    .append("g")
    .attr("transform", `translate(${largura - margem.right + 24},${margem.top})`);
  const passoItem = Math.min(22, Math.max(15, Math.floor((altura - margem.top - margem.bottom) / visiveis.length)));
  const itens = legenda
    .selectAll("g")
    .data(visiveis)
    .join("g")
    .attr("transform", (_d, i) => `translate(0,${i * passoItem})`)
    .style("cursor", "pointer")
    .on("mouseenter", (_e: unknown, d: Visivel) => destacar(d.id))
    .on("mouseleave", () => destacar(null));
  itens
    .append("line")
    .attr("x2", 18)
    .attr("y1", -4)
    .attr("y2", -4)
    .attr("stroke", cor)
    .attr("stroke-width", (d) => (d.rank === 1 ? 3 : 1.6));
  itens
    .append("text")
    .attr("x", 24)
    .attr("y", 0)
    .attr("font-size", "12px")
    .attr("fill", "var(--ink)")
    .text((d) => `${d.name} · ${d.pontos}`);

  function destacar(idDestaque: number | null): void {
    idEmDestaque = idDestaque; // o tooltip usa para colocar o nome em negrito
    paths
      .attr("stroke-opacity", (d) => (idDestaque === null || d.id === idDestaque ? 0.92 : 0.12))
      .attr("stroke-width", (d) => {
        if (idDestaque !== null && d.id === idDestaque) return 3.5;
        return d.rank === 1 ? 3 : 1.6;
      });
  }
  // Piloto destacado agora 
  let idEmDestaque: number | null = null;

  // Hover no gráfico: "foto" da classificacao na rodada mais próxima do cursor
  const regra = g.append("line").attr("y2", h).attr("stroke", "var(--ink)").attr("opacity", 0);
  const tooltip = d3
    .select(area)
    .append("div")
    .style("position", "absolute")
    .style("pointer-events", "none")
    .style("background", "var(--card)")
    .style("border", "1px solid var(--line)")
    .style("border-radius", "6px")
    .style("padding", "8px 12px")
    .style("font-size", "12px")
    .style("box-shadow", "0 2px 10px rgba(0,0,0,0.12)")
    .style("opacity", 0);

  // Atualiza a regra vertical e o tooltip; usado pelo overlay e pelas linhas.
  function atualizarHover(event: MouseEvent): void {
    const [px] = d3.pointer(event);
    const rodada = Math.min(Math.max(Math.round(x.invert(px)), 1), ultimaComDados);
    regra.attr("x1", x(rodada)).attr("x2", x(rodada)).attr("opacity", 0.4);

    // Snapshot: pontos/posicao de cada visivel naquela rodada.
    const foto = visiveis
      .map((v) => {
        const s = series.get(v.id)!.s.find((p) => p.round === rodada);
        return s ? { id: v.id, name: v.name, points: s.points, pos: s.position, cor: v.cor } : null;
      })
      .filter((v): v is { id: number; name: string; points: number; pos: number; cor: string } => v !== null)
      .sort((a, b) => a.pos - b.pos);

    const corrida = corridas.find((c) => c.round === rodada);
    const tituloTooltip = corrida ? `R${rodada} · ${corrida.name}` : `R${rodada}`;
    
    // Cada linha leva uma amostra da cor da equipe e o nome em preto. Se o mouse esta sobre a linha de um piloto, o nome dele fica em negrito.
    const linhasHtml = foto
      .map((f) => {
        const emNegrito = f.id === idEmDestaque;
        return `
          <div style="display:flex;gap:12px;justify-content:space-between;${emNegrito ? "font-weight:700;" : ""}">
            <span style="display:flex;align-items:center;gap:8px;">
              <span style="display:inline-block;width:14px;height:3px;border-radius:2px;background:${f.cor};"></span>
              <span style="color:var(--ink);">P${f.pos} ${f.name}</span>
            </span>
            <strong style="color:var(--ink)">${f.points}</strong>
          </div>`;
      })
      .join("");

    // Posiciona o tooltip perto do cursor, virando de lado perto da borda direita.
    const [tx, ty] = d3.pointer(event, area);
    const alturaTooltip = foto.length * 16 + 38;
    const virar = tx > largura - 300;
    tooltip
      .html(
        `<strong>${tituloTooltip}</strong>${linhasHtml ? `<div style="margin-top:4px;">${linhasHtml}</div>` : ""}`,
      )
      .style("left", `${virar ? Math.max(tx - 260, 0) : tx + 14}px`)
      .style("top", `${Math.max(Math.min(ty + 12, altura - alturaTooltip), 0)}px`)
      .style("opacity", 1);
  }

  // Overlay: captura o mouse em toda a area do grafico.
  g.append("rect")
    .attr("width", w)
    .attr("height", h)
    .attr("fill", "transparent")
    .on("mousemove", (event: MouseEvent) => atualizarHover(event))
    .on("mouseleave", () => {
      regra.attr("opacity", 0);
      tooltip.style("opacity", 0);
      destacar(null);
    });

  // Area de acerto por linha
  g.append("g")
    .selectAll("path")
    .data([...visiveis].reverse())
    .join("path")
    .attr("class", "hit")
    .attr("fill", "none")
    .attr("stroke", "transparent")
    .attr("stroke-width", 10)
    .style("pointer-events", "stroke")
    .attr("d", (d) => linha(series.get(d.id)!.s))
    .on("mousemove", (event: MouseEvent) => atualizarHover(event))
    .on("mouseenter", (_e: unknown, d: Visivel) => destacar(d.id))
    .on("mouseleave", () => destacar(null));
}
