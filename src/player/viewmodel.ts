import * as THREE from 'three';
import { clamp, damp } from '../logic/math';
import { SWITCH_TIME, WEAPONS, type Arsenal, type WeaponId } from '../logic/weapons';
import { flashTexture } from '../world/textures';

interface GunModel {
  readonly root: THREE.Group;
  readonly muzzle: THREE.Object3D;
  readonly mag: THREE.Object3D;
  readonly magHome: THREE.Vector3;
  /** Peça que recua no tiro (ferrolho ou bomba). */
  readonly slide: THREE.Object3D;
  readonly slideHome: THREE.Vector3;
  readonly ejector: THREE.Object3D;
}

const metal = new THREE.MeshStandardMaterial({ color: 0x6b7480, roughness: 0.32, metalness: 0.8 });
const dark = new THREE.MeshStandardMaterial({ color: 0x2c3138, roughness: 0.5, metalness: 0.6 });
const grip = new THREE.MeshStandardMaterial({ color: 0x3a2f28, roughness: 0.85, metalness: 0.1 });
const accentBlue = new THREE.MeshStandardMaterial({ color: 0x1b5d8f, roughness: 0.4, metalness: 0.6 });
const accentOrange = new THREE.MeshStandardMaterial({ color: 0xc8611c, roughness: 0.45, metalness: 0.5 });
const glowCyan = new THREE.MeshBasicMaterial({ color: 0x5ff2ff });
const glowRed = new THREE.MeshBasicMaterial({ color: 0xff4a3a });
const skin = new THREE.MeshStandardMaterial({ color: 0x2e3a46, roughness: 0.8, metalness: 0.2 });

function box(w: number, h: number, d: number, mat: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  return m;
}

function cyl(r: number, len: number, mat: THREE.Material, x = 0, y = 0, z = 0, seg = 12): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, seg), mat);
  m.rotation.x = Math.PI / 2;
  m.position.set(x, y, z);
  return m;
}

/** Mão com luva segurando o cabo (dá escala e leitura de "arma na mão"). */
function hand(x: number, y: number, z: number): THREE.Group {
  const g = new THREE.Group();
  g.add(box(0.075, 0.09, 0.11, skin));
  g.add(box(0.09, 0.035, 0.13, dark, 0, 0.05, 0));
  g.position.set(x, y, z);
  return g;
}

function pistol(): GunModel {
  const root = new THREE.Group();
  const slide = new THREE.Group();
  slide.add(box(0.052, 0.06, 0.26, metal, 0, 0.035, -0.03));
  slide.add(box(0.012, 0.012, 0.02, glowCyan, 0, 0.072, -0.14));
  slide.add(box(0.03, 0.012, 0.02, glowCyan, 0, 0.072, 0.08));
  root.add(slide);
  root.add(box(0.046, 0.04, 0.22, dark, 0, -0.01, -0.02));
  root.add(cyl(0.012, 0.04, dark, 0, 0.035, -0.18));
  const gripMesh = box(0.045, 0.13, 0.065, grip, 0, -0.08, 0.07);
  gripMesh.rotation.x = -0.25;
  root.add(gripMesh);
  root.add(box(0.05, 0.012, 0.05, accentBlue, 0, -0.03, -0.06));
  const mag = new THREE.Group();
  mag.add(box(0.036, 0.1, 0.05, accentBlue, 0, -0.1, 0.07));
  root.add(mag);
  root.add(hand(0, -0.09, 0.08));
  const muzzle = new THREE.Object3D();
  muzzle.position.set(0, 0.035, -0.2);
  root.add(muzzle);
  const ejector = new THREE.Object3D();
  ejector.position.set(0.03, 0.05, -0.02);
  root.add(ejector);
  return { root, muzzle, mag, magHome: mag.position.clone(), slide, slideHome: slide.position.clone(), ejector };
}

function rifle(): GunModel {
  const root = new THREE.Group();
  root.add(box(0.06, 0.08, 0.44, metal, 0, 0.0, -0.08));
  root.add(box(0.05, 0.05, 0.2, dark, 0, -0.005, -0.38));
  root.add(cyl(0.014, 0.18, dark, 0, 0.01, -0.55));
  root.add(box(0.05, 0.07, 0.18, dark, 0, -0.01, 0.2));
  root.add(box(0.04, 0.035, 0.1, accentOrange, 0, 0.06, -0.06));
  root.add(box(0.012, 0.03, 0.012, glowRed, 0, 0.09, -0.06));
  const slide = new THREE.Group();
  slide.add(box(0.012, 0.02, 0.05, accentOrange, 0.036, 0.02, 0.02));
  root.add(slide);
  const gripMesh = box(0.04, 0.11, 0.05, grip, 0, -0.08, 0.06);
  gripMesh.rotation.x = -0.3;
  root.add(gripMesh);
  const mag = new THREE.Group();
  const magMesh = box(0.04, 0.14, 0.06, accentOrange, 0, -0.1, -0.08);
  magMesh.rotation.x = 0.18;
  mag.add(magMesh);
  root.add(mag);
  root.add(hand(0, -0.09, 0.07));
  root.add(hand(0, -0.04, -0.3));
  const muzzle = new THREE.Object3D();
  muzzle.position.set(0, 0.01, -0.66);
  root.add(muzzle);
  const ejector = new THREE.Object3D();
  ejector.position.set(0.035, 0.03, -0.02);
  root.add(ejector);
  return { root, muzzle, mag, magHome: mag.position.clone(), slide, slideHome: slide.position.clone(), ejector };
}

function shotgun(): GunModel {
  const root = new THREE.Group();
  root.add(cyl(0.024, 0.62, metal, 0, 0.02, -0.25));
  root.add(cyl(0.02, 0.5, dark, 0, -0.025, -0.2));
  root.add(box(0.07, 0.08, 0.22, metal, 0, 0.0, 0.08));
  root.add(box(0.06, 0.08, 0.2, grip, 0, -0.03, 0.27));
  root.add(box(0.03, 0.015, 0.03, glowCyan, 0, 0.05, -0.5));
  const slide = new THREE.Group();
  slide.add(cyl(0.034, 0.16, grip, 0, -0.025, -0.24, 10));
  root.add(slide);
  const mag = new THREE.Group();
  mag.add(cyl(0.018, 0.05, accentOrange, 0.04, 0.0, 0.05, 8));
  root.add(mag);
  root.add(hand(0, -0.08, 0.15));
  root.add(hand(0, -0.06, -0.24));
  const muzzle = new THREE.Object3D();
  muzzle.position.set(0, 0.02, -0.58);
  root.add(muzzle);
  const ejector = new THREE.Object3D();
  ejector.position.set(0.04, 0.02, 0.05);
  root.add(ejector);
  return { root, muzzle, mag, magHome: mag.position.clone(), slide, slideHome: slide.position.clone(), ejector };
}

/** Pose de repouso de cada arma (canto inferior direito da tela). */
const REST: Readonly<Record<WeaponId, THREE.Vector3>> = {
  pistol: new THREE.Vector3(0.17, -0.17, -0.5),
  rifle: new THREE.Vector3(0.16, -0.17, -0.44),
  shotgun: new THREE.Vector3(0.17, -0.18, -0.46),
};

/**
 * Arma em primeira pessoa, numa cena própria desenhada por cima do mundo. Toda a animação é procedural:
 * coice com mola, balanço ao andar, inércia ao girar, troca (desce e sobe) e recarga (inclina, pente sai e
 * entra), clarão no cano.
 */
export class ViewModel {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.01, 10);
  private readonly holder = new THREE.Group();
  private readonly guns: Record<WeaponId, GunModel>;
  private readonly flash: THREE.Sprite;
  private readonly flashLight: THREE.PointLight;
  private shown: WeaponId = 'pistol';
  private kick = 0;
  private kickVel = 0;
  private flashTime = 0;
  private swayX = 0;
  private swayY = 0;
  private sprintPose = 0;
  private slideKick = 0;

  constructor() {
    this.guns = { pistol: pistol(), rifle: rifle(), shotgun: shotgun() };
    for (const id of ['pistol', 'rifle', 'shotgun'] as const) {
      this.guns[id].root.visible = id === 'pistol';
      this.holder.add(this.guns[id].root);
    }
    // Escala da arma na tela: menor que o tamanho real para não cobrir a visão.
    this.holder.scale.setScalar(0.68);
    this.camera.add(this.holder);
    this.scene.add(this.camera);
    this.scene.add(new THREE.HemisphereLight(0xcfe0ff, 0x202530, 1.6));
    const key = new THREE.DirectionalLight(0xffffff, 2.2);
    key.position.set(1, 2, 1);
    this.scene.add(key);
    this.flash = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: flashTexture(), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    this.flash.visible = false;
    this.flash.position.z = -0.03;
    this.flashLight = new THREE.PointLight(0xffb060, 0, 3, 2);
    this.guns.pistol.muzzle.add(this.flash);
    this.camera.add(this.flashLight);
    this.flashLight.position.set(0.2, -0.1, -0.6);
  }

  /** Reflexos do metal da arma: usa o mesmo mapa de ambiente do mundo. */
  setEnvironment(env: THREE.Texture | null): void {
    this.scene.environment = env;
    this.scene.environmentIntensity = 0.8;
  }

  /** Coloração da luz ambiente da arma, acompanhando o setor (vermelho no laboratório, etc.). */
  setTint(color: number): void {
    this.scene.children.forEach((c) => {
      if (c instanceof THREE.HemisphereLight) c.color.setHex(color);
    });
  }

  fire(weapon: WeaponId): void {
    const strength = weapon === 'shotgun' ? 1.8 : weapon === 'rifle' ? 0.7 : 1;
    this.kickVel += 9 * strength;
    this.slideKick = 1;
    this.flashTime = weapon === 'shotgun' ? 0.07 : 0.045;
    this.flash.material.rotation = Math.random() * Math.PI * 2;
    const s = (weapon === 'shotgun' ? 0.42 : weapon === 'rifle' ? 0.26 : 0.22) * (0.85 + Math.random() * 0.3);
    this.flash.scale.set(s, s, 1);
  }

  /**
   * Posição de onde as cápsulas saem, no espaço da câmera (a câmera da arma fica parada na origem);
   * o jogo converte para o mundo com a câmera do mundo.
   */
  ejectorOffset(): THREE.Vector3 {
    return this.guns[this.shown].ejector.getWorldPosition(new THREE.Vector3());
  }

  /** Boca do cano no espaço da câmera, para o traçante sair do lugar certo. */
  muzzleOffset(): THREE.Vector3 {
    return this.guns[this.shown].muzzle.getWorldPosition(new THREE.Vector3());
  }

  update(dt: number, time: number, arsenal: Arsenal, moveFactor: number, bobPhase: number, sprinting: boolean, crouch: number, mouseDx: number, mouseDy: number): void {
    const action = arsenal.action;
    if (this.shown !== arsenal.current) {
      this.guns[this.shown].root.visible = false;
      this.shown = arsenal.current;
      this.guns[this.shown].root.visible = true;
      this.guns[this.shown].muzzle.add(this.flash);
    }
    const gun = this.guns[this.shown];

    // Mola do coice: empurrão rápido para trás, volta amortecida.
    this.kickVel += (-this.kick * 260 - this.kickVel * 22) * dt;
    this.kick = clamp(this.kick + this.kickVel * dt, -0.2, 1.5);
    this.slideKick = damp(this.slideKick, 0, 18, dt);

    this.swayX = damp(this.swayX, clamp(-mouseDx * 0.0009, -0.05, 0.05), 8, dt);
    this.swayY = damp(this.swayY, clamp(mouseDy * 0.0009, -0.04, 0.04), 8, dt);
    this.sprintPose = damp(this.sprintPose, sprinting ? 1 : 0, 9, dt);

    let lower = 0;
    if (action.kind === 'switch') {
      const half = SWITCH_TIME / 2;
      lower = action.t < half ? action.t / half : 1 - (action.t - half) / half;
    }
    let reloadTilt = 0;
    let magDrop = 0;
    if (action.kind === 'reload') {
      const p = clamp(action.t / WEAPONS[arsenal.current].reloadTime, 0, 1);
      reloadTilt = Math.sin(p * Math.PI);
      magDrop = p < 0.5 ? clamp((p - 0.15) / 0.2, 0, 1) : clamp(1 - (p - 0.55) / 0.2, 0, 1);
    }

    const bob = moveFactor;
    const rest = REST[this.shown];
    const bx = Math.sin(bobPhase * Math.PI) * 0.018 * bob;
    const by = -Math.abs(Math.cos(bobPhase * Math.PI)) * 0.014 * bob;
    const idle = Math.sin(time * 1.6) * 0.003;
    this.holder.position.set(
      rest.x + bx + this.swayX - this.sprintPose * 0.06,
      rest.y + by + idle + this.swayY - lower * 0.35 - this.sprintPose * 0.06 - crouch * 0.01 - reloadTilt * 0.04,
      rest.z + this.kick * 0.07,
    );
    this.holder.rotation.set(
      this.kick * 0.22 + lower * -0.6 + this.sprintPose * -0.35 + reloadTilt * 0.25,
      this.swayX * 1.5 + this.sprintPose * 0.7,
      this.sprintPose * 0.25 + reloadTilt * 0.6 + bx * 2,
    );

    gun.mag.position.set(gun.magHome.x, gun.magHome.y - magDrop * 0.25, gun.magHome.z);
    gun.mag.visible = magDrop < 0.95;
    gun.slide.position.set(gun.slideHome.x, gun.slideHome.y, gun.slideHome.z + this.slideKick * (this.shown === 'shotgun' ? 0.08 : 0.04));

    this.flashTime -= dt;
    const flashing = this.flashTime > 0;
    this.flash.visible = flashing;
    this.flashLight.intensity = flashing ? 6 : 0;
  }
}
