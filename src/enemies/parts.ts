import * as THREE from 'three';

/** Materiais-base dos robôs (cada robô clona os que piscam ao levar tiro). */
export const ROBOT = {
  shell: new THREE.MeshStandardMaterial({ color: 0xc9ced6, roughness: 0.35, metalness: 0.7 }),
  dark: new THREE.MeshStandardMaterial({ color: 0x23272e, roughness: 0.5, metalness: 0.8 }),
  hazard: new THREE.MeshStandardMaterial({ color: 0xe0a21c, roughness: 0.5, metalness: 0.4 }),
  red: new THREE.MeshStandardMaterial({ color: 0x8a1f1a, roughness: 0.45, metalness: 0.6 }),
  eyeRed: new THREE.MeshStandardMaterial({ color: 0x220000, emissive: 0xff2a1a, emissiveIntensity: 3 }),
  eyeCyan: new THREE.MeshStandardMaterial({ color: 0x001a22, emissive: 0x3ff0ff, emissiveIntensity: 3 }),
  eyeOrange: new THREE.MeshStandardMaterial({ color: 0x221000, emissive: 0xff9020, emissiveIntensity: 3 }),
  shield: new THREE.MeshBasicMaterial({ color: 0x4fb8ff, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
} as const;

const geoCache = new Map<string, THREE.BufferGeometry>();

/** Geometrias compartilhadas por chave: os robôs do mesmo tipo reaproveitam os buffers. */
export function geo(key: string, make: () => THREE.BufferGeometry): THREE.BufferGeometry {
  let g = geoCache.get(key);
  if (!g) {
    g = make();
    geoCache.set(key, g);
  }
  return g;
}

export function part(geometry: THREE.BufferGeometry, mat: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
  const m = new THREE.Mesh(geometry, mat);
  m.position.set(x, y, z);
  m.castShadow = false;
  return m;
}

/** Ponto de referência sem malha (centro de zona de acerto). */
export function anchor(parent: THREE.Object3D, x: number, y: number, z: number): THREE.Object3D {
  const o = new THREE.Object3D();
  o.position.set(x, y, z);
  parent.add(o);
  return o;
}
