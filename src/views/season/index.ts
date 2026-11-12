// Aba 3 - Temporada corrida a corrida
// Por enquanto so mostra as instrucoes. Ao comecar: apague o renderGuide()
// e desenhe com D3 dentro de `target`.
import { renderGuide } from "../../components/Guide.ts";

export function renderSeason(target: HTMLElement): void {
  renderGuide(target, {
    pergunta: "Como o campeonato de uma temporada evoluiu, corrida a corrida?",
    mostrar: [
      "Pontuação acumulada de pilotos e de construtores, rodada a rodada",
      "Pontos oficiais do dataset: dentro de uma temporada o sistema é um só",
    ],
    interacao: [
      "Escolher a temporada (ou chegar já com ela escolhida na linha do tempo)",
      "Alternar entre pilotos e construtores",
    ],
    estado: "Lê: getState().ano. Se for null, peça para escolher um ano.",
    tabelas: ["driver_standings", "constructor_standings", "races", "drivers", "constructors"],
    pasta: "src/views/season/",
  });
}
