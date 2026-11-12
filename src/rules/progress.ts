import type { ArsenalState } from './arsenal';
import { type Vitals, MAX_HEALTH } from './vitals';

/** Cronômetro da partida e ponto de reinício do setor. Funções puras; o jogo guarda os valores. */
export interface RunStats {
  /** Segundos de jogo ativo desde o clique em "Jogar", somando todas as tentativas. */
  readonly elapsed: number;
  readonly deaths: number;
}

export function newRun(): RunStats {
  return { elapsed: 0, deaths: 0 };
}

/** Só conta com o jogo rodando: pausa, morte e telas ficam de fora. */
export function advanceClock(r: RunStats, dt: number, active: boolean): RunStats {
  return active ? { ...r, elapsed: r.elapsed + dt } : r;
}

export function recordDeath(r: RunStats): RunStats {
  return { ...r, deaths: r.deaths + 1 };
}

export function formatTime(seconds: number): string {
  const total = Math.max(0, seconds);
  const m = Math.floor(total / 60);
  const s = Math.floor(total % 60);
  const cs = Math.floor((total * 100) % 100);
  const two = (n: number) => String(n).padStart(2, '0');
  return `${two(m)}:${two(s)}.${two(cs)}`;
}

export interface Snapshot {
  readonly vitals: Vitals;
  readonly arsenal: ArsenalState;
}

/** Vida mínima ao reiniciar: entrar num setor quase morto e morrer de novo sem poder agir seria um laço sem saída. */
export const MIN_RESTORE_HEALTH = 30;

export function takeSnapshot(vitals: Vitals, arsenal: ArsenalState): Snapshot {
  return {
    vitals: { ...vitals },
    arsenal: { ...arsenal, owned: [...arsenal.owned], guns: { pistol: { ...arsenal.guns.pistol }, rifle: { ...arsenal.guns.rifle }, shotgun: { ...arsenal.guns.shotgun } } },
  };
}

export function restoreSnapshot(s: Snapshot): Snapshot {
  const copy = takeSnapshot(s.vitals, s.arsenal);
  return {
    arsenal: { ...copy.arsenal, action: { kind: 'idle' }, cooldown: 0, triggerLatched: false },
    vitals: { ...copy.vitals, health: Math.min(MAX_HEALTH, Math.max(MIN_RESTORE_HEALTH, copy.vitals.health)), sinceDamage: 0 },
  };
}
