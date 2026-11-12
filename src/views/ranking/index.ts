// Aba 2 - Ranking de dominio
// Por enquanto so mostra as instrucoes. Ao comecar: apague o renderGuide()
// e desenhe com D3 dentro de `target`.
import { renderGuide } from "../../components/Guide.ts";

export function renderRanking(target: HTMLElement): void {
  renderGuide(target, {
    pergunta: "Dentro de um período, quem foi mais dominante?",
    mostrar: [
      "Pilotos/equipes comparados por % de vitórias, % de pódios e posição média de chegada",
      "Os % sobre as corridas que cada piloto disputou no período, não sobre o total",
      "Sem pontos: o sistema de pontuação mudou várias vezes",
    ],
    interacao: [
      "Trocar a métrica de comparação",
      "Período vem da linha do tempo",
    ],
    estado: "Lê: getState().periodo. Para reagir a mudanças: onStateChange(() => desenhar()).",
    tabelas: ["results", "races", "drivers", "constructors", "status"],
    pasta: "src/views/ranking/",
  });
}
