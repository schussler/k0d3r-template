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
      // Jogadora como segmento vertical: distância do projétil ao eixo do corpo.
      const next = pos.clone().addScaledVector(dir, hit ? hit.t : step);
      const bottom = player.position.y + 0.2;
      const top = player.position.y + player.height - 0.1;
      const cy = Math.min(top, Math.max(bottom, next.y));
      const d = Math.hypot(next.x - player.position.x, next.y - cy, next.z - player.position.z);
      if (d < p.radius + 0.4) {
        ctx.damagePlayer(p.damage, pos.clone().addScaledVector(dir, -3));
        ctx.fx.sparkBurst(next, dir.clone().negate(), 8, p.color, 4);
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
