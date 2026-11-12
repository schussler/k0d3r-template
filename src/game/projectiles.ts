import * as THREE from 'three';
import { raycastGrid } from '../logic/collision';
import type { LevelGrid } from '../logic/level';
import { glowTexture } from '../world/textures';
import type { GameContext, ProjectileSpec } from './context';

const POOL = 96;

interface Projectile {
  active: boolean;
  sprite: THREE.Sprite;
  core: THREE.Mesh;
  vel: THREE.Vector3;
  damage: number;
  radius: number;
  life: number;
  color: THREE.Color;
}

/** Projéteis dos robôs: lentos o bastante para serem vistos e desviados. Pool fixo. */
export class Projectiles {
  readonly group = new THREE.Group();
  private readonly items: Projectile[] = [];
  private cursor = 0;

  constructor() {
    const coreGeo = new THREE.SphereGeometry(1, 10, 8);
    for (let n = 0; n < POOL; n++) {
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
      const core = new THREE.Mesh(coreGeo, new THREE.MeshBasicMaterial({ color: 0xffffff }));
      sprite.visible = core.visible = false;
      this.group.add(sprite, core);
      this.items.push({ active: false, sprite, core, vel: new THREE.Vector3(), damage: 0, radius: 0, life: 0, color: new THREE.Color() });
    }
  }

  spawn(spec: ProjectileSpec): void {
    const p = this.items[this.cursor]!;
    this.cursor = (this.cursor + 1) % POOL;
    p.active = true;
    p.vel.copy(spec.velocity);
    p.damage = spec.damage;
    p.radius = spec.radius;
    p.life = spec.life;
    p.color.setHex(spec.color);
    p.sprite.position.copy(spec.from);
    p.sprite.scale.setScalar(spec.size);
    p.sprite.material.color.copy(p.color);
    p.core.position.copy(spec.from);
    p.core.scale.setScalar(spec.radius * 0.45);
    p.sprite.visible = p.core.visible = true;
  }

  clear(): void {
    for (const p of this.items) this.kill(p);
  }

  private kill(p: Projectile): void {
    p.active = false;
    p.sprite.visible = p.core.visible = false;
  }

  update(dt: number, grid: LevelGrid, ctx: GameContext): void {
    const player = ctx.player;
    for (const p of this.items) {
      if (!p.active) continue;
      p.life -= dt;
      if (p.life <= 0) {
        this.kill(p);
        continue;
      }
      const pos = p.sprite.position;
      const speed = p.vel.length();
      const step = speed * dt;
      const dir = p.vel.clone().divideScalar(speed || 1);
      const hit = raycastGrid(grid, pos.x, pos.y, pos.z, dir.x, dir.y, dir.z, step, ctx.ceiling, 'bullet');
      // Jogadora como segmento vertical; testa o trecho percorrido no quadro inteiro (num quadro lento o
      // projétil anda mais que a largura do corpo e atravessaria se só o ponto final fosse testado).
      const travel = hit ? hit.t : step;
      const next = pos.clone().addScaledVector(dir, travel);
      const bottom = player.position.y + 0.2;
      const top = player.position.y + player.height - 0.1;
      const toPlayer = new THREE.Vector3(player.position.x - pos.x, 0, player.position.z - pos.z);
      const horizontal2 = dir.x * dir.x + dir.z * dir.z;
      const alongRaw = horizontal2 > 1e-6 ? (toPlayer.x * dir.x + toPlayer.z * dir.z) / horizontal2 : 0;
      const along = Math.max(0, Math.min(travel, alongRaw));
      const closest = pos.clone().addScaledVector(dir, along);
      const cy = Math.min(top, Math.max(bottom, closest.y));
      const d = Math.hypot(closest.x - player.position.x, closest.y - cy, closest.z - player.position.z);
      if (d < p.radius + 0.4) {
        ctx.damagePlayer(p.damage, pos.clone().addScaledVector(dir, -3));
        ctx.fx.sparkBurst(closest, dir.clone().negate(), 8, p.color, 4);
        this.kill(p);
        continue;
      }
      if (hit) {
        const at = new THREE.Vector3(hit.x, hit.y, hit.z);
        ctx.fx.sparkBurst(at, new THREE.Vector3(hit.nx, hit.ny, hit.nz), 10, p.color, 5);
        ctx.fx.glow(at, p.color, p.radius * 4, 0.15);
        this.kill(p);
        continue;
      }
      pos.copy(next);
      p.core.position.copy(next);
    }
  }
}
