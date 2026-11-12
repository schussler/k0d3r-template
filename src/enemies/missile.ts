import * as THREE from 'three';
import type { CollisionWorld } from '../world/collision';
import type { Box } from '../world/collision';
import { type HitInfo, type Hittable, type RayTarget, raySphere } from './hittable';

/** Míssil do chefe: lento, persegue o jogador e pode ser derrubado a tiro antes de acertar. */
const SPEED = 10;
const TURN_RATE = 1.7;
const LIFE = 6;
const HEALTH = 18;
const HIT_RADIUS = 1.0;
const DAMAGE = 22;

export class Missile implements Hittable {
  readonly mesh = new THREE.Group();
  alive = true;
  readonly pos = new THREE.Vector3();
  private readonly vel = new THREE.Vector3();
  private health = HEALTH;
  private life = LIFE;
  private readonly want = new THREE.Vector3();
  /** Distância percorrida sem bater: mísseis nascem dentro do chefe e só colidem depois de sair dele. */
  private travelled = 0;
  onExplode: (x: number, y: number, z: number, byPlayer: boolean) => void = () => undefined;

  constructor(from: THREE.Vector3, dir: THREE.Vector3) {
    this.pos.copy(from);
    this.vel.copy(dir).normalize().multiplyScalar(SPEED);
    const body = new THREE.Mesh(
      new THREE.CylinderGeometry(0.16, 0.2, 1.1, 10),
      new THREE.MeshStandardMaterial({ color: 0x59606a, metalness: 0.85, roughness: 0.3 }),
    );
    body.rotation.x = Math.PI / 2;
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.34, 10), new THREE.MeshStandardMaterial({ color: 0xff3a1a, emissive: 0xff2a10, emissiveIntensity: 2 }));
    tip.rotation.x = Math.PI / 2;
    tip.position.z = 0.7;
    const flame = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.7, 8), new THREE.MeshBasicMaterial({ color: 0xffa040, toneMapped: false }));
    flame.rotation.x = -Math.PI / 2;
    flame.position.z = -0.85;
    this.mesh.add(body, tip, flame);
    this.mesh.userData.noDebris = true;
  }

  raycast(o: THREE.Vector3, d: THREE.Vector3, maxDist: number, out: RayTarget): boolean {
    return this.alive && raySphere(o, d, this.pos.x, this.pos.y, this.pos.z, 0.5, maxDist, 'body', out);
  }

  frontalShieldAgainst(): boolean {
    return false;
  }

  onHit(hit: HitInfo): void {
    this.health -= hit.damage;
    if (this.health <= 0 && this.alive) this.explode(true);
  }

  private explode(byPlayer: boolean): void {
    this.alive = false;
    this.mesh.visible = false;
    this.onExplode(this.pos.x, this.pos.y, this.pos.z, byPlayer);
  }

  /** Avança o míssil; devolve o dano ao jogador se acertou. */
  update(dt: number, world: CollisionWorld, player: { x: number; z: number; eyeY: number }, scratch: Box[]): number {
    if (!this.alive) return 0;
    this.life -= dt;
    this.want.set(player.x - this.pos.x, player.eyeY - 0.4 - this.pos.y, player.z - this.pos.z);
    const dist = this.want.length();
    this.want.normalize().multiplyScalar(SPEED);
    const k = Math.min(1, TURN_RATE * dt);
    this.vel.lerp(this.want, k).setLength(SPEED);
    this.pos.addScaledVector(this.vel, dt);
    this.travelled += SPEED * dt;
    this.mesh.position.copy(this.pos);
    this.mesh.lookAt(this.pos.x + this.vel.x, this.pos.y + this.vel.y, this.pos.z + this.vel.z);
    if (dist < HIT_RADIUS) {
      this.explode(false);
      return DAMAGE;
    }
    if (this.life <= 0 || (this.travelled > 2.5 && world.solidAt(this.pos.x, this.pos.y, this.pos.z, scratch))) this.explode(false);
    return 0;
  }
}
