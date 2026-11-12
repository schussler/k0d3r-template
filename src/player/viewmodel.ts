import * as THREE from 'three';
import { type ArsenalState, LOWER_TIME, RAISE_TIME, WEAPONS, type WeaponId } from '../rules/arsenal';
import { REST, type Spring, kick, updateSpring } from '../rules/spring';
import { flashTexture } from '../render/textures';
import { type GunModel, buildGuns } from './guns';

/**
 * Arma em primeira pessoa, desenhada numa cena própria por cima do mundo (não atravessa parede). Anima balanço ao
 * andar, atraso ao virar, coice, troca, recarga, corrida e aterrissagem.
 */
export interface ViewmodelFrame {
  readonly arsenal: ArsenalState;
  readonly speedFactor: number;
  readonly stepPhase: number;
  readonly grounded: boolean;
  readonly crouched: boolean;
  readonly sprinting: boolean;
  readonly lookDX: number;
  readonly lookDY: number;
  readonly landDip: number;
}

const KICK_STIFFNESS = 240;
const KICK_DAMPING = 24;
const FLASH_TIME = 0.05;

export class Viewmodel {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(56, 1, 0.01, 10);
  private readonly holder = new THREE.Group();
  private readonly guns: Record<WeaponId, GunModel>;
  private kickBack: Spring = REST;
  private kickUp: Spring = REST;
  private kickSide: Spring = REST;
  private swayX = 0;
  private swayY = 0;
  private sprintBlend = 0;
  private reloadBlend = 0;
  private slideTimer = 0;
  private pumpTimer = -1;
  private time = 0;
  private flashTimer = 0;
  private readonly flash: THREE.Group;
  private readonly flashLight = new THREE.PointLight(0xffb060, 0, 3, 2);
  private readonly flashMat: THREE.MeshBasicMaterial;
  private shown: WeaponId = 'pistol';

  constructor(env: THREE.Texture | null) {
    this.scene.environment = env;
    this.scene.environmentIntensity = 0.7;
    this.scene.add(this.camera);
    this.camera.add(this.holder);
    this.holder.scale.setScalar(0.85);
    this.guns = buildGuns();
    for (const g of Object.values(this.guns)) {
      g.root.visible = false;
      this.holder.add(g.root);
    }
    this.guns.pistol.root.visible = true;
    const hemi = new THREE.HemisphereLight(0xbfd8ff, 0x20242c, 1.2);
    const keyLight = new THREE.DirectionalLight(0xffffff, 1.6);
    keyLight.position.set(0.6, 1, 0.4);
    this.scene.add(hemi, keyLight, this.flashLight);

    this.flashMat = new THREE.MeshBasicMaterial({
      map: flashTexture(), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false,
    });
    this.flash = new THREE.Group();
    const front = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.16), this.flashMat);
    const sideA = new THREE.Mesh(new THREE.PlaneGeometry(0.1, 0.26), this.flashMat);
    sideA.rotation.x = Math.PI / 2;
    sideA.position.z = -0.08;
    const sideB = sideA.clone();
    sideB.rotation.y = Math.PI / 2;
    this.flash.add(front, sideA, sideB);
    this.flash.visible = false;
  }

  get current(): GunModel {
    return this.guns[this.shown];
  }

  setAspect(aspect: number): void {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  /** Coice, clarão e ferrolho do disparo. */
  onFire(id: WeaponId): void {
    const g = this.guns[id];
    this.kickBack = kick(this.kickBack, g.kick.back);
    this.kickUp = kick(this.kickUp, g.kick.up);
    this.kickSide = kick(this.kickSide, (Math.random() * 2 - 1) * g.kick.side);
    this.slideTimer = 0.07;
    if (id === 'shotgun') this.pumpTimer = 0;
    this.flashTimer = FLASH_TIME;
    const scale = id === 'shotgun' ? 1.7 : id === 'rifle' ? 1.15 : 0.95;
    this.flash.scale.setScalar(scale * (0.85 + Math.random() * 0.3));
    this.flash.rotation.z = Math.random() * Math.PI;
    g.muzzle.add(this.flash);
    this.flash.visible = true;
    this.flashLight.intensity = 6 * scale;
  }

  /** Posição do cano em coordenadas da câmera (a câmera da arma fica na origem, olhando para -Z). */
  muzzleLocal(out: THREE.Vector3): THREE.Vector3 {
    this.scene.updateMatrixWorld();
    return this.current.muzzle.getWorldPosition(out);
  }

  ejectLocal(out: THREE.Vector3): THREE.Vector3 {
    this.scene.updateMatrixWorld();
    return this.current.eject.getWorldPosition(out);
  }

  /** Telha da escopeta volta e ejeta a cápsula: devolve true no quadro da ejeção. */
  update(dt: number, f: ViewmodelFrame): { pumpEject: boolean } {
    this.time += dt;
    const a = f.arsenal;
    if (a.current !== this.shown) {
      this.guns[this.shown].root.visible = false;
      this.shown = a.current;
      this.guns[this.shown].root.visible = true;
    }
    const g = this.current;
    this.kickBack = updateSpring(this.kickBack, KICK_STIFFNESS, KICK_DAMPING, dt);
    this.kickUp = updateSpring(this.kickUp, KICK_STIFFNESS, KICK_DAMPING, dt);
    this.kickSide = updateSpring(this.kickSide, KICK_STIFFNESS, KICK_DAMPING, dt);

    const amp = Math.min(1.6, f.speedFactor) * (f.grounded ? 1 : 0.15);
    const bobX = Math.sin(f.stepPhase) * 0.012 * amp;
    const bobY = -Math.abs(Math.cos(f.stepPhase)) * 0.014 * amp;
    const breathe = Math.sin(this.time * 1.7) * 0.0025;
    const k = Math.min(1, dt * 9);
    this.swayX += (Math.max(-0.05, Math.min(0.05, -f.lookDX * 0.00055)) - this.swayX) * k;
    this.swayY += (Math.max(-0.04, Math.min(0.04, f.lookDY * 0.00055)) - this.swayY) * k;
    this.sprintBlend += ((f.sprinting ? 1 : 0) - this.sprintBlend) * Math.min(1, dt * 8);

    const reloading = a.action.kind === 'reload';
    this.reloadBlend += ((reloading ? 1 : 0) - this.reloadBlend) * Math.min(1, dt * 10);
    let switchDrop = 0;
    if (a.action.kind === 'lower') switchDrop = 1 - a.action.remaining / LOWER_TIME;
    if (a.action.kind === 'raise') switchDrop = a.action.remaining / RAISE_TIME;
    const ease = switchDrop * switchDrop * (3 - 2 * switchDrop);

    const pos = this.holder.position;
    pos.copy(g.hip);
    pos.x += bobX + this.swayX - this.sprintBlend * 0.04;
    pos.y += bobY + breathe + this.swayY - this.sprintBlend * 0.05 - f.landDip * 0.25 - ease * 0.32 + (f.crouched ? 0.01 : 0);
    pos.z += this.kickBack.offset;
    const rot = this.holder.rotation;
    rot.set(
      this.kickUp.offset * 0.7 - this.sprintBlend * 0.28 - ease * 0.9 + this.swayY * 0.6,
      this.swayX * 1.4 + this.sprintBlend * 0.55 + this.kickSide.offset * 0.5,
      Math.sin(f.stepPhase) * 0.012 * amp + this.swayX * 0.8,
    );
    this.applyReload(g, a, dt);
    this.slideTimer = Math.max(0, this.slideTimer - dt);
    if (g.id !== 'shotgun') g.slide.position.z = (this.slideTimer / 0.07) * 0.035;
    const pumpEject = this.updatePump(g, dt);

    this.flashTimer -= dt;
    if (this.flashTimer <= 0 && this.flash.visible) {
      this.flash.visible = false;
      this.flashLight.intensity = 0;
    }
    if (this.flash.visible) {
      this.flashMat.opacity = Math.max(0, this.flashTimer / FLASH_TIME);
      this.flashLight.position.copy(this.muzzleLocal(new THREE.Vector3()));
    }
    return { pumpEject };
  }

  private applyReload(g: GunModel, a: ArsenalState, _dt: number): void {
    const def = WEAPONS[g.id];
    const rot = this.holder.rotation;
    const pos = this.holder.position;
    const q = a.action.kind === 'reload' ? 1 - a.action.remaining / def.reloadTime : 0;
    if (def.perShellReload) {
      // Escopeta: arma inclinada enquanto carrega, com um tranco a cada cartucho.
      const bump = a.action.kind === 'reload' ? Math.sin(q * Math.PI) * 0.03 : 0;
      rot.z += this.reloadBlend * 0.45;
      rot.x += this.reloadBlend * 0.18 + bump;
      pos.y -= this.reloadBlend * 0.03;
      return;
    }
    const tilt = Math.sin(Math.min(1, q * 1.15) * Math.PI) * this.reloadBlend;
    rot.z += tilt * 0.65;
    rot.x += tilt * 0.3;
    pos.y -= tilt * 0.04;
    if (g.mag) {
      const out = q > 0.15 && q < 0.6 ? Math.sin(((q - 0.15) / 0.45) * Math.PI) : 0;
      g.mag.position.y = -0.04 - out * 0.22;
    }
    if (q > 0.82 && q < 0.95) g.slide.position.z = 0.035 * Math.sin(((q - 0.82) / 0.13) * Math.PI);
  }

  private updatePump(g: GunModel, dt: number): boolean {
    if (g.id !== 'shotgun' || this.pumpTimer < 0) return false;
    const before = this.pumpTimer;
    this.pumpTimer += dt;
    const t = (this.pumpTimer - 0.32) / 0.3;
    g.slide.position.z = t > 0 && t < 1 ? Math.sin(t * Math.PI) * 0.08 : 0;
    if (this.pumpTimer > 0.7) this.pumpTimer = -1;
    return before < 0.47 && this.pumpTimer >= 0.47;
  }
}
