import * as THREE from 'three';
import { CELL, type Cell, type LevelData } from '../logic/level';
import type { SectorDef } from '../logic/maps';
import { createRng } from '../logic/math';
import type { Disposables } from './build-level';
import { glowTexture, hazardTexture, leafTexture, screenTexture } from './textures';

type Updater = (t: number, dt: number) => void;

/** Decoração sem colisão de cada setor: dá a identidade visual (naves, tubos, plantas, reator). */
export function buildDecor(def: SectorDef, level: LevelData, group: THREE.Group, d: Disposables, planters: readonly Cell[]): Updater[] {
  const rng = createRng(def.seed + 1);
  switch (def.id) {
    case 'hangar':
      return hangarDecor(level, def.ceiling, group, d);
    case 'labs':
      return labsDecor(level, def.ceiling, group, d, rng);
    case 'greenhouse':
      return greenhouseDecor(def.ceiling, group, d, planters, rng);
    case 'core':
      return coreDecor(level, def.ceiling, group, d);
  }
}

function shipModel(d: Disposables, hull: THREE.Material, glow: THREE.Material): THREE.Group {
  const ship = new THREE.Group();
  const body = new THREE.Mesh(d.add(new THREE.BoxGeometry(3.2, 2.2, 9)), hull);
  const nose = new THREE.Mesh(d.add(new THREE.CylinderGeometry(0.4, 1.6, 3, 6)), hull);
  nose.rotation.x = Math.PI / 2;
  nose.position.z = 6;
  const wing = new THREE.Mesh(d.add(new THREE.BoxGeometry(11, 0.3, 3)), hull);
  wing.position.set(0, -0.3, -1.5);
  const fin = new THREE.Mesh(d.add(new THREE.BoxGeometry(0.3, 2.4, 2.2)), hull);
  fin.position.set(0, 2, -3.4);
  ship.add(body, nose, wing, fin);
  for (const x of [-1, 1]) {
    const engine = new THREE.Mesh(d.add(new THREE.CylinderGeometry(0.55, 0.65, 1, 12)), glow);
    engine.rotation.x = Math.PI / 2;
    engine.position.set(x, 0, -4.6);
    ship.add(engine);
  }
  ship.traverse((o) => {
    if (o instanceof THREE.Mesh) o.castShadow = false;
  });
  return ship;
}

function hangarDecor(level: LevelData, H: number, group: THREE.Group, d: Disposables): Updater[] {
  const W = level.grid.width * CELL;
  const D = level.grid.depth * CELL;
  const hull = d.add(new THREE.MeshStandardMaterial({ color: 0x8b96a3, roughness: 0.45, metalness: 0.7 }));
  const glow = d.add(new THREE.MeshBasicMaterial({ color: 0x5fd0ff }));
  const cable = d.add(new THREE.MeshStandardMaterial({ color: 0x222831, metalness: 0.8, roughness: 0.4 }));
  const ships: THREE.Group[] = [];
  for (const [x, z, rot] of [
    [W * 0.3, D * 0.55, 0.4],
    [W * 0.7, D * 0.35, -0.8],
  ] as const) {
    const ship = shipModel(d, hull, glow);
    ship.position.set(x, H - 4.2, z);
    ship.rotation.y = rot;
    for (const off of [-3, 3]) {
      const c = new THREE.Mesh(d.add(new THREE.CylinderGeometry(0.05, 0.05, 3)), cable);
      c.position.set(0, 2.6, off);
      ship.add(c);
    }
    group.add(ship);
    ships.push(ship);
  }
  // Vigas da ponte rolante.
  const beamMat = d.add(new THREE.MeshStandardMaterial({ map: hazardTexture(), roughness: 0.6, metalness: 0.4 }));
  for (const z of [D * 0.25, D * 0.75]) {
    const beam = new THREE.Mesh(d.add(new THREE.BoxGeometry(W, 0.7, 0.9)), beamMat);
    beam.position.set(W / 2, H - 0.8, z);
    group.add(beam);
  }
  // Painéis de luz no teto.
  const panel = d.add(new THREE.MeshBasicMaterial({ color: 0xcfe6ff }));
  const geo = d.add(new THREE.PlaneGeometry(6, 1));
  for (let x = 8; x < W - 4; x += 12) {
    for (let z = 10; z < D - 4; z += 12) {
      const p = new THREE.Mesh(geo, panel);
      p.rotation.x = Math.PI / 2;
      p.position.set(x, H - 0.05, z);
      group.add(p);
    }
  }
  return [
    (t) => {
      ships.forEach((s, n) => {
        s.rotation.z = Math.sin(t * 0.4 + n) * 0.015;
        s.position.y = H - 4.2 + Math.sin(t * 0.5 + n * 2) * 0.08;
      });
    },
  ];
}

function labsDecor(level: LevelData, H: number, group: THREE.Group, d: Disposables, rng: () => number): Updater[] {
  const grid = level.grid;
  const screens = [screenTexture('#39ff9c'), screenTexture('#58c7ff')].map((map) => d.add(new THREE.MeshBasicMaterial({ map })));
  const frame = d.add(new THREE.MeshStandardMaterial({ color: 0x3a3f46, roughness: 0.4, metalness: 0.7 }));
  const screenGeo = d.add(new THREE.PlaneGeometry(1.2, 0.8));
  const frameGeo = d.add(new THREE.BoxGeometry(1.35, 0.95, 0.06));
  const tubeGlass = d.add(new THREE.MeshStandardMaterial({ color: 0x9fe8d0, transparent: true, opacity: 0.25, roughness: 0.05, metalness: 0.2 }));
  const tubeLiquid = d.add(new THREE.MeshBasicMaterial({ color: 0x2bff9e }));
  const liquidMats: THREE.MeshBasicMaterial[] = [tubeLiquid];
  for (let j = 0; j < grid.depth; j++) {
    for (let i = 0; i < grid.width; i++) {
      const c = grid.charAt(i, j);
      if (c === '#' && rng() < 0.12) {
        for (const [di, dj] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ] as const) {
          if (!grid.isWalkable(i + di, j + dj)) continue;
          const holder = new THREE.Group();
          holder.position.set(i * CELL + CELL / 2 + di * (CELL / 2 + 0.04), 1.6, j * CELL + CELL / 2 + dj * (CELL / 2 + 0.04));
          holder.lookAt(holder.position.x + di, 1.6, holder.position.z + dj);
          holder.add(new THREE.Mesh(frameGeo, frame));
          const s = new THREE.Mesh(screenGeo, screens[(i + j) % 2]!);
          s.position.z = 0.035;
          holder.add(s);
          group.add(holder);
          break;
        }
      }
      if (c === 'o') {
        // Bancada com tubos de amostra luminosos.
        for (let n = 0; n < 3; n++) {
          const x = i * CELL + 0.45 + n * 0.55;
          const z = j * CELL + CELL / 2 + (rng() - 0.5) * 0.6;
          const glass = new THREE.Mesh(d.add(new THREE.CylinderGeometry(0.16, 0.16, 0.7, 12)), tubeGlass);
          glass.position.set(x, 1.35, z);
          const liquid = new THREE.Mesh(d.add(new THREE.CylinderGeometry(0.12, 0.12, 0.45, 10)), tubeLiquid);
          liquid.position.set(x, 1.25, z);
          group.add(glass, liquid);
        }
      }
    }
  }
  // Canos no teto ao longo do mapa.
  const pipeMat = d.add(new THREE.MeshStandardMaterial({ color: 0x6d737b, roughness: 0.35, metalness: 0.8 }));
  const W = grid.width * CELL;
  for (const z of [6, 18, 34]) {
    const pipe = new THREE.Mesh(d.add(new THREE.CylinderGeometry(0.14, 0.14, W)), pipeMat);
    pipe.rotation.z = Math.PI / 2;
    pipe.position.set(W / 2, H - 0.35, z);
    group.add(pipe);
  }
  return [
    (t) => {
      for (const m of liquidMats) m.color.setHSL(0.42, 1, 0.45 + 0.1 * Math.sin(t * 2));
    },
  ];
}

const SWAY_VERTEX = /* glsl */ `
  #include <begin_vertex>
  float swayH = max(position.y + 0.5, 0.0);
  vec4 swayBase = instanceMatrix[3];
  transformed.x += sin(swayTime * 1.3 + swayBase.x * 0.7 + swayBase.z * 0.3) * 0.09 * swayH;
  transformed.z += cos(swayTime * 1.1 + swayBase.z * 0.5) * 0.07 * swayH;
`;

function greenhouseDecor(H: number, group: THREE.Group, d: Disposables, planters: readonly Cell[], rng: () => number): Updater[] {
  const soil = d.add(new THREE.MeshStandardMaterial({ color: 0x3b2a1e, roughness: 0.95 }));
  const rim = d.add(new THREE.MeshStandardMaterial({ color: 0x5b6670, roughness: 0.5, metalness: 0.6 }));
  const soilGeo = d.add(new THREE.BoxGeometry(CELL, 0.5, CELL));
  const soilMesh = new THREE.InstancedMesh(soilGeo, rim, Math.max(1, planters.length));
  const topMesh = new THREE.InstancedMesh(d.add(new THREE.PlaneGeometry(CELL * 0.92, CELL * 0.92)), soil, Math.max(1, planters.length));
  const m = new THREE.Matrix4();
  const flat = new THREE.Matrix4().makeRotationX(-Math.PI / 2);
  planters.forEach((c, n) => {
    m.makeTranslation(c.i * CELL + CELL / 2, 0.25, c.j * CELL + CELL / 2);
    soilMesh.setMatrixAt(n, m);
    m.makeTranslation(c.i * CELL + CELL / 2, 0.51, c.j * CELL + CELL / 2).multiply(flat);
    topMesh.setMatrixAt(n, m);
  });
  soilMesh.receiveShadow = true;
  group.add(soilMesh, topMesh);

  const swayTime = { value: 0 };
  const leafMat = d.add(
    new THREE.MeshStandardMaterial({ map: leafTexture(), alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.7 }),
  );
  leafMat.onBeforeCompile = (shader) => {
    shader.uniforms.swayTime = swayTime;
    shader.vertexShader = `uniform float swayTime;\n${shader.vertexShader.replace('#include <begin_vertex>', SWAY_VERTEX)}`;
  };
  const leafGeo = d.add(new THREE.PlaneGeometry(0.7, 1.4));
  leafGeo.translate(0, 0.7, 0);
  const leaves: THREE.Matrix4[] = [];
  const trees: THREE.Matrix4[] = [];
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  for (const c of planters) {
    for (let p = 0; p < 2; p++) {
      const px = c.i * CELL + 0.5 + rng() * 1;
      const pz = c.j * CELL + 0.5 + rng() * 1;
      const scale = 0.7 + rng() * 0.9;
      for (let n = 0; n < 6; n++) {
        e.set(-0.35 - rng() * 0.4, (n / 6) * Math.PI * 2 + rng() * 0.4, 0, 'YXZ');
        q.setFromEuler(e);
        leaves.push(new THREE.Matrix4().compose(new THREE.Vector3(px, 0.5, pz), q, new THREE.Vector3(scale, scale, scale)));
      }
    }
    if (rng() < 0.18) trees.push(new THREE.Matrix4().makeTranslation(c.i * CELL + CELL / 2, 0.5, c.j * CELL + CELL / 2));
  }
  const leafMesh = new THREE.InstancedMesh(leafGeo, leafMat, Math.max(1, leaves.length));
  leaves.forEach((mm, n) => leafMesh.setMatrixAt(n, mm));
  leafMesh.count = leaves.length;
  group.add(leafMesh);

  const trunkMat = d.add(new THREE.MeshStandardMaterial({ color: 0x4a3626, roughness: 0.9 }));
  const canopyMat = d.add(new THREE.MeshStandardMaterial({ color: 0x3f8f4a, roughness: 0.8, flatShading: true }));
  const trunkGeo = d.add(new THREE.CylinderGeometry(0.12, 0.2, 3.2, 7));
  trunkGeo.translate(0, 1.6, 0);
  const canopyGeo = d.add(new THREE.IcosahedronGeometry(1.4, 1));
  canopyGeo.translate(0, 3.6, 0);
  const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, Math.max(1, trees.length));
  const canopies = new THREE.InstancedMesh(canopyGeo, canopyMat, Math.max(1, trees.length));
  trees.forEach((mm, n) => {
    trunks.setMatrixAt(n, mm);
    canopies.setMatrixAt(n, mm);
  });
  trunks.count = canopies.count = trees.length;
  canopies.castShadow = true;
  group.add(trunks, canopies);

  // Barras de luz de cultivo suspensas sobre os canteiros.
  const lampMat = d.add(new THREE.MeshBasicMaterial({ color: 0xe08bff }));
  const lampGeo = d.add(new THREE.BoxGeometry(0.2, 0.08, CELL * 6));
  const rows = new Set(planters.map((c) => `${c.i}`));
  for (const key of rows) {
    const i = Number(key);
    const cells = planters.filter((c) => c.i === i);
    const z0 = Math.min(...cells.map((c) => c.j));
    const z1 = Math.max(...cells.map((c) => c.j));
    for (let z = z0; z <= z1; z += 6) {
      const lamp = new THREE.Mesh(lampGeo, lampMat);
      lamp.position.set(i * CELL + CELL / 2, H - 3.5, z * CELL + CELL * 3);
      group.add(lamp);
    }
  }
  return [(t) => (swayTime.value = t)];
}

function coreDecor(level: LevelData, H: number, group: THREE.Group, d: Disposables): Updater[] {
  const W = level.grid.width * CELL;
  const D = level.grid.depth * CELL;
  const reactor = new THREE.Group();
  reactor.position.set(W / 2, H - 3.2, D / 2);
  const coreMat = d.add(new THREE.MeshBasicMaterial({ color: 0x9a7bff }));
  const core = new THREE.Mesh(d.add(new THREE.IcosahedronGeometry(1.8, 2)), coreMat);
  reactor.add(core);
  const ringMat = d.add(new THREE.MeshStandardMaterial({ color: 0x3b3f55, metalness: 0.9, roughness: 0.3, emissive: 0x2a1c66 }));
  const rings = [3, 4.2, 5.4].map((r, n) => {
    const ring = new THREE.Mesh(d.add(new THREE.TorusGeometry(r, 0.18, 8, 64)), ringMat);
    ring.rotation.x = n * 0.8;
    reactor.add(ring);
    return ring;
  });
  const halo = new THREE.Sprite(d.add(new THREE.SpriteMaterial({ map: glowTexture(), color: 0x8c6bff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })));
  halo.scale.set(12, 12, 1);
  reactor.add(halo);
  group.add(reactor);
  // Feixe de energia do reator ao chão.
  const beamMat = d.add(new THREE.MeshBasicMaterial({ color: 0x6f4cff, transparent: true, opacity: 0.25, blending: THREE.AdditiveBlending, depthWrite: false }));
  // O feixe termina acima da cabeça do chefe (que fica no centro), para não o lavar de luz.
  const beamBottom = 8;
  const beam = new THREE.Mesh(d.add(new THREE.CylinderGeometry(0.5, 1, H - 3 - beamBottom, 16, 1, true)), beamMat);
  beam.position.set(W / 2, beamBottom + (H - 3 - beamBottom) / 2, D / 2);
  group.add(beam);
  // Faixas cianas nos pilares (caixas altas).
  const stripeMat = d.add(new THREE.MeshBasicMaterial({ color: 0x44e0ff }));
  const stripeGeo = d.add(new THREE.BoxGeometry(CELL * 0.96, 0.1, CELL * 0.96));
  for (let j = 0; j < level.grid.depth; j++) {
    for (let i = 0; i < level.grid.width; i++) {
      if (level.grid.charAt(i, j) !== 'O') continue;
      for (const y of [0.6, 1.8]) {
        const s = new THREE.Mesh(stripeGeo, stripeMat);
        s.position.set(i * CELL + CELL / 2, y, j * CELL + CELL / 2);
        group.add(s);
      }
    }
  }
  return [
    (t) => {
      const pulse = 0.7 + 0.3 * Math.sin(t * 3);
      coreMat.color.setRGB(0.6 * pulse, 0.48 * pulse, 1.4 * pulse);
      core.rotation.y = t * 0.5;
      rings.forEach((r, n) => {
        r.rotation.y = t * (0.3 + n * 0.2);
        r.rotation.z = t * 0.15 * (n % 2 ? 1 : -1);
      });
      beamMat.opacity = 0.18 + 0.1 * Math.sin(t * 6);
    },
  ];
}
