import './style.css';
import { installDebug } from './game/debug';
import { Game } from './game/game';
import { WebGLUnavailableError } from './engine/renderer';

function fail(title: string, message: string): void {
  const overlay = document.getElementById('overlay');
  if (!overlay) return;
  overlay.innerHTML = `<div class="screens active"><div class="screen"><div class="menu error"><h2></h2><p></p></div></div></div>`;
  (overlay.querySelector('h2') as HTMLElement).textContent = title;
  (overlay.querySelector('p') as HTMLElement).textContent = message;
}

function boot(): void {
  const canvas = document.getElementById('game');
  const overlay = document.getElementById('overlay');
  if (!(canvas instanceof HTMLCanvasElement) || !overlay) throw new Error('página sem #game ou #overlay');
  try {
    const game = new Game(canvas, overlay);
    if (new URLSearchParams(window.location.search).has('debug')) installDebug(game);
  } catch (err: unknown) {
    if (err instanceof WebGLUnavailableError) {
      console.warn('[kepler] WebGL 2 indisponível neste navegador');
      fail('WebGL indisponível', 'A Estação Kepler precisa de WebGL 2. Ative a aceleração de hardware ou use um navegador atualizado.');
      return;
    }
    console.error('[kepler] falha ao iniciar', err);
    fail('Falha ao iniciar', err instanceof Error ? err.message : String(err));
  }
}

boot();
