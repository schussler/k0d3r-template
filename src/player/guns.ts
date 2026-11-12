import * as THREE from 'three';
import type { WeaponId } from '../rules/arsenal';

/** Modelos das armas e das mãos, montados de primitivas. Unidades em metros; o cano aponta para -Z. */
export interface GunModel {
  readonly id: WeaponId;
  readonly root: THREE.Group;
  readonly muzzle: THREE.Object3D;
  readonly eject: THREE.Object3D;
  /** Peça que corre para trás no tiro (ferrolho da pistola e do rifle, telha da escopeta). */
  readonly slide: THREE.Object3D;
  readonly mag: THREE.Object3D | null;
  readonly hip: THREE.Vector3;
  /** Força do coice visual: recuo em Z, giro para cima e lateral. */
  readonly kick: { readonly back: number; readonly up: number; readonly side: number };
}

interface Mats {
  dark: THREE.MeshStandardMaterial;
  mid: THREE.MeshStandardMaterial;
  polymer: THREE.MeshStandardMaterial;
  glove: THREE.MeshStandardMaterial;
  sleeve: THREE.MeshStandardMaterial;
  brass: THREE.MeshStandardMaterial;
  shell: THREE.MeshStandardMaterial;
}

function mats(): Mats {
  return {
    dark: new THREE.MeshStandardMaterial({ color: 0x262b32, metalness: 0.9, roughness: 0.3 }),
    mid: new THREE.MeshStandardMaterial({ color: 0x5d6671, metalness: 0.88, roughness: 0.28 }),
    polymer: new THREE.MeshStandardMaterial({ color: 0x17191d, metalness: 0.15, roughness: 0.62 }),
    glove: new THREE.MeshStandardMaterial({ color: 0x24272c, metalness: 0.05, roughness: 0.88 }),
    sleeve: new THREE.MeshStandardMaterial({ color: 0x2c3f5c, metalness: 0.1, roughness: 0.8 }),
    brass: new THREE.MeshStandardMaterial({ color: 0xc89b3c, metalness: 1, roughness: 0.25 }),
    shell: new THREE.MeshStandardMaterial({ color: 0xb3261e, metalness: 0.2, roughness: 0.5 }),
  };
}

function accent(color: number): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color: 0x111111, emissive: color, emissiveIntensity: 2.4, roughness: 0.4 });
}

function box(parent: THREE.Object3D, w: number, h: number, d: number, m: THREE.Material, x: number, y: number, z: number, rx = 0): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  mesh.position.set(x, y, z);
  mesh.rotation.x = rx;
  parent.add(mesh);
  return mesh;
}

function tube(parent: THREE.Object3D, r: number, len: number, m: THREE.Material, x: number, y: number, z: number, seg = 14): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, seg), m);
  mesh.rotation.x = Math.PI / 2;
  mesh.position.set(x, y, z);
  parent.add(mesh);
  return mesh;
}

/** Antebraço com luva, saindo de fora da tela até a mão. */
function arm(parent: THREE.Object3D, m: Mats, hand: THREE.Vector3, elbow: THREE.Vector3): void {
  const g = new THREE.Group();
  const dir = new THREE.Vector3().subVectors(hand, elbow);
  const len = dir.length();
  const fore = new THREE.Mesh(new THREE.CapsuleGeometry(0.035, len, 4, 10), m.sleeve);
  fore.position.copy(elbow).addScaledVector(dir, 0.5);
  fore.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
  g.add(fore);
  const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.04, 12), m.polymer);
  cuff.position.copy(hand).addScaledVector(dir, -0.06);
  cuff.quaternion.copy(fore.quaternion);
  g.add(cuff);
  const glove = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.055, 0.075), m.glove);
  glove.position.copy(hand);
  glove.quaternion.copy(fore.quaternion);
  g.add(glove);
  parent.add(g);
}

function pistol(m: Mats): GunModel {
  const root = new THREE.Group();
  const glow = accent(0x34e0ff);
  box(root, 0.03, 0.028, 0.16, m.polymer, 0, -0.002, -0.025);
  const slide = new THREE.Group();
  root.add(slide);
  box(slide, 0.033, 0.032, 0.185, m.dark, 0, 0.026, -0.03);
  box(slide, 0.0345, 0.004, 0.11, glow, 0, 0.03, -0.045);
  for (let i = 0; i < 6; i++) box(slide, 0.035, 0.024, 0.003, m.mid, 0, 0.026, 0.035 + i * 0.006);
  box(slide, 0.006, 0.008, 0.008, m.mid, 0, 0.046, -0.115);
  box(slide, 0.018, 0.008, 0.006, m.mid, 0, 0.046, 0.05);
  tube(root, 0.0065, 0.012, m.mid, 0, 0.026, -0.125);
  box(root, 0.029, 0.1, 0.042, m.polymer, 0, -0.058, 0.045, 0.22);
  box(root, 0.031, 0.012, 0.046, m.dark, 0, -0.106, 0.057, 0.22);
  box(root, 0.006, 0.004, 0.05, m.dark, 0, -0.03, -0.01);
  const muzzle = new THREE.Object3D();
  muzzle.position.set(0, 0.026, -0.135);
  root.add(muzzle);
  const eject = new THREE.Object3D();
  eject.position.set(0.02, 0.04, -0.005);
  root.add(eject);
  arm(root, m, new THREE.Vector3(0.002, -0.06, 0.052), new THREE.Vector3(0.14, -0.3, 0.38));
  arm(root, m, new THREE.Vector3(-0.025, -0.07, 0.03), new THREE.Vector3(-0.24, -0.32, 0.36));
  return { id: 'pistol', root, muzzle, eject, slide, mag: null, hip: new THREE.Vector3(0.17, -0.18, -0.43), kick: { back: 1.3, up: 9, side: 1.2 } };
}

function rifle(m: Mats): GunModel {
  const root = new THREE.Group();
  const glow = accent(0xff8a1a);
  box(root, 0.05, 0.068, 0.28, m.dark, 0, 0, 0);
  box(root, 0.03, 0.012, 0.32, m.mid, 0, 0.04, -0.03);
  box(root, 0.056, 0.056, 0.26, m.polymer, 0, 0.003, -0.27);
  for (let i = 0; i < 5; i++) box(root, 0.058, 0.014, 0.026, m.dark, 0, 0.012, -0.19 - i * 0.04);
  box(root, 0.0575, 0.005, 0.2, glow, 0, -0.012, -0.26);
  tube(root, 0.011, 0.2, m.mid, 0, 0.004, -0.49);
  tube(root, 0.018, 0.05, m.dark, 0, 0.004, -0.6, 8);
  const mag = new THREE.Group();
  mag.position.set(0, -0.04, -0.06);
  root.add(mag);
  box(mag, 0.032, 0.13, 0.055, m.polymer, 0, -0.06, 0, 0.2);
  box(mag, 0.034, 0.012, 0.06, glow, 0, -0.124, 0.014, 0.2);
  box(root, 0.03, 0.09, 0.04, m.polymer, 0, -0.068, 0.085, 0.32);
  box(root, 0.042, 0.068, 0.2, m.polymer, 0, -0.012, 0.24);
  box(root, 0.046, 0.085, 0.022, m.dark, 0, -0.02, 0.345);
  box(root, 0.034, 0.034, 0.065, m.dark, 0, 0.068, -0.03);
  const dot = new THREE.Mesh(new THREE.SphereGeometry(0.0025, 8, 6), accent(0xff2020));
  dot.position.set(0, 0.07, -0.064);
  root.add(dot);
  const slide = new THREE.Group();
  root.add(slide);
  box(slide, 0.016, 0.012, 0.03, m.mid, 0.03, 0.022, 0.06);
  const muzzle = new THREE.Object3D();
  muzzle.position.set(0, 0.004, -0.63);
  root.add(muzzle);
  const eject = new THREE.Object3D();
  eject.position.set(0.03, 0.02, -0.02);
  root.add(eject);
  arm(root, m, new THREE.Vector3(0.002, -0.07, 0.095), new THREE.Vector3(0.15, -0.3, 0.42));
  arm(root, m, new THREE.Vector3(-0.012, -0.035, -0.29), new THREE.Vector3(-0.27, -0.3, 0.05));
  return { id: 'rifle', root, muzzle, eject, slide, mag, hip: new THREE.Vector3(0.17, -0.185, -0.4), kick: { back: 0.9, up: 4.5, side: 1.6 } };
}

function shotgun(m: Mats): GunModel {
  const root = new THREE.Group();
  const glow = accent(0xff3a2a);
  box(root, 0.055, 0.075, 0.26, m.dark, 0, 0, 0);
  box(root, 0.0565, 0.006, 0.18, glow, 0, 0.022, 0.01);
  tube(root, 0.0145, 0.5, m.mid, 0, 0.02, -0.38);
  tube(root, 0.0125, 0.4, m.dark, 0, -0.016, -0.33);
  const slide = new THREE.Group();
  root.add(slide);
  tube(slide, 0.023, 0.16, m.polymer, 0, -0.012, -0.29);
  for (let i = 0; i < 6; i++) tube(slide, 0.0245, 0.008, m.dark, 0, -0.012, -0.23 - i * 0.022);
  box(root, 0.045, 0.08, 0.24, m.polymer, 0, -0.022, 0.25);
  box(root, 0.05, 0.095, 0.025, m.dark, 0, -0.028, 0.37);
  box(root, 0.03, 0.09, 0.04, m.polymer, 0, -0.072, 0.1, 0.3);
  for (let i = 0; i < 4; i++) tube(root, 0.0095, 0.05, m.shell, -0.033, 0.002, -0.06 + i * 0.03, 8).rotation.set(0, 0, Math.PI / 2);
  box(root, 0.008, 0.01, 0.012, m.mid, 0, 0.04, -0.62);
  const muzzle = new THREE.Object3D();
  muzzle.position.set(0, 0.02, -0.64);
  root.add(muzzle);
  const eject = new THREE.Object3D();
  eject.position.set(0.035, 0.02, 0.0);
  root.add(eject);
  arm(root, m, new THREE.Vector3(0.002, -0.07, 0.11), new THREE.Vector3(0.15, -0.3, 0.44));
  arm(root, m, new THREE.Vector3(-0.005, -0.03, -0.29), new THREE.Vector3(-0.27, -0.3, 0.02));
  return { id: 'shotgun', root, muzzle, eject, slide, mag: null, hip: new THREE.Vector3(0.17, -0.19, -0.41), kick: { back: 2.6, up: 16, side: 2.5 } };
}

export function buildGuns(): Record<WeaponId, GunModel> {
  const m = mats();
  return { pistol: pistol(m), rifle: rifle(m), shotgun: shotgun(m) };
}

export function shellMaterials(): { brass: THREE.MeshStandardMaterial; shell: THREE.MeshStandardMaterial } {
  const m = mats();
  return { brass: m.brass, shell: m.shell };
}
