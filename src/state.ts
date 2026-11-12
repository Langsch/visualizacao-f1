// Estado compartilhado entre as abas: e isso que faz a coordenacao.
// Uma aba muda o estado com setState(); quem chamou onStateChange()
// e avisado e se redesenha. Ao trocar de aba o estado continua,
// entao o periodo escolhido na linha do tempo ja filtra o ranking.
//
//   periodo: intervalo de anos selecionado no brush da linha do tempo
//   ano:     temporada clicada (null = nenhuma)

export interface State {
  periodo: [number, number];
  ano: number | null;
}

const state: State = {
  periodo: [1950, 2026],
  ano: null,
};

const listeners: Array<(s: State) => void> = [];

export function getState(): State {
  return state;
}

export function setState(changes: Partial<State>): void {
  Object.assign(state, changes);
  for (const fn of listeners) fn(state);
}

export function onStateChange(fn: (s: State) => void): void {
  listeners.push(fn);
}

// Chamado pelo Tabs.ts na troca de aba: a aba que saiu nao escuta mais.
export function clearListeners(): void {
  listeners.length = 0;
}
