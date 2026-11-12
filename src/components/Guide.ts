// Cartao de instrucoes que ocupa a aba enquanto a view nao existe.
// Quando for implementar sua view, e so apagar a chamada renderGuide()
// no index.ts da sua pasta e desenhar com D3 no lugar.

export interface GuideInfo {
  pergunta: string;      // a pergunta de analise que a view responde
  mostrar: string[];     // o que a view deve mostrar
  interacao: string[];   // o que o usuario faz e o que acontece
  estado: string;        // como a view usa o state.ts
  tabelas: string[];     // tabelas do DuckDB mais uteis
  pasta: string;         // onde mexer
}

export function renderGuide(target: HTMLElement, info: GuideInfo): void {
  const lista = (itens: string[]) => `<ul>${itens.map((i) => `<li>${i}</li>`).join("")}</ul>`;

  target.innerHTML = `
    <p class="question">${info.pergunta}</p>
    <div class="guide">
      <section class="card">
        <h3>O que mostrar</h3>
        ${lista(info.mostrar)}
      </section>
      <section class="card">
        <h3>Interação</h3>
        ${lista(info.interacao)}
        <p class="note">${info.estado}</p>
      </section>
      <section class="card">
        <h3>Dados</h3>
        <p>${info.tabelas.map((t) => `<code>${t}</code>`).join(" ")}</p>
        <p class="note">Consulte com <code>queryRows</code> (<code>src/utils/duckdb.ts</code>). Agregue no SQL; o D3 só desenha.</p>
      </section>
      <section class="card">
        <h3>Onde mexer</h3>
        <p><code>${info.pasta}</code></p>
        <p class="note">Só nessa pasta. Arquivos compartilhados: combine com o grupo.</p>
      </section>
    </div>
    <div class="chart-slot">o gráfico entra aqui</div>
  `;
}
