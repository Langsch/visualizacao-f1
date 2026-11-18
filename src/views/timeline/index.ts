// Aba 1 - Linha do tempo 1950-2026
// Quem dominou cada temporada, e por quanto tempo: porta de entrada do sistema.
//
// Modelo de dados:
//   results + races: o lider de cada ano e quem mais venceu naquele ano.
//   Metrica = % de vitorias (vitorias / corridas do ano com resultado), sem pontos,
//   porque o sistema de pontos mudou varias vezes (ver README, "Metricas").
//   Desempate em vitorias: mais podios; persistindo, mais pontos DO ANO
//   (dentro de uma temporada o sistema de pontos e um so, entao comparar vale).
//   Indy 500 (1950-60) conta como corrida, como no resto do dataset.
//   Construtores com nomes diferentes (ex.: Lotus-Climax x Lotus-Ford) ficam separados.
//
// Grafico:
//   Duas faixas com o mesmo eixo de anos: equipe lider e piloto lider.
//   Uma barra por temporada; altura = % de vitorias do lider; cor = equipe
//   (no piloto, a equipe pela qual ele mais correu no ano).
//   Sequencias de 3+ anos com o mesmo lider ganham um rotulo de "era".
//
// Cor:
//   Paleta FIXA por equipe (a mesma equipe tem a mesma cor em todos os anos),
//   so para as que mais lideraram; as demais ficam cinza. Diferente da aba 03,
//   que colore pela ordem do campeonato de cada ano.
//
// Interacao:
//   - brush na faixa de anos: escreve setState({ periodo: [de, ate] }) (o Ranking le)
//   - clique numa temporada: escreve setState({ ano }) e marca a barra. Nao troca de aba.
//   - hover numa temporada: tooltip com lider, vice e % de vitorias
//   - hover na legenda: destaca uma equipe e esmaece as outras
//   Esta aba so ESCREVE no estado, entao nao usa onStateChange: redesenhar a cada
//   brush recriaria o proprio brush. As marcacoes sao atualizadas localmente.
//
// Pendencias:
//   - TODO: redesenhar no resize da janela (a v1 mede o container 1 vez, como a aba 03).

import * as d3 from "d3";
import { dataReady } from "../../data/load.ts";
import { queryRows } from "../../utils/duckdb.ts";
import { getState, setState } from "../../state.ts";

// Uma "era" no grafico = pelo menos isso de anos seguidos com o mesmo lider.
const MIN_ANOS_ERA = 3;

// Paleta fixa das equipes que mais lideraram temporadas em vitorias (por nome do dataset).
const CORES_EQUIPES: Record<string, string> = {
  Ferrari: "#d62728",
  McLaren: "#ff7f0e",
  Mercedes: "#12a4a0",
  Williams: "#1f4e9c",
  "Red Bull": "#8c6bb1",
  "Team Lotus": "#2ca02c",
  "Alfa Romeo": "#8c564b",
  Benetton: "#e377c2",
};
// Cor das demais equipes.
const COR_OUTRAS = "#b8bbc0";

const corDaEquipe = (equipe: string): string => CORES_EQUIPES[equipe] ?? COR_OUTRAS;

// Uma linha da query: lider (rank 1) ou vice (rank 2) de um ano.
interface LiderRow {
  year: number;
  rank: number;
  id: number;
  nome: string;      // nome completo (piloto) ou nome da equipe
  curto: string;     // sobrenome (piloto) ou nome da equipe: usado nos rotulos de era
  equipe: string;    // equipe que define a cor
  vitorias: number;
  podios: number;
  corridas: number;  // corridas do ano com resultado (denominador)
  calendario: number; // corridas no calendario (2026 tem mais que "corridas")
}

// Faixa do grafico: equipes ou pilotos.
type Faixa = "equipe" | "piloto";

// Tudo que o grafico precisa de um ano.
interface Ano {
  year: number;
  corridas: number;
  calendario: number;
  equipe: { lider: LiderRow; vice?: LiderRow };
  piloto: { lider: LiderRow; vice?: LiderRow };
}

// Sequencia de anos com o mesmo lider numa faixa.
interface Era { faixa: Faixa; id: number; curto: string; equipe: string; de: number; ate: number }

// Monta a query de lider + vice por ano. Toda a agregacao fica no SQL; o D3 so desenha.
function sqlLideres(faixa: Faixa): string {
  const id = faixa === "equipe" ? "rs.constructorId" : "rs.driverId";
  const nome = faixa === "equipe" ? "c.name" : "d.forename || ' ' || d.surname";
  const curto = faixa === "equipe" ? "c.name" : "d.surname";
  const joinPiloto = faixa === "piloto" ? "JOIN drivers d ON d.driverId = q.id" : "";
  return `
    WITH com_resultado AS (
      -- denominador: corridas do ano que JA tem resultado (2026 ainda esta incompleto)
      SELECT r.year, COUNT(DISTINCT r.raceId) AS corridas
      FROM races r JOIN results rs ON rs.raceId = r.raceId
      GROUP BY r.year
    ),
    calendario AS (
      SELECT year, COUNT(*) AS calendario FROM races GROUP BY year
    ),
    equipe_principal AS (
      -- equipe que define a cor: a que o piloto mais defendeu no ano
      -- (na faixa de equipes, e a propria equipe)
      SELECT year, id, arg_max(constructorId, n) AS constructorId
      FROM (
        SELECT r.year, ${id} AS id, rs.constructorId, COUNT(*) AS n
        FROM results rs JOIN races r ON r.raceId = rs.raceId
        GROUP BY ALL
      )
      GROUP BY year, id
    ),
    placar AS (
      -- vitorias contadas por CORRIDA: em 1957 houve vitoria com carro dividido
      -- (dois pilotos com positionOrder = 1 na mesma prova)
      SELECT r.year, ${id} AS id,
             COUNT(DISTINCT CASE WHEN rs.positionOrder = 1 THEN r.raceId END) AS vitorias,
             CAST(SUM(CASE WHEN rs.positionOrder <= 3 THEN 1 ELSE 0 END) AS INTEGER) AS podios,
             CAST(SUM(rs.points) AS DOUBLE) AS pontos
      FROM results rs JOIN races r ON r.raceId = rs.raceId
      GROUP BY r.year, ${id}
    ),
    ranqueado AS (
      -- desempate: vitorias -> podios -> pontos do proprio ano
      SELECT *, ROW_NUMBER() OVER (
        PARTITION BY year ORDER BY vitorias DESC, podios DESC, pontos DESC
      ) AS rank
      FROM placar
    )
    SELECT q.year, q.rank, q.id, ${nome} AS nome, ${curto} AS curto, c.name AS equipe,
           q.vitorias, q.podios, k.corridas, cal.calendario
    FROM ranqueado q
    JOIN com_resultado k ON k.year = q.year
    JOIN calendario cal ON cal.year = q.year
    JOIN equipe_principal e ON e.year = q.year AND e.id = q.id
    JOIN constructors c ON c.constructorId = e.constructorId
    ${joinPiloto}
    WHERE q.rank <= 2
    ORDER BY q.year, q.rank
  `;
}

// Os dados nao mudam durante a sessao: consulta uma vez so.
let anosCache: Ano[] | null = null;

async function carregarAnos(): Promise<Ano[]> {
  if (!anosCache) {
    const [equipes, pilotos] = await Promise.all([
      queryRows<LiderRow>(sqlLideres("equipe")),
      queryRows<LiderRow>(sqlLideres("piloto")),
    ]);
    const porAno = new Map<number, Partial<Ano>>();
    const juntar = (rows: LiderRow[], faixa: Faixa) => {
      for (const r of rows) {
        const a = porAno.get(r.year) ?? { year: r.year, corridas: r.corridas, calendario: r.calendario };
        const atual = a[faixa] ?? ({} as Ano[Faixa]);
        if (r.rank === 1) atual.lider = r;
        else atual.vice = r;
        a[faixa] = atual;
        porAno.set(r.year, a);
      }
    };
    juntar(equipes, "equipe");
    juntar(pilotos, "piloto");
    anosCache = [...porAno.values()]
      .filter((a): a is Ano => a.equipe?.lider !== undefined && a.piloto?.lider !== undefined)
      .sort((a, b) => a.year - b.year);
  }
  return anosCache;
}

// Agrupa anos seguidos com o mesmo lider. Sao ~77 linhas ja agregadas pelo SQL,
// entao fazer isso aqui e so organizar o desenho, nao agregar dado.
function calcularEras(anos: Ano[], faixa: Faixa): Era[] {
  const eras: Era[] = [];
  let atual: Era | null = null;
  for (const a of anos) {
    const l = a[faixa].lider;
    if (atual && atual.id === l.id && atual.ate === a.year - 1) {
      atual.ate = a.year;
    } else {
      atual = { faixa, id: l.id, curto: l.curto, equipe: l.equipe, de: a.year, ate: a.year };
      eras.push(atual);
    }
  }
  return eras.filter((e) => e.ate - e.de + 1 >= MIN_ANOS_ERA);
}

export function renderTimeline(target: HTMLElement): void {
  draw(target);
}

// Guarda contra redraws concorrentes: so o ultimo draw continua.
let drawId = 0;

async function draw(target: HTMLElement): Promise<void> {
  const myId = ++drawId;
  await dataReady();
  if (myId !== drawId) return;

  const anos = await carregarAnos();
  if (myId !== drawId) return;

  // --- DOM ---
  target.innerHTML = "";

  const titulo = document.createElement("div");
  titulo.innerHTML = cabecalho(anos);
  target.appendChild(titulo);

  const legenda = document.createElement("div");
  target.appendChild(legenda);

  // Container do grafico
  const area = document.createElement("div");
  area.style.position = "relative";
  area.style.marginTop = "12px";
  target.appendChild(area);

  // Linha de status: periodo e temporada escolhidos (o que as outras abas vao receber)
  const status = document.createElement("div");
  target.appendChild(status);

  if (!anos.length) {
    area.innerHTML = `<p class="note">Sem resultados no dataset.</p>`;
    return;
  }

  desenharGrafico(area, legenda, status, anos);
}

function cabecalho(anos: Ano[]): string {
  // Ano em andamento = tem corridas no calendario sem resultado ainda (ex.: 2026).
  const incompleto = anos.find((a) => a.calendario > a.corridas);
  return `
    <p class="question">Quais equipes e pilotos dominaram cada época, e por quanto tempo?</p>
    <ul class="note" style="margin: -12px 0 0; padding-left: 18px;">
      <li>Cada barra é uma temporada. A altura é a % das corridas do ano vencidas pelo líder:
          barra alta é domínio, barra baixa é disputa. A cor é a equipe
          (na faixa de pilotos, a equipe pela qual ele mais correu no ano).</li>
      <li>Sem pontos entre anos: o sistema mudou várias vezes. Empate em vitórias
          é desempatado por pódios e, depois, pelos pontos do próprio ano. A Indy 500 (1950–60) conta como corrida.</li>
      ${incompleto
        ? `<li>${incompleto.year} em andamento no dataset: ${incompleto.corridas} de ${incompleto.calendario} corridas com resultado (barra tracejada).</li>`
        : ""}
    </ul>
  `;
}

// Grafico: duas faixas de barras (equipe, piloto) + faixa de brush com o eixo de anos.
function desenharGrafico(area: HTMLElement, legendaEl: HTMLElement, statusEl: HTMLElement, anos: Ano[]): void {
  const largura = Math.max(area.clientWidth, 640);
  const margem = { top: 6, right: 12, bottom: 6, left: 64 };
  const alturaEra = 34;   // espaco dos rotulos de era, acima de cada faixa
  const alturaBarras = 120;
  const vao = 14;         // entre as faixas
  const alturaBrush = 40; // faixa do brush (com os anos)
  const w = largura - margem.left - margem.right;

  // Posicao vertical (topo das barras) de cada faixa.
  const topo: Record<Faixa, number> = {
    equipe: alturaEra,
    piloto: alturaEra + alturaBarras + vao + alturaEra,
  };
  const topoBrush = topo.piloto + alturaBarras + vao;
  const altura = margem.top + topoBrush + alturaBrush + 22 + margem.bottom;

  const svg = d3
    .select(area)
    .append("svg")
    .attr("width", largura)
    .attr("height", altura)
    .attr("viewBox", `0 0 ${largura} ${altura}`)
    .style("max-width", "100%")
    .style("font-family", "var(--font-body)");

  const g = svg.append("g").attr("transform", `translate(${margem.left},${margem.top})`);

  // Eixo X: uma banda por temporada. Sem padding externo, para o brush
  // converter pixel -> ano com uma divisao simples (indice = px / passo).
  const listaAnos = anos.map((a) => a.year);
  const x = d3.scaleBand<number>().domain(listaAnos).range([0, w]).paddingInner(0.18).paddingOuter(0);
  const passo = x.step();
  const y = d3.scaleLinear().domain([0, 1]).range([alturaBarras, 0]);

  const pct = (l: LiderRow) => l.vitorias / l.corridas;
  const fmtPct = d3.format(".0%");
  const anoMin = listaAnos[0];
  const anoMax = listaAnos[listaAnos.length - 1];

  // Estado local de destaque (nao vai para o state.ts).
  let equipeEmDestaque: string | null = null;

  // --- faixas de barras ---
  const faixas: Faixa[] = ["equipe", "piloto"];
  const barras: Record<Faixa, d3.Selection<SVGRectElement, Ano, SVGGElement, unknown>> = {} as never;

  for (const faixa of faixas) {
    const gf = g.append("g").attr("transform", `translate(0,${topo[faixa]})`);

    // Rotulo da faixa (na altura dos rotulos de era) e referencias de 50% / 100%
    gf.append("text")
      .attr("x", -margem.left)
      .attr("y", -20)
      .attr("font-family", "var(--font-mono)")
      .attr("font-size", "11px")
      .attr("letter-spacing", "0.08em")
      .attr("fill", "var(--ink)")
      .text(faixa === "equipe" ? "EQUIPE" : "PILOTO");
    for (const ref of [0.5, 1]) {
      gf.append("line")
        .attr("x2", w)
        .attr("y1", y(ref))
        .attr("y2", y(ref))
        .attr("stroke", "var(--line)")
        .attr("stroke-dasharray", ref === 0.5 ? "3 3" : null);
      gf.append("text")
        .attr("x", -8)
        .attr("y", y(ref) + 4)
        .attr("text-anchor", "end")
        .attr("font-size", "10px")
        .attr("fill", "var(--muted)")
        .text(fmtPct(ref));
    }
    gf.append("line").attr("x2", w).attr("y1", alturaBarras).attr("y2", alturaBarras).attr("stroke", "var(--muted)");

    // Uma barra por ano. Ano incompleto (calendario > corridas) ganha contorno tracejado.
    barras[faixa] = gf
      .append("g")
      .selectAll<SVGRectElement, Ano>("rect")
      .data(anos)
      .join("rect")
      .attr("x", (a) => x(a.year)!)
      .attr("width", x.bandwidth())
      .attr("y", (a) => y(pct(a[faixa].lider)))
      .attr("height", (a) => alturaBarras - y(pct(a[faixa].lider)))
      .attr("fill", (a) => corDaEquipe(a[faixa].lider.equipe))
      .attr("stroke-dasharray", (a) => (a.calendario > a.corridas ? "2 2" : null));

    // Rotulos de era: colchete na cor da equipe + "Nome · N anos".
    // Rotulos vizinhos que se sobreporiam sobem para uma segunda linha.
    const eras = calcularEras(anos, faixa);
    const fimDaLinha = [-Infinity, -Infinity];
    const ge = gf.append("g").attr("pointer-events", "none");
    for (const era of eras) {
      const x0 = x(era.de)!;
      const x1 = x(era.ate)! + x.bandwidth();
      ge.append("path")
        .attr("d", `M${x0},-1 V-4 H${x1} V-1`)
        .attr("fill", "none")
        .attr("stroke", corDaEquipe(era.equipe))
        .attr("stroke-width", 2);
      const texto = ge
        .append("text")
        .attr("font-size", "11px")
        .attr("font-weight", 600)
        .attr("fill", "var(--ink)")
        .text(`${era.curto} · ${era.ate - era.de + 1} anos`);
      // Mede o texto ja renderizado; perto da borda direita, alinha pelo fim do grafico.
      const larguraTexto = texto.node()!.getComputedTextLength();
      const xTexto = Math.min(x0, w - larguraTexto);
      const nivel = xTexto > fimDaLinha[0] ? 0 : xTexto > fimDaLinha[1] ? 1 : 0;
      fimDaLinha[nivel] = xTexto + larguraTexto + 8;
      texto.attr("x", xTexto).attr("y", nivel === 0 ? -20 : -8);
    }
  }

  // --- coluna de hover/clique por ano (cobre as duas faixas) ---
  const realce = g
    .append("rect")
    .attr("y", topo.equipe - 2)
    .attr("height", topo.piloto + alturaBarras - topo.equipe + 4)
    .attr("width", passo)
    .attr("fill", "var(--ink)")
    .attr("fill-opacity", 0.06)
    .attr("pointer-events", "none")
    .attr("opacity", 0);

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
    .style("line-height", "1.45")
    .style("box-shadow", "0 2px 10px rgba(0,0,0,0.12)")
    .style("max-width", "300px")
    .style("opacity", 0);

  // Uma linha do tooltip: amostra da cor + nome + vitorias.
  function linhaTooltip(rotulo: string, l: LiderRow, vice?: LiderRow): string {
    const empate = vice && vice.vitorias === l.vitorias;
    const equipe = rotulo === "Piloto" ? ` <span style="color:var(--muted)">(${l.equipe})</span>` : "";
    return `
      <div style="margin-top:4px;">
        <span style="display:inline-block;width:14px;height:3px;border-radius:2px;background:${corDaEquipe(l.equipe)};vertical-align:middle;margin-right:6px;"></span>
        ${rotulo}: <strong>${l.nome}</strong>${equipe} · ${l.vitorias}/${l.corridas} (${fmtPct(pct(l))})
        ${vice
          ? `<div style="color:var(--muted);padding-left:20px;">
               ${empate ? "empate em vitórias com" : "vice:"} ${vice.nome} · ${vice.vitorias}
               ${empate ? `(desempate: ${l.podios} x ${vice.podios} pódios${l.podios === vice.podios ? ", depois pontos" : ""})` : ""}
             </div>`
          : ""}
      </div>`;
  }

  function mostrarTooltip(event: MouseEvent, a: Ano): void {
    realce.attr("x", x(a.year)! - (passo - x.bandwidth()) / 2).attr("opacity", 1);
    const corridasTxt = a.calendario > a.corridas
      ? `${a.corridas} de ${a.calendario} corridas disputadas`
      : `${a.corridas} corridas`;
    const [tx, ty] = d3.pointer(event, area);
    const virar = tx > largura - 320;
    tooltip
      .html(
        `<strong>${a.year}</strong> <span style="color:var(--muted)">· ${corridasTxt}</span>
         ${linhaTooltip("Equipe", a.equipe.lider, a.equipe.vice)}
         ${linhaTooltip("Piloto", a.piloto.lider, a.piloto.vice)}`,
      )
      .style("left", `${virar ? Math.max(tx - 310, 0) : tx + 14}px`)
      .style("top", `${Math.max(ty - 20, 0)}px`)
      .style("opacity", 1);
  }

  g.append("g")
    .selectAll("rect")
    .data(anos)
    .join("rect")
    .attr("x", (a) => x(a.year)! - (passo - x.bandwidth()) / 2)
    .attr("width", passo)
    .attr("y", topo.equipe - alturaEra)
    .attr("height", topo.piloto + alturaBarras - topo.equipe + alturaEra)
    .attr("fill", "transparent")
    .style("cursor", "pointer")
    .on("mousemove", (event: MouseEvent, a: Ano) => mostrarTooltip(event, a))
    .on("mouseleave", () => {
      realce.attr("opacity", 0);
      tooltip.style("opacity", 0);
    })
    // Clique: a temporada vira o "ano" do estado (nao troca de aba).
    .on("click", (_e: unknown, a: Ano) => {
      setState({ ano: a.year });
      atualizarMarcacoes();
    });

  // --- brush: escolhe o periodo ---
  const gb = g.append("g").attr("transform", `translate(0,${topoBrush})`);
  gb.append("rect")
    .attr("width", w)
    .attr("height", alturaBrush)
    .attr("fill", "var(--paper)")
    .attr("stroke", "var(--line)");
  // Decadas como referencia dentro da faixa do brush
  const decadas = listaAnos.filter((a) => a % 10 === 0);
  gb.append("g")
    .selectAll("line")
    .data(decadas)
    .join("line")
    .attr("x1", (a) => x(a)! - (passo - x.bandwidth()) / 2)
    .attr("x2", (a) => x(a)! - (passo - x.bandwidth()) / 2)
    .attr("y2", alturaBrush)
    .attr("stroke", "var(--line)");
  gb.append("text")
    .attr("x", w / 2)
    .attr("y", alturaBrush / 2 + 4)
    .attr("text-anchor", "middle")
    .attr("font-size", "11px")
    .attr("fill", "var(--muted)")
    .attr("pointer-events", "none")
    .text("arraste aqui para escolher um período");
  gb.append("g")
    .attr("transform", `translate(0,${alturaBrush})`)
    .call(
      d3
        .axisBottom(x)
        .tickValues(decadas.concat(anoMax % 10 ? [anoMax] : []))
        .tickSize(4)
        .tickPadding(4),
    )
    .call((ax) => {
      ax.select(".domain").remove();
      ax.selectAll("text").attr("font-size", "10px").attr("fill", "var(--muted)");
      ax.selectAll("line").attr("stroke", "var(--muted)");
    });

  // pixel -> ano (banda sem padding externo: indice = px / passo)
  const anoEm = (px: number): number =>
    listaAnos[Math.max(0, Math.min(listaAnos.length - 1, Math.floor(px / passo)))];
  // periodo -> pixels, ocupando as bandas inteiras
  const pixelsDe = ([de, ate]: [number, number]): [number, number] => [
    listaAnos.indexOf(de) * passo,
    Math.min(w, (listaAnos.indexOf(ate) + 1) * passo), // a ultima banda nao passa da borda
  ];

  const brush = d3
    .brushX()
    .extent([[0, 0], [w, alturaBrush]])
    // Enquanto arrasta: so atualiza as marcacoes (barras fora do periodo esmaecem).
    .on("brush", (event: d3.D3BrushEvent<unknown>) => {
      if (!event.sourceEvent || !event.selection) return;
      const [s0, s1] = event.selection as [number, number];
      atualizarMarcacoes([anoEm(s0), anoEm(s1 - 1)]);
    })
    // Ao soltar: arredonda para temporadas inteiras e escreve no estado.
    .on("end", (event: d3.D3BrushEvent<unknown>) => {
      if (!event.sourceEvent) return; // movimento feito pelo codigo (brush.move)
      if (!event.selection) {
        // clique sem arrastar limpa: volta para o periodo inteiro
        setState({ periodo: [anoMin, anoMax] });
        atualizarMarcacoes();
        return;
      }
      const [s0, s1] = event.selection as [number, number];
      const periodo: [number, number] = [anoEm(s0), anoEm(s1 - 1)];
      setState({ periodo });
      gBrush.call(brush.move, pixelsDe(periodo));
      atualizarMarcacoes();
    });

  const gBrush = gb.append("g").call(brush);
  gBrush.select(".selection").attr("fill", "var(--red)").attr("fill-opacity", 0.12).attr("stroke", "var(--red)");

  // Ao abrir a aba, o brush ja mostra o periodo do estado (se nao for o inteiro).
  const [de0, ate0] = getState().periodo;
  if ((de0 !== anoMin || ate0 !== anoMax) && listaAnos.includes(de0) && listaAnos.includes(ate0)) {
    gBrush.call(brush.move, pixelsDe([de0, ate0]));
  }

  // --- legenda (HTML): hover destaca uma equipe ---
  legendaEl.style.display = "flex";
  legendaEl.style.flexWrap = "wrap";
  legendaEl.style.gap = "6px 14px";
  legendaEl.style.marginTop = "16px";
  legendaEl.style.fontSize = "0.85rem";
  const presentes = new Set(anos.flatMap((a) => [a.equipe.lider.equipe, a.piloto.lider.equipe]));
  const itensLegenda = Object.keys(CORES_EQUIPES)
    .filter((e) => presentes.has(e))
    .map((e) => ({ id: e as string | null, label: e, cor: CORES_EQUIPES[e] }));
  itensLegenda.push({ id: null, label: "Outras equipes", cor: COR_OUTRAS });
  for (const item of itensLegenda) {
    const span = document.createElement("span");
    span.style.display = "inline-flex";
    span.style.alignItems = "center";
    span.style.gap = "6px";
    span.style.cursor = item.id ? "pointer" : "default";
    span.innerHTML = `<span style="display:inline-block;width:12px;height:12px;border-radius:2px;background:${item.cor};"></span>${item.label}`;
    if (item.id) {
      span.addEventListener("mouseenter", () => {
        equipeEmDestaque = item.id;
        atualizarMarcacoes();
      });
      span.addEventListener("mouseleave", () => {
        equipeEmDestaque = null;
        atualizarMarcacoes();
      });
    }
    legendaEl.appendChild(span);
  }

  // --- status: o que as outras abas vao receber ---
  statusEl.className = "note";
  statusEl.style.display = "flex";
  statusEl.style.flexWrap = "wrap";
  statusEl.style.alignItems = "center";
  statusEl.style.gap = "8px 16px";
  statusEl.style.marginTop = "8px";
  const textoStatus = document.createElement("span");
  const limpar = document.createElement("button");
  limpar.type = "button";
  limpar.textContent = "Todo o período";
  limpar.style.padding = "4px 12px";
  limpar.style.fontSize = "0.85rem";
  limpar.style.border = "1px solid var(--line)";
  limpar.style.borderRadius = "4px";
  limpar.style.background = "var(--card)";
  limpar.style.color = "var(--ink)";
  limpar.style.cursor = "pointer";
  limpar.addEventListener("click", () => {
    setState({ periodo: [anoMin, anoMax] });
    gBrush.call(brush.move, null);
    atualizarMarcacoes();
  });
  statusEl.append(textoStatus, limpar);

  // Atualiza opacidade (periodo + legenda), contorno do ano selecionado e o status.
  // `periodoProvisorio` e o periodo durante o arraste, antes de ir para o estado.
  function atualizarMarcacoes(periodoProvisorio?: [number, number]): void {
    const [de, ate] = periodoProvisorio ?? getState().periodo;
    const anoSel = getState().ano;
    for (const faixa of faixas) {
      barras[faixa]
        .attr("fill-opacity", (a) => {
          const noPeriodo = a.year >= de && a.year <= ate;
          const destacada = equipeEmDestaque === null || a[faixa].lider.equipe === equipeEmDestaque;
          return noPeriodo && destacada ? 1 : 0.18;
        })
        .attr("stroke", (a) =>
          a.year === anoSel ? "var(--ink)" : a.calendario > a.corridas ? "var(--muted)" : "none",
        )
        .attr("stroke-width", (a) => (a.year === anoSel ? 2 : 1));
    }
    const inteiro = de === anoMin && ate === anoMax;
    textoStatus.innerHTML =
      `Período: <strong style="color:var(--ink)">${de}–${ate}</strong>` +
      (inteiro ? " (todas as temporadas)" : " · já chega filtrado na aba Ranking") +
      (anoSel !== null
        ? ` · Temporada escolhida: <strong style="color:var(--ink)">${anoSel}</strong>`
        : " · clique numa barra para escolher uma temporada");
    limpar.style.display = inteiro ? "none" : "";
  }

  atualizarMarcacoes();
}
