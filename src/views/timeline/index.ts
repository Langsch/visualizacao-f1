// Aba 1 - Linha do tempo 1950-2026
// Por enquanto so mostra as instrucoes. Ao comecar: apague o renderGuide()
// e desenhe com D3 dentro de `target`.
import { renderGuide } from "../../components/Guide.ts";

export function renderTimeline(target: HTMLElement): void {
  renderGuide(target, {
    pergunta: "Quais equipes e pilotos dominaram cada época, e por quanto tempo?",
    mostrar: [
      "Uma marca por temporada, de 1950 a 2026",
      "Equipe e piloto com mais vitórias em cada ano",
      "Visão geral: é a porta de entrada do sistema",
    ],
    interacao: [
      "Brush para selecionar um período",
      "Clique numa temporada para abrir o detalhe dela",
    ],
    estado: "Escreve: setState({ periodo: [de, ate] }) e setState({ ano }).",
    tabelas: ["races", "results", "drivers", "constructors"],
    pasta: "src/views/timeline/",
  });
}
