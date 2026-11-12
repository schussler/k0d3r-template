import type { Game } from '../game/game';

/**
 * Ferramentas só de desenvolvimento (não entram no build): painel F3 de desempenho e o gancho `window.__kepler`
 * usado pelo teste de ponta a ponta.
 */
export interface KeplerHook {
  testMode(on: boolean): void;
  state(): Record<string, unknown>;
  giveAll(): void;
  killAll(): void;
  god(on: boolean): void;
  teleport(x: number, z: number): void;
  aim(x: number, y: number, z: number): void;
  robots(): { kind: string; x: number; y: number; z: number; mode: string; health: number }[];
  jump(sector: number): void;
  flow(): Record<string, unknown>;
  switches(): { index: number; x: number; z: number; pressed: boolean; stand: { x: number; z: number } }[];
  pause(): void;
  hurt(amount: number): void;
  exit(): { x: number; z: number } | null;
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
      health: game.vitals.health,
      shield: game.vitals.shield,
      enemies: game.director.aliveCount,
      calls: game.renderer.info.render.calls,
    }),
    jump: (sector) => game.jumpToSector(sector),
    flow: () => game.devState,
    switches: () => game.switchPositions,
    pause: () => game.devPause(),
    hurt: (amount) => game.devHurt(amount),
    exit: () => game.exitPosition,
    giveAll: () => game.giveAll(),
    killAll: () => game.killAll(),
    god: (on) => {
      game.god = on;
    },
    teleport: (x, z) => game.rig.controller.place(x, z, game.rig.controller.yaw),
    aim: (x, y, z) => {
      const c = game.rig.controller;
      const dx = x - c.x;
      const dz = z - c.z;
      c.yaw = Math.atan2(-dx, -dz);
      c.pitch = Math.atan2(y - c.eyeY, Math.hypot(dx, dz));
    },
    robots: () => game.director.robots.map((r) => ({ kind: r.kind, x: r.x, y: r.y, z: r.z, mode: r.mem.mode, health: r.health })),
    key: (code, down) => game.input.simulateKey(code, down),
    mouse: (down) => game.input.simulateMouse(down),
    start: () => {
      game.input.testMode = true;
      const btn = document.querySelector<HTMLElement>('[data-action="play"]');
      btn?.click();
    },
  };
}
