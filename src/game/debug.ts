import * as THREE from 'three';
import { giveWeapon, stepArsenal, type WeaponId } from '../logic/weapons';
import type { Game } from './game';

export interface KeplerDebug {
  info(): DebugInfo;
  start(): void;
  activateSwitches(): void;
  teleportToExit(): void;
  teleport(x: number, z: number): void;
  killAll(): void;
  damageBoss(fraction: number): void;
  setGodMode(on: boolean): void;
  shootNearest(weapon?: WeaponId): boolean;
  hurt(amount: number): void;
  retry(): void;
  pause(): void;
  giveAll(): void;
  equip(weapon: WeaponId): void;
  lookAt(x: number, y: number, z: number): void;
  enemyPositions(): { kind: string; x: number; y: number; z: number; state: string }[];
}

export interface DebugInfo {
  readonly state: string;
  readonly sector: string;
  readonly health: number;
  readonly shield: number;
  readonly enemies: number;
  readonly enemyKinds: Record<string, number>;
  readonly boss: number | null;
  readonly maxStuck: number;
  readonly bossPhase: number | null;
  readonly doorsOpen: boolean;
  readonly elapsed: number;
  readonly weapon: string;
  readonly mag: number;
  readonly fps: number;
  readonly drawCalls: number;
  readonly triangles: number;
}

declare global {
  interface Window {
    __kepler?: KeplerDebug;
  }
}

/**
 * Gancho de teste e medidor de FPS, ligados só com `?debug` na URL (não por modo dev: a avaliação roda no
 * `npm run dev`). Expõe comandos de jogo para o E2E atravessar a partida.
 */
export function installDebug(game: Game): void {
  game.debug = true;
  window.__kepler = {
    info() {
      const enemies = game.sector?.enemies.filter((e) => e.alive) ?? [];
      const kinds: Record<string, number> = {};
      enemies.forEach((e) => (kinds[e.kind] = (kinds[e.kind] ?? 0) + 1));
      const boss = game.sector?.boss;
      const slot = game.arsenal.slots[game.arsenal.current];
      return {
        state: game.state,
        sector: game.sectorId,
        health: game.vitals.health,
        shield: game.vitals.shield,
        enemies: enemies.length,
        enemyKinds: kinds,
        boss: boss ? Math.max(0, boss.health / boss.maxHealth) : null,
        maxStuck: game.sector?.maxStuck ?? 0,
        bossPhase: boss ? boss.phase : null,
        doorsOpen: game.sector ? game.sector.allDoorsOpen : false,
        elapsed: game.elapsed,
        weapon: game.arsenal.current,
        mag: slot.mag,
        fps: game.renderer.fps,
        drawCalls: game.renderer.gl.info.render.calls,
        triangles: game.renderer.gl.info.render.triangles,
      };
    },
    start: () => game.startGame(true),
    activateSwitches: () => game.activateSwitches(),
    teleportToExit() {
      const p = game.sector?.exitPoint();
      if (p) game.teleport(p.x, p.z);
    },
    teleport: (x, z) => game.teleport(x, z),
    killAll: () => game.killAll(),
    damageBoss: (f) => game.damageBoss(f),
    setGodMode: (on) => (game.godMode = on),
    shootNearest(weapon) {
      const sector = game.sector;
      if (!sector) return false;
      const eye = game.player.eye;
      const target = sector.enemies.filter((e) => e.alive).sort((a, b) => a.position.distanceTo(eye) - b.position.distanceTo(eye))[0];
      if (!target) return false;
      const aim = target.position.clone().add(new THREE.Vector3(0, target.kind === 'drone' ? 0 : 1.3, 0)).sub(eye);
      game.player.yaw = Math.atan2(-aim.x, -aim.z);
      game.player.pitch = Math.atan2(aim.y, Math.hypot(aim.x, aim.z));
      game.player.recoilPitch = 0;
      game.player.recoilYaw = 0;
      game.fire(weapon ?? game.arsenal.current);
      return true;
    },
    hurt: (amount) => game.damagePlayer(amount, game.player.position.clone().add(new THREE.Vector3(0, 0, -3))),
    retry: () => game.retrySector(),
    pause: () => game.pause(),
    giveAll() {
      game.arsenal = giveWeapon(giveWeapon(game.arsenal, 'rifle', 120), 'shotgun', 30);
    },
    equip(weapon) {
      game.arsenal = stepArsenal(game.arsenal, { triggerHeld: false, triggerPressed: false, reload: false, switchTo: weapon, canFire: false }, 0).arsenal;
    },
    lookAt(x, y, z) {
      const aim = new THREE.Vector3(x, y, z).sub(game.player.eye);
      game.player.yaw = Math.atan2(-aim.x, -aim.z);
      game.player.pitch = Math.atan2(aim.y, Math.hypot(aim.x, aim.z));
    },
    enemyPositions: () =>
      (game.sector?.enemies ?? []).filter((e) => e.alive).map((e) => ({ kind: e.kind, x: e.position.x, y: e.position.y, z: e.position.z, state: e.state })),
  };
}
