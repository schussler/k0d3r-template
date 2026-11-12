import './style.css';
import { Game } from './game/game';
import { startLoop } from './game/loop';

/** Entrada: confere WebGL, cria o jogo e liga o laço. Sem WebGL, explica em vez de mostrar tela branca. */
function hasWebGL(): boolean {
  try {
    const c = document.createElement('canvas');
    return Boolean(c.getContext('webgl2') ?? c.getContext('webgl'));
  } catch (err) {
    console.warn('Falha ao testar WebGL.', err);
    return false;
  }
}

function showFatal(root: HTMLElement, title: string, body: string): void {
  root.innerHTML = `<div class="screen"><div class="card"><div class="kicker">ESTAÇÃO KEPLER</div><h1>${title}</h1><p class="body">${body}</p></div></div>`;
}

const root = document.getElementById('app');
if (!root) throw new Error('Elemento #app ausente no index.html');

if (!hasWebGL()) {
  showFatal(root, 'WEBGL INDISPONÍVEL', 'Este jogo precisa de WebGL. Ative a aceleração de hardware no navegador ou use um navegador atualizado.');
} else {
  const game = new Game(root);
  startLoop((dt, now) => game.frame(dt, now), (err) => game.fail(err));
  if (import.meta.env.DEV) {
    void import('./dev/devtools').then((m) => m.installDevtools(game));
  }
}
