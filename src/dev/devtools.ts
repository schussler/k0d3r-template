import type { Game } from '../game/game';

/**
 * Ferramentas só de desenvolvimento (não entram no build): painel F3 de desempenho e o gancho `window.__kepler`
 * usado pelo teste de ponta a ponta.
 */
export interface KeplerHook {
  testMode(on: boolean): void;
  state(): Record<string, unknown>;
  giveAll(): void;
  key(code: string, down: boolean): void;
  mouse(down: boolean): void;
  start(): void;
}

declare global {
  interface Window {
    __kepler?: KeplerHook;
  }
}

export function installDevtools(game: Game): void {
  const panel = document.createElement('div');
  panel.className = 'devpanel hidden';
  document.body.appendChild(panel);
  let frames = 0;
  let acc = 0;
  let last = performance.now();
  const tick = () => {
    const now = performance.now();
    acc += now - last;
    last = now;
    frames++;
    if (acc > 500 && !panel.classList.contains('hidden')) {
      const info = game.renderer.info;
      panel.textContent = [
        `fps ${(frames / (acc / 1000)).toFixed(0)}  quadro ${(acc / frames).toFixed(1)} ms`,
        `draw calls ${info.render.calls}  triângulos ${info.render.triangles}`,
        `geometrias ${info.memory.geometries}  texturas ${info.memory.textures}`,
        `pixel ratio ${game.renderer.getPixelRatio().toFixed(2)}  modo ${game.mode}`,
      ].join('\n');
      frames = 0;
      acc = 0;
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  document.addEventListener('keydown', (e) => {
    if (e.code === 'F3') {
      e.preventDefault();
      panel.classList.toggle('hidden');
    }
  });

  window.__kepler = {
    testMode: (on) => {
      game.input.testMode = on;
    },
    state: () => ({
      mode: game.mode,
      weapon: game.rig.arsenal.current,
      owned: game.rig.arsenal.owned,
      mag: game.rig.arsenal.guns[game.rig.arsenal.current].mag,
      health: game.health,
      shield: game.shield,
      calls: game.renderer.info.render.calls,
    }),
    giveAll: () => game.giveAll(),
    key: (code, down) => game.input.simulateKey(code, down),
    mouse: (down) => game.input.simulateMouse(down),
    start: () => {
      game.input.testMode = true;
      const btn = document.querySelector<HTMLElement>('[data-action="play"]');
      btn?.click();
    },
  };
}
