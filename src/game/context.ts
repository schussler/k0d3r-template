import type * as THREE from 'three';
import type { AudioEngine } from '../audio/audio';
import type { Effects } from '../fx/effects';
import type { EnemyKind, LevelGrid } from '../logic/level';
import type { Player } from '../player/player';

export interface ProjectileSpec {
  readonly from: THREE.Vector3;
  readonly velocity: THREE.Vector3;
  readonly damage: number;
  readonly radius: number;
  readonly color: number;
  readonly size: number;
  readonly life: number;
}

/** O que um robô enxerga do mundo: o setor atual e os serviços de jogo de que precisa. */
export interface GameContext {
  readonly scene: THREE.Object3D;
  readonly grid: LevelGrid;
  readonly ceiling: number;
  readonly audio: AudioEngine;
  readonly fx: Effects;
  readonly player: Player;
  readonly time: number;
  readonly rng: () => number;
  damagePlayer(amount: number, from: THREE.Vector3): void;
  pushPlayer(impulse: THREE.Vector3): void;
  spawnProjectile(spec: ProjectileSpec): void;
  spawnEnemy(kind: EnemyKind, x: number, z: number): void;
  countAlive(kind: EnemyKind): number;
}
