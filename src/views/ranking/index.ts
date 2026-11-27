// Aba 2 - Ranking de dominio
// Comparação entre os 10 pilotos ou construtores mais dominantes em um período, segundo 
// seus percentuais de vitórias, pódios ou posição média.
//
// Modelo de dados:
//   Pilotos: results + races + drivers
//   Construtores: results + races + constructors
//      Para os construtores, cada GP é contado apenas uma vez, mesmo que mais de um
//      piloto da equipe tenha participado.
//
// Métricas:
//    - % de vitórias: vitórias / corridas disputadas * 100
//    - % de pódios: pódios / corridas disputadas * 100
//    - Posição média: média das posições finais válidas
//  Não utiliza pontos, porque o sistema de pontuação mudou ao longo da história
//  Resultados sem posição válida não entram no cálculo da posição média
//
// Cor:
//   A cor é utilizada apenas como destaque visual, não representa nenhuma equipe ou piloto específico.
//
// Gráfico:
//   Barras horizontais comparando os 10 pilotos ou construtores mais bem
//   classificados dentro da métrica selecionada.
//     - Métricas percentuais: quanto maior o valor, melhor a classificação
//     - Posição média: quanto menor o valor, melhor a classificação
//   OBS: Empates no limite do Top 10 também são incluídos
//
// Interação:
//   - alternador Pilotos/Construtores
//   - alternador de métricas
//   - período: acompanha o estado compartilhado pelo gráfico de Timeline
//       (Se uma temporada específica estiver selecionada (ano != null), considera
//        apenas aquela temporada. Caso contrário, utiliza o intervalo selecionado.)
//   - hover: traz um tooltip com informações detalhadas sobre o participante, 
//     incluindo número de corridas, vitórias, pódios, taxa de vitórias, taxa de pódios e posição média
//   - hover: destaca a barra sobre a qual o mouse está posicionado, esmaecendo as demais
//
// Pendências:
//   - TODO: redesenhar o gráfico ao redimensionar a janela (a v1 mede o container 1x)

import * as d3 from "d3";
import { dataReady } from "../../data/load.ts";
import { queryRows } from "../../utils/duckdb.ts";
import { getState, onStateChange } from "../../state.ts";

type RankingEntity = "drivers" | "constructors";

type RankingMetric = "winRate" | "podiumRate" | "avgPosition";

interface RankingRow {
  id: number;
  name: string;
  races: number;
  wins: number;
  podiums: number;
  winRate: number;
  podiumRate: number;
  avgPosition: number | null;
}

const TOP_N = 10;
const COR_RANKING = "#e10600";

async function getRankingData(
  entity: RankingEntity,
  startYear: number,
  endYear: number,
): Promise<RankingRow[]> {
  await dataReady();

  // A consulta muda conforme a entidade selecionada
  const sql =
    entity === "drivers"
      ? `
        SELECT
          d.driverId AS id,
          CONCAT(d.forename, ' ', d.surname) AS name,
          COUNT(*) AS races,
          CAST(
            SUM(CASE WHEN r.positionOrder = 1 THEN 1 ELSE 0 END)
            AS BIGINT
          ) AS wins,
          CAST(
            SUM(CASE WHEN r.positionOrder BETWEEN 1 AND 3 THEN 1 ELSE 0 END)
            AS BIGINT
          ) AS podiums,
          100.0 * SUM(CASE WHEN r.positionOrder = 1 THEN 1 ELSE 0 END)
            / COUNT(*) AS winRate,
          100.0 * SUM(CASE WHEN r.positionOrder BETWEEN 1 AND 3 THEN 1 ELSE 0 END)
            / COUNT(*) AS podiumRate,
          AVG(TRY_CAST(r.position AS INTEGER)) AS avgPosition
        FROM results r
        JOIN races ra ON ra.raceId = r.raceId
        JOIN drivers d ON d.driverId = r.driverId
        WHERE ra.year BETWEEN ${startYear} AND ${endYear}
        GROUP BY d.driverId, d.forename, d.surname
        ORDER BY winRate DESC
      `
      : `
        WITH constructor_races AS (
          SELECT
            c.constructorId AS id,
            c.name AS name,
            r.raceId,
            MAX(CASE WHEN r.positionOrder = 1 THEN 1 ELSE 0 END) AS won,
            MAX(CASE WHEN r.positionOrder BETWEEN 1 AND 3 THEN 1 ELSE 0 END) AS podium,
            MIN(TRY_CAST(r.position AS INTEGER)) AS bestPosition
          FROM results r
          JOIN races ra ON ra.raceId = r.raceId
          JOIN constructors c ON c.constructorId = r.constructorId
          WHERE ra.year BETWEEN ${startYear} AND ${endYear}
          GROUP BY c.constructorId, c.name, r.raceId
        )
        SELECT
          id,
          name,
          COUNT(*) AS races,
          CAST(SUM(won) AS BIGINT) AS wins,
          CAST(SUM(podium) AS BIGINT) AS podiums,
          100.0 * CAST(SUM(won) AS BIGINT) / COUNT(*) AS winRate,
          100.0 * CAST(SUM(podium) AS BIGINT) / COUNT(*) AS podiumRate,
          AVG(bestPosition) AS avgPosition
        FROM constructor_races
        GROUP BY id, name
        ORDER BY winRate DESC 
      `;

  return queryRows<RankingRow>(sql);
}


export async function renderRanking(target: HTMLElement): Promise<void> {
  //estado local dos controles
  let entidade: RankingEntity = "drivers";
  let metrica: RankingMetric = "winRate";

  // identificador das renderizações
  // Evita que consultas antigas sobrescrevam resultados mais recentes
  let drawId = 0;

  target.innerHTML = "";
  const cabecalho = document.createElement("div");

  cabecalho.innerHTML = `
    <p class="question">
      Dentro de um período, quem foi mais dominante?
    </p>

    <ul class="note" style="margin: -12px 0 0; padding-left: 18px;">
      <li>
        O ranking apresenta os 10 pilotos ou construtores mais bem classificados na métrica selecionada. 
        Quanto maior a taxa de vitórias ou pódios, melhor. Para a posição média, quanto menor o valor, melhor.
      </li>
      <li>
        Construtores são contabilizados uma única vez por GP, mesmo quando mais de um piloto da equipe 
        participa. Para cada corrida, considera-se o melhor resultado de seus pilotos no cálculo da posição 
        média.
      </li>
      <li>
        Não são utilizados pontos na comparação histórica, pois o sistema de pontuação mudou ao longo 
        das temporadas. A posição média considera apenas resultados com posições válidas.
      </li>
      <li>
        A seleção de uma temporada na Timeline prevalece sobre o intervalo de anos. Sem uma temporada específica 
        selecionada, o ranking considera todo o período escolhido.
      </li>
    </ul>
  `;

  target.appendChild(cabecalho);

  // Captura info do período selecionado na "Timeline"
  const periodLabel = document.createElement("p");
  periodLabel.className = "note";
  periodLabel.style.marginTop = "16px";
  target.appendChild(periodLabel);

  const controls = document.createElement("div");
  target.appendChild(controls);

  const chartContainer = document.createElement("div");
  chartContainer.style.marginTop = "16px";
  target.appendChild(chartContainer);

  // Criar o grupo de botões para filtro de entidade e métrica
  function alternador<T extends string>(
    opcoes: Array<{ id: T; label: string }>,
    atual: T,
    aoTrocar: (novo: T) => void,
  ): HTMLSpanElement {
    const grupo = document.createElement("span");
    grupo.style.display = "inline-flex";

    opcoes.forEach((op, index) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = op.label;

      const ativo = op.id === atual;

      btn.style.padding = "5px 12px";
      btn.style.fontSize = "0.85rem";
      btn.style.border = "1px solid var(--line)";

      btn.style.borderRadius =
        index === 0
          ? "4px 0 0 4px"
          : index === opcoes.length - 1
            ? "0 4px 4px 0"
            : "0";

      btn.style.background = ativo
        ? "var(--asphalt)"
        : "var(--card)";

      btn.style.color = ativo
        ? "#fff"
        : "var(--ink)";

      btn.style.fontWeight = ativo ? "600" : "400";
      btn.style.cursor = "pointer";

      btn.addEventListener("click", () => {
        if (op.id === atual) return;

        aoTrocar(op.id);

        montarControles();
        draw();
      });

      grupo.appendChild(btn);
    });

    return grupo;
  }

  function montarControles(): void {
    controls.innerHTML = "";

    controls.style.display = "flex";
    controls.style.gap = "12px";
    controls.style.alignItems = "center";
    controls.style.marginTop = "16px";
    controls.style.flexWrap = "wrap";

    // Alternador entre pilotos e construtores
    controls.appendChild(
      alternador<RankingEntity>(
        [
          { id: "drivers", label: "Pilotos" },
          { id: "constructors", label: "Construtores" },
        ],
        entidade,
        (novo) => {
          entidade = novo;
        },
      ),
    );

    // Alternador entre as métricas do ranking
    controls.appendChild(
      alternador<RankingMetric>(
        [
          { id: "winRate", label: "Vitórias" },
          { id: "podiumRate", label: "Pódios" },
          { id: "avgPosition", label: "Posição média" },
        ],
        metrica,
        (novo) => {
          metrica = novo;
        },
      ),
    );
  }

  async function draw(): Promise<void> {
    const currentDraw = ++drawId;

    // Recupera o período compartilhado com as outras abas
    const state = getState();

    // Se houver uma temporada específica selecionada na Timeline,
    // ela tem prioridade sobre o intervalo do brush
    const [startYear, endYear] =
      state.ano !== null
        ? [state.ano, state.ano]
        : state.periodo;

    periodLabel.textContent =
      startYear === endYear
        ? `Temporada selecionada: ${startYear}`
        : `Período selecionado: ${startYear}–${endYear}`;

    // Exibe uma mensagem enquanto a consulta é executada
    chartContainer.innerHTML =
      "<p class='note'>Carregando dados...</p>";

    try {
      const data = await getRankingData(
        entidade,
        startYear,
        endYear,
      );

      // Descarta o resultado caso outra renderização tenha começado
      if (currentDraw !== drawId) return;

      // Ordena os participantes e seleciona o Top 10
      const ranking = getTopRanking(data, metrica);

      if (ranking.length === 0) {
        chartContainer.innerHTML = `
          <p class="note">
            Nenhum resultado encontrado para esse período.
          </p>
        `;
        return;
      }

      // Desenha o gráfico com os dados filtrados
      drawChart(
        chartContainer,
        ranking,
        metrica,
        entidade,
      );
    } catch (error) {
      if (currentDraw !== drawId) return;

      console.error("Erro ao carregar ranking:", error);

      chartContainer.innerHTML = `
        <p class="note">
          Não foi possível carregar os dados do ranking.
        </p>
      `;
    }
  }

  // Registra o listener para acompanhar alterações na Timeline
  // Quando o período ou a temporada mudar, o gráfico será atualizado
  onStateChange(() => {
    draw();
  });

  montarControles();
  draw();
}

// Seleciona os dez melhores participantes de acordo com a métrica
// Em caso de empate na décima posição, todos os empatados são mantidos
function getTopRanking(
  data: RankingRow[],
  metric: RankingMetric,
): RankingRow[] {
  const validData = data.filter((row) => {
    return getMetricValue(row, metric) !== null;
  });

  // Ordena de acordo com o sentido da métrica
  const sorted = [...validData].sort((a, b) => {
    const valueA = getMetricValue(a, metric)!;
    const valueB = getMetricValue(b, metric)!;

    // Na posição média, o menor valor é o melhor
    if (metric === "avgPosition") {
      return valueA - valueB;
    }

    // Nas taxas, o maior valor é o melhor
    return valueB - valueA;
  });

  if (sorted.length <= TOP_N) return sorted;

  const top = sorted.slice(0, TOP_N);
  const limite = getMetricValue(top[TOP_N - 1], metric)!;

  return sorted.filter((row) => {
    const value = getMetricValue(row, metric)!;

    return Math.abs(value - limite) < 0.000001 ||
      (metric === "avgPosition"
        ? value < limite
        : value > limite);
  });
}

// Recupera o valor correspondente à métrica selecionada
function getMetricValue(
  row: RankingRow,
  metric: RankingMetric,
): number | null {
  if (metric === "avgPosition") {
    return row.avgPosition;
  }

  return row[metric];
}

// Formata os valores apresentados ao lado das barras
function formatValue(
  value: number,
  metric: RankingMetric,
): string {
  if (metric === "avgPosition") {
    return value.toFixed(2);
  }

  return `${value.toFixed(1)}%`;
}

// Desenha o gráfico
function drawChart(
  target: HTMLElement,
  data: RankingRow[],
  metric: RankingMetric,
  entity: RankingEntity,
): void {
  target.innerHTML = "";

  const margin = {
    top: 20,
    right: 75,
    bottom: 35,
    left: entity === "constructors" ? 150 : 125,
  };

  const width = Math.max(target.clientWidth || 700, 400);
  const barHeight = 28;
  const barGap = 12;

  const height =
    margin.top +
    margin.bottom +
    data.length * (barHeight + barGap);

  // COnsidera a posição relativa para posicionar o tooltip em relação ao container do gráfico
  target.style.position = "relative";

  // Criar tooltip
  // Inicia como elemento invisível e aparece só quando o mouse passa sobre uma barra
  const tooltip = d3
    .select(target)
    .append("div")
    .style("position", "absolute")
    .style("visibility", "hidden")
    .style("background", "var(--asphalt)")
    .style("color", "#fff")
    .style("padding", "10px 14px")
    .style("border-radius", "6px")
    .style("font-size", "12px")
    .style("line-height", "1.6")
    .style("pointer-events", "none")
    .style("z-index", "10")
    .style("box-shadow", "0 3px 10px rgba(0, 0, 0, 0.25)");

  // Escala horizontal = valores das métricas
  const values = data.map((row) => getMetricValue(row, metric)!);
  const maxValue = d3.max(values) ?? 0;

  const x = d3
    .scaleLinear()
    .domain([0, maxValue * 1.15 || 1])
    .range([0, width - margin.left - margin.right]);

  // Escala vertical = participantes do ranking
  const y = d3
    .scaleBand<number>()
    .domain(data.map((row) => row.id))
    .range([margin.top, height - margin.bottom])
    .padding(0.2);

  const svg = d3
    .select(target)
    .append("svg")
    .attr("width", "100%")
    .attr("viewBox", `0 0 ${width} ${height}`)
    .attr("role", "img")
    .attr(
      "aria-label",
      `Ranking de ${entity === "drivers" ? "pilotos" : "construtores"}`,
    )
    .style("font-family", "var(--font-body)");

  const chart = svg
    .append("g")
    .attr("transform", `translate(${margin.left}, 0)`);

  // Eixo horizontal com formatação específica para cada métrica
  const xAxis = d3
    .axisBottom(x)
    .ticks(5)
    .tickFormat((value) =>
      metric === "avgPosition"
        ? String(value)
        : `${value}%`,
    );

  chart
    .append("g")
    .attr("transform", `translate(0, ${height - margin.bottom})`)
    .call(xAxis)
    .call((axis) => {
      axis.select(".domain").attr("stroke", "var(--line)");

      axis
        .selectAll("text")
        .attr("fill", "var(--muted)")
        .attr("font-size", "11px");
    });

  // Barras do ranking
  chart
    .selectAll<SVGRectElement, RankingRow>(".ranking-bar")
    .data(data)
    .join("rect")
    .attr("class", "ranking-bar")
    .attr("x", 0)
    .attr("y", (row) => y(row.id)!)
    .attr("width", (row) => x(getMetricValue(row, metric)!))
    .attr("height", y.bandwidth())
    .attr("rx", 3)
    .attr("fill", COR_RANKING)

    // HOVER: destaca a barra sobre a qual o mouse está posicionado
    .on("mouseover", function (event, row) {
      // Esmaecer todas as barras
      chart
        .selectAll<SVGRectElement, RankingRow>(".ranking-bar")
        .transition()
        .duration(150)
        .style("opacity", 0.25);

      // Manter a barra selecionada totalmente visível
      d3.select(this)
        .transition()
        .duration(150)
        .style("opacity", 1);

      // Preparar o conteúdo do tooltip com as informações do participante
      tooltip
        .style("visibility", "visible")
        .html(`
          <strong>${row.name}</strong>
          <hr style="border: 0; border-top: 1px solid #666; margin: 6px 0;">
          <div>Corridas: ${row.races}</div>
          <div>Vitórias: ${row.wins}</div>
          <div>Pódios: ${row.podiums}</div>
          <div>Taxa de vitórias: ${row.winRate.toFixed(1)}%</div>
          <div>Taxa de pódios: ${row.podiumRate.toFixed(1)}%</div>
          <div>Posição média: ${row.avgPosition?.toFixed(2) ?? "N/A"}</div>
        `);
    })

    // HOVER: acompanha o cursor com o tooltip
    .on("mousemove", function (event) {
      // Converte a posição do mouse para coordenadas relativas ao gráfico
      const [mouseX, mouseY] = d3.pointer(event, target);

      tooltip
        .style("left", `${mouseX + 15}px`)
        .style("top", `${mouseY + 15}px`);
    })

    // HOVER: restaura as barras e esconde o tooltip ao sair
    .on("mouseout", function () {
      chart
        .selectAll<SVGRectElement, RankingRow>(".ranking-bar")
        .transition()
        .duration(150)
        .style("opacity", 1);

      tooltip.style("visibility", "hidden");
    });

  // Nomes dos pilotos ou construtores à esquerda das barras
  svg
    .append("g")
    .selectAll<SVGTextElement, RankingRow>(".ranking-name")
    .data(data)
    .join("text")
    .attr("class", "ranking-name")
    .attr("x", margin.left - 10)
    .attr("y", (row) => y(row.id)! + y.bandwidth() / 2)
    .attr("text-anchor", "end")
    .attr("dominant-baseline", "middle")
    .attr("font-size", "12px")
    .attr("fill", "var(--ink)")
    .text((row) => row.name);

  // Valores das métricas ao lado de cada barra
  chart
    .selectAll<SVGTextElement, RankingRow>(".ranking-value")
    .data(data)
    .join("text")
    .attr("class", "ranking-value")
    .attr("x", (row) => x(getMetricValue(row, metric)!) + 7)
    .attr("y", (row) => y(row.id)! + y.bandwidth() / 2)
    .attr("dominant-baseline", "middle")
    .attr("font-size", "12px")
    .attr("fill", "var(--ink)")
    .text((row) =>
      formatValue(getMetricValue(row, metric)!, metric),
    );
}