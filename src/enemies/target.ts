import * as THREE from 'three';
import { REST, type Spring, kick, updateSpring } from '../rules/spring';
import { type HitInfo, type Hittable, type RayTarget, raySphere } from './hittable';

/**
 * Alvo de treino do hangar: um boneco de manutenção desligado num suporte. Balança ao levar tiro e acende a cabeça
 * no tiro na cabeça. Não morre: é onde o jogador aprende as armas.
 */
export class TrainingTarget implements Hittable {
  readonly group = new THREE.Group();
  readonly alive = true;
  private readonly pivot = new THREE.Group();
  private sway: Spring = REST;
  private flash = 0;
  private readonly headMat: THREE.MeshStandardMaterial;
  private readonly bodyMat: THREE.MeshStandardMaterial;
  private readonly head = new THREE.Vector3();
  private readonly chest = new THREE.Vector3();

  constructor(x: number, z: number, facing: number) {
    this.group.position.set(x, 0, z);
    this.group.rotation.y = facing;
    const metal = new THREE.MeshStandardMaterial({ color: 0x3c434c, metalness: 0.8, roughness: 0.35 });
    this.bodyMat = new THREE.MeshStandardMaterial({ color: 0xd7dbe0, metalness: 0.3, roughness: 0.5, emissive: 0x000000 });
    this.headMat = new THREE.MeshStandardMaterial({ color: 0x20242a, metalness: 0.6, roughness: 0.3, emissive: 0xff5a1a, emissiveIntensity: 0.6 });
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.55, 0.12, 16), metal);
    base.position.y = 0.06;
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.9, 8), metal);
    pole.position.y = 0.55;
    this.group.add(base, pole, this.pivot);
    this.pivot.position.y = 0.95;
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.7, 0.3), this.bodyMat);
    torso.position.y = 0.4;
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.64, 0.08, 0.31), new THREE.MeshStandardMaterial({ color: 0xd9a400, roughness: 0.5 }));
    stripe.position.y = 0.4;
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.12, 8), metal);
    neck.position.y = 0.8;
    const headMesh = new THREE.Mesh(new THREE.SphereGeometry(0.17, 18, 14), this.headMat);
    headMesh.position.y = 0.98;
    this.pivot.add(torso, stripe, neck, headMesh);
    this.group.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.castShadow = true;
        o.receiveShadow = true;
      }
    });
  }

  raycast(o: THREE.Vector3, d: THREE.Vector3, maxDist: number, out: RayTarget): boolean {
    this.pivot.updateWorldMatrix(true, false);
    this.head.set(0, 0.98, 0).applyMatrix4(this.pivot.matrixWorld);
    this.chest.set(0, 0.4, 0).applyMatrix4(this.pivot.matrixWorld);
    const h = raySphere(o, d, this.head.x, this.head.y, this.head.z, 0.18, maxDist, 'head', out);
    const b = raySphere(o, d, this.chest.x, this.chest.y, this.chest.z, 0.38, maxDist, 'body', out);
    return h || b;
  }

  frontalShieldAgainst(): boolean {
    return false;
  }

  onHit(hit: HitInfo): void {
    const local = hit.dir.clone().applyQuaternion(this.group.quaternion.clone().invert());
    this.sway = kick(this.sway, Math.min(6, hit.damage * 0.25) * Math.sign(-local.z || 1));
    this.flash = hit.kind === 'head' ? 1 : 0.5;
  }

  update(dt: number): void {
    this.sway = updateSpring(this.sway, 60, 6, dt);
    this.pivot.rotation.x = this.sway.offset * 0.35;
    this.flash = Math.max(0, this.flash - dt * 3);
    this.headMat.emissiveIntensity = 0.6 + this.flash * 4;
    this.bodyMat.emissive.setScalar(this.flash * 0.25);
  }
}
