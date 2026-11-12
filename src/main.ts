import './style.css';
import { Game } from './game/game';
import { startLoop } from './game/loop';
import { escapeHtml } from './ui/screens';

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
  root.innerHTML = `<div class="screen"><div class="card"><div class="kicker">ESTAÇÃO KEPLER</div><h1>${escapeHtml(title)}</h1><p class="body">${escapeHtml(body)}</p></div></div>`;
}

const describe = (err: unknown): string => (err instanceof Error ? err.message : String(err));

const root = document.getElementById('app');
if (!root) throw new Error('Elemento #app ausente no index.html');

if (!hasWebGL()) {
  showFatal(root, 'WEBGL INDISPONÍVEL', 'Este jogo precisa de WebGL. Ative a aceleração de hardware no navegador ou use um navegador atualizado.');
} else {
  try {
    const game = new Game(root);
    // Qualquer erro fora do laço (promessa rejeitada, evento) também vai para a tela de erro, nunca só para o console.
    window.addEventListener('unhandledrejection', (e) => game.fail(e.reason));
    window.addEventListener('error', (e) => game.fail(e.error ?? e.message));
    game.renderer.domElement.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      game.fail(new Error('A placa de vídeo derrubou o contexto gráfico.'));
    });
    startLoop((dt, now) => game.frame(dt, now), (err) => game.fail(err));
    if (import.meta.env.DEV) {
      void import('./dev/devtools').then((m) => m.installDevtools(game));
    }
  } catch (err) {
    console.error('Falha ao iniciar o jogo.', err);
    showFatal(root, 'NÃO FOI POSSÍVEL INICIAR', `${describe(err)}. Recarregue a página; se persistir, ative a aceleração de hardware no navegador.`);
  }
}
