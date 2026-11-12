// Navegacao por abas: propositalmente simples, sem roteador.
// Mesma ideia do trabalho 1: cada aba e uma funcao render que recebe um
// container vazio e desenha dentro dele.
import { clearListeners } from "../state.ts";

export interface Tab {
  id: string;
  label: string;
  render: (container: HTMLElement) => void;
}

export function createTabs(nav: HTMLElement, content: HTMLElement, tabs: Tab[]): void {
  let activeId: string | null = null;

  const buttons = tabs.map((tab, i) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.role = "tab";
    btn.className = "tab";
    // numero da aba no estilo "posicao na torre de tempos": 01, 02, 03
    btn.innerHTML = `<span class="tab-pos">${String(i + 1).padStart(2, "0")}</span>${tab.label}`;
    btn.dataset.tabId = tab.id;
    btn.addEventListener("click", () => select(tab.id));
    nav.appendChild(btn);
    return btn;
  });

  function select(id: string): void {
    if (id === activeId) return;
    activeId = id;
    for (const b of buttons) {
      const selected = b.dataset.tabId === id;
      b.classList.toggle("active", selected);
      b.setAttribute("aria-selected", String(selected));
    }
    // Limpa a aba anterior: o HTML e quem estava ouvindo o estado.
    // O estado (periodo, ano) continua, entao a proxima aba ja abre filtrada.
    content.innerHTML = "";
    clearListeners();
    const tab = tabs.find((t) => t.id === id);
    tab?.render(content);
  }

  select(tabs[0].id);
}
