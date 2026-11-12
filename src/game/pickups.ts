import * as THREE from 'three';
import type { EntityKind } from '../level/grid';

/** Itens no chão: munição, vida e armas. Giram e brilham; são coletados ao encostar. */
export type PickupKind = Extract<EntityKind, 'ammo' | 'health' | 'rifle' | 'shotgun'>;

export interface Pickup {
  readonly kind: PickupKind;
  readonly mesh: THREE.Group;
  taken: boolean;
}

const COLLECT_RADIUS = 1.15;
const COLORS: Readonly<Record<PickupKind, number>> = { ammo: 0xffb020, health: 0x30ff8a, rifle: 0xff8a1a, shotgun: 0xff3a2a };

let shared: { base: THREE.MeshStandardMaterial; ring: THREE.TorusGeometry; box: THREE.BoxGeometry; cross: THREE.BoxGeometry; gun: THREE.BoxGeometry } | null = null;

function materials() {
  shared ??= {
    base: new THREE.MeshStandardMaterial({ color: 0x2a3038, metalness: 0.8, roughness: 0.35 }),
    ring: new THREE.TorusGeometry(0.42, 0.025, 8, 32),
    box: new THREE.BoxGeometry(0.42, 0.26, 0.28),
    cross: new THREE.BoxGeometry(0.12, 0.36, 0.12),
    gun: new THREE.BoxGeometry(0.7, 0.12, 0.12),
  };
  return shared;
}

export function makePickup(kind: PickupKind, x: number, z: number): Pickup {
  const m = materials();
  const glow = new THREE.MeshStandardMaterial({ color: 0x111111, emissive: COLORS[kind], emissiveIntensity: 2.2 });
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  const ring = new THREE.Mesh(m.ring, glow);
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.04;
  g.add(ring);
  const item = new THREE.Group();
  item.name = 'item';
  item.position.y = 0.55;
  if (kind === 'ammo') {
    item.add(new THREE.Mesh(m.box, m.base));
    const band = new THREE.Mesh(new THREE.BoxGeometry(0.43, 0.06, 0.29), glow);
    item.add(band);
  } else if (kind === 'health') {
    const a = new THREE.Mesh(m.cross, glow);
    const b = new THREE.Mesh(m.cross, glow);
    b.rotation.z = Math.PI / 2;
    item.add(a, b);
  } else {
    item.add(new THREE.Mesh(m.gun, m.base));
    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.16, 0.1), m.base);
    stock.position.set(0.38, -0.03, 0);
    const strip = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.03, 0.13), glow);
    strip.position.y = 0.04;
    item.add(stock, strip);
    if (kind === 'shotgun') item.scale.set(1.15, 1.2, 1.2);
  }
  g.add(item);
  return { kind, mesh: g, taken: false };
}

export function updatePickups(pickups: readonly Pickup[], t: number): void {
  for (const p of pickups) {
    if (p.taken) continue;
    const item = p.mesh.getObjectByName('item');
    if (!item) continue;
    item.rotation.y = t * 1.6;
    item.position.y = 0.55 + Math.sin(t * 2.2 + p.mesh.position.x) * 0.06;
  }
}

/** Devolve o item coletado neste quadro, se houver. */
export function collect(pickups: readonly Pickup[], x: number, y: number, z: number, accept: (k: PickupKind) => boolean): Pickup | null {
  for (const p of pickups) {
    if (p.taken || y > 1.4) continue;
    const dx = p.mesh.position.x - x;
    const dz = p.mesh.position.z - z;
    if (dx * dx + dz * dz > COLLECT_RADIUS * COLLECT_RADIUS || !accept(p.kind)) continue;
    p.taken = true;
    p.mesh.visible = false;
    return p;
  }
  return null;
}
