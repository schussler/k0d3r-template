import * as THREE from 'three';
import { CollisionWorld, type Box, type Surface } from '../world/collision';
import { crateTexture, floorTextures, panelTextures, rng } from '../render/textures';
import { CELL, type Grid, type Tile, cellCenter, entitiesOf, tileAt } from './grid';
import type { Theme } from './themes';

/** Altura de quem agacha é 1,1 m: a caixa baixa precisa passar do olho agachado para esconder. */
export const CRATE_HEIGHT = 1.15;
const STACK_HEIGHT = 2.4;
const LOWER_BAND = 3.6;
const MAX_LAMPS = 8;

export interface BuiltDoor {
  readonly index: number;
  readonly mesh: THREE.Mesh;
  readonly box: Box;
  readonly col: number;
  readonly row: number;
  open: boolean;
  progress: number;
}

export interface BuiltLevel {
  readonly group: THREE.Group;
  readonly world: CollisionWorld;
  readonly doors: BuiltDoor[];
  readonly lamps: THREE.PointLight[];
  readonly key: THREE.DirectionalLight;
  readonly spawn: { x: number; z: number; yaw: number };
  readonly exitCells: { col: number; row: number }[];
  /** Destrava a saída: o portão some e a luz fica verde. */
  setExitOpen(open: boolean): void;
  update(dt: number): void;
  dispose(): void;
}

function addBox(world: CollisionWorld, cx: number, cz: number, half: number, height: number, surface: Surface, minY = 0): Box {
  return world.add({ minX: cx - half, maxX: cx + half, minZ: cz - half, maxZ: cz + half, minY, maxY: height, surface, enabled: true });
}

function instanced(geo: THREE.BufferGeometry, mat: THREE.Material, count: number, shadows = true): THREE.InstancedMesh {
  const m = new THREE.InstancedMesh(geo, mat, Math.max(1, count));
  m.count = count;
  m.castShadow = shadows;
  m.receiveShadow = true;
  return m;
}

/** Caixa com UV em metros, para a textura de parede não esticar com o pé-direito. */
function boxWithMeterUV(w: number, h: number, d: number, tile: number): THREE.BoxGeometry {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.getAttribute('uv') as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) {
    const face = Math.floor(i / 4);
    const sx = face < 2 ? d : w;
    const sy = face === 2 || face === 3 ? d : h;
    uv.setXY(i, (uv.getX(i) * sx) / tile, (uv.getY(i) * sy) / tile);
  }
  return g;
}

export function buildLevel(grid: Grid, theme: Theme): BuiltLevel {
  const group = new THREE.Group();
  group.name = 'level';
  const H = theme.wallHeight;
  const world = new CollisionWorld(grid.cols, grid.rows, CELL, 0, H);
  const disposables: { dispose(): void }[] = [];
  const track = <T extends { dispose(): void }>(x: T): T => {
    disposables.push(x);
    return x;
  };
  const r = rng(grid.cols * 131 + grid.rows);

  const cells = (pred: (t: Tile) => boolean) => {
    const out: { col: number; row: number }[] = [];
    for (let row = 0; row < grid.rows; row++) for (let col = 0; col < grid.cols; col++) if (pred(tileAt(grid, col, row))) out.push({ col, row });
    return out;
  };

  // Paredes: faixa de baixo com painel e luz embutida; parte de cima com painel liso.
  const panel = panelTextures(theme.wallBase, theme.wallSeam, theme.wallGlow, 3);
  const lowerMat = track(new THREE.MeshStandardMaterial({
    map: panel.map, bumpMap: panel.bump, bumpScale: 2, emissiveMap: panel.emissive, emissive: 0xffffff,
    emissiveIntensity: 1.4, roughness: 0.55, metalness: 0.55,
  }));
  const upperMat = track(new THREE.MeshStandardMaterial({ map: panel.map, bumpMap: panel.bump, bumpScale: 2, roughness: 0.6, metalness: 0.5, color: 0x9aa3ad }));
  const walls = cells((t) => t === 'wall');
  const lowerGeo = track(boxWithMeterUV(CELL, LOWER_BAND, CELL, CELL));
  lowerGeo.translate(0, LOWER_BAND / 2, 0);
  const upperH = Math.max(0.1, H - LOWER_BAND);
  const upperGeo = track(boxWithMeterUV(CELL, upperH, CELL, CELL * 1.6));
  upperGeo.translate(0, LOWER_BAND + upperH / 2, 0);
  const lowerMesh = instanced(lowerGeo, lowerMat, walls.length);
  const upperMesh = instanced(upperGeo, upperMat, walls.length);
  const m4 = new THREE.Matrix4();
  walls.forEach(({ col, row }, i) => {
    const c = cellCenter(col, row);
    m4.makeTranslation(c.x, 0, c.z);
    lowerMesh.setMatrixAt(i, m4);
    upperMesh.setMatrixAt(i, m4);
    addBox(world, c.x, c.z, CELL / 2, H, 'metal');
  });
  group.add(lowerMesh, upperMesh);

  // Vidro: painel fino com moldura; colide como parede.
  const glass = cells((t) => t === 'glass');
  if (glass.length > 0) {
    const glassMat = track(new THREE.MeshPhysicalMaterial({
      color: 0x9fd8ff, transparent: true, opacity: 0.16, roughness: 0.05, metalness: 0, envMapIntensity: 1.5, depthWrite: false,
    }));
    const frameMat = track(new THREE.MeshStandardMaterial({ color: 0x2a3038, metalness: 0.8, roughness: 0.35 }));
    const paneGeo = track(new THREE.BoxGeometry(CELL, H, 0.06));
    paneGeo.translate(0, H / 2, 0);
    const mullionGeo = track(new THREE.BoxGeometry(0.22, H, 0.3));
    mullionGeo.translate(-CELL / 2, H / 2, 0);
    const panes = instanced(paneGeo, glassMat, glass.length, false);
    const mullions = instanced(mullionGeo, frameMat, glass.length);
    glass.forEach(({ col, row }, i) => {
      const c = cellCenter(col, row);
      // A vidraça fica de frente para o lado aberto do setor.
      const vertical = tileAt(grid, col - 1, row) !== 'floor' && tileAt(grid, col + 1, row) !== 'floor';
      m4.makeRotationY(vertical ? 0 : Math.PI / 2).setPosition(c.x, 0, c.z);
      panes.setMatrixAt(i, m4);
      mullions.setMatrixAt(i, m4);
      addBox(world, c.x, c.z, CELL / 2, H, 'glass');
    });
    panes.renderOrder = 2;
    group.add(panes, mullions);
  }

  // Caixas baixas e pilhas.
  const crateMat = track(new THREE.MeshStandardMaterial({ map: crateTexture('#5d6670', '#d9a400', 5), roughness: 0.6, metalness: 0.35 }));
  const crateMat2 = track(new THREE.MeshStandardMaterial({ map: crateTexture('#7a4a2a', '#e8e0d0', 9), roughness: 0.7, metalness: 0.2 }));
  const crates = cells((t) => t === 'crate');
  const crateGeo = track(new THREE.BoxGeometry(1.8, CRATE_HEIGHT, 1.8));
  crateGeo.translate(0, CRATE_HEIGHT / 2, 0);
  const crateMesh = instanced(crateGeo, crateMat, crates.length);
  crates.forEach(({ col, row }, i) => {
    const c = cellCenter(col, row);
    m4.makeRotationY((r() - 0.5) * 0.12).setPosition(c.x, 0, c.z);
    crateMesh.setMatrixAt(i, m4);
    addBox(world, c.x, c.z, 0.9, CRATE_HEIGHT, 'crate');
  });
  const stacks = cells((t) => t === 'stack');
  const stackGeo = track(new THREE.BoxGeometry(1.9, STACK_HEIGHT / 2, 1.9));
  stackGeo.translate(0, STACK_HEIGHT / 4, 0);
  const stackMesh = instanced(stackGeo, crateMat2, stacks.length * 2);
  stacks.forEach(({ col, row }, i) => {
    const c = cellCenter(col, row);
    m4.makeRotationY((r() - 0.5) * 0.1).setPosition(c.x, 0, c.z);
    stackMesh.setMatrixAt(i * 2, m4);
    m4.makeRotationY((r() - 0.5) * 0.3).setPosition(c.x + (r() - 0.5) * 0.1, STACK_HEIGHT / 2, c.z + (r() - 0.5) * 0.1);
    stackMesh.setMatrixAt(i * 2 + 1, m4);
    addBox(world, c.x, c.z, 0.95, STACK_HEIGHT, 'crate');
  });
  group.add(crateMesh, stackMesh);

  // Pilares.
  const pillars = cells((t) => t === 'pillar');
  if (pillars.length > 0) {
    const pillarGeo = track(new THREE.CylinderGeometry(0.62, 0.75, H, 12));
    pillarGeo.translate(0, H / 2, 0);
    const pillarMat = track(new THREE.MeshStandardMaterial({ color: 0x59636e, metalness: 0.7, roughness: 0.4, map: panel.map }));
    const pm = instanced(pillarGeo, pillarMat, pillars.length);
    pillars.forEach(({ col, row }, i) => {
      const c = cellCenter(col, row);
      m4.makeTranslation(c.x, 0, c.z);
      pm.setMatrixAt(i, m4);
      addBox(world, c.x, c.z, 0.65, H, 'metal');
    });
    group.add(pm);
  }

  // Piso e teto.
  const W = grid.cols * CELL;
  const D = grid.rows * CELL;
  const fl = floorTextures(theme.floorBase, theme.floorLine, 4, theme.hazardFloor);
  for (const t of [fl.map, fl.bump]) t.repeat.set(grid.cols, grid.rows);
  const floor = new THREE.Mesh(
    track(new THREE.PlaneGeometry(W, D)),
    track(new THREE.MeshStandardMaterial({ map: fl.map, bumpMap: fl.bump, bumpScale: 1.5, roughness: 0.5, metalness: 0.6 })),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(W / 2, 0, D / 2);
  floor.receiveShadow = true;
  group.add(floor);
  const ceilTex = panelTextures('#1f242b', '#0c0f12', '#000000', 8);
  ceilTex.map.repeat.set(grid.cols / 2, grid.rows / 2);
  const ceiling = new THREE.Mesh(
    track(new THREE.PlaneGeometry(W, D)),
    track(new THREE.MeshStandardMaterial({ map: ceilTex.map, roughness: 0.8, metalness: 0.4 })),
  );
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.set(W / 2, H, D / 2);
  group.add(ceiling);

  // Luzes: hemisférica de base, uma chave com sombra e lâmpadas pontuais nas marcas `l`.
  group.add(new THREE.HemisphereLight(theme.hemiSky, theme.hemiGround, theme.hemiIntensity));
  const key = new THREE.DirectionalLight(theme.keyColor, theme.keyIntensity);
  key.position.set(W * 0.3, H * 3, D * 0.2);
  key.target.position.set(W / 2, 0, D / 2);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  const half = Math.max(W, D) / 2 + 4;
  Object.assign(key.shadow.camera, { left: -half, right: half, top: half, bottom: -half, near: 1, far: H * 6 });
  key.shadow.bias = -0.0005;
  key.shadow.normalBias = 0.04;
  group.add(key, key.target);
  ceiling.castShadow = false;

  const lampEntities = entitiesOf(grid, 'light').slice(0, MAX_LAMPS);
  const lamps: THREE.PointLight[] = [];
  const fixtureGeo = track(new THREE.BoxGeometry(2.4, 0.18, 0.5));
  const fixtureMat = track(new THREE.MeshStandardMaterial({ color: 0x111111, emissive: theme.lampColor, emissiveIntensity: 3 }));
  const fixtures = instanced(fixtureGeo, fixtureMat, lampEntities.length, false);
  lampEntities.forEach((e, i) => {
    const c = cellCenter(e.col, e.row);
    const lamp = new THREE.PointLight(theme.lampColor, theme.lampIntensity, H * 3.2, 2);
    lamp.position.set(c.x, H - 1.2, c.z);
    group.add(lamp);
    lamps.push(lamp);
    m4.makeTranslation(c.x, H - 0.1, c.z);
    fixtures.setMatrixAt(i, m4);
  });
  group.add(fixtures);

  // Portas: placa que desliza para cima ao abrir.
  const doorMat = track(new THREE.MeshStandardMaterial({ color: 0x6a717a, metalness: 0.75, roughness: 0.35, emissive: 0x220000, map: panel.map }));
  const doors: BuiltDoor[] = grid.doors.map((d) => {
    const c = cellCenter(d.col, d.row);
    const mesh = new THREE.Mesh(track(new THREE.BoxGeometry(CELL, Math.min(H, 3.4), CELL * 0.4)), doorMat);
    const vertical = tileAt(grid, d.col, d.row - 1) === 'wall' || tileAt(grid, d.col, d.row + 1) === 'wall';
    if (vertical) mesh.rotation.y = Math.PI / 2;
    mesh.position.set(c.x, Math.min(H, 3.4) / 2, c.z);
    mesh.castShadow = true;
    group.add(mesh);
    return { index: d.index, mesh, box: addBox(world, c.x, c.z, CELL / 2, H, 'door'), col: d.col, row: d.row, open: false, progress: 0 };
  });

  // Saída: portão com luz de estado; travado até o setor liberar.
  const exitCells = cells((t) => t === 'exit');
  const gateMat = track(new THREE.MeshStandardMaterial({ color: 0x30363d, metalness: 0.8, roughness: 0.3, emissive: 0xff2a1a, emissiveIntensity: 0.6 }));
  const gates = exitCells.map(({ col, row }) => {
    const c = cellCenter(col, row);
    const mesh = new THREE.Mesh(track(new THREE.BoxGeometry(CELL, 3.4, CELL * 0.5)), gateMat);
    mesh.position.set(c.x, 1.7, c.z);
    group.add(mesh);
    return { mesh, box: addBox(world, c.x, c.z, CELL / 2, H, 'door') };
  });
  // Verga sobre portões e portas: fecha o vão até o teto.
  const lintels = [...exitCells, ...grid.doors];
  const lintelH = H - 3.4;
  if (lintelH > 0.05 && lintels.length > 0) {
    const lg = track(boxWithMeterUV(CELL, lintelH, CELL, CELL * 1.6));
    lg.translate(0, 3.4 + lintelH / 2, 0);
    const lm = instanced(lg, upperMat, lintels.length);
    lintels.forEach(({ col, row }, i) => {
      const c = cellCenter(col, row);
      lm.setMatrixAt(i, m4.makeTranslation(c.x, 0, c.z));
    });
    group.add(lm);
  }
  let exitOpen = false;
  let exitProgress = 0;

  const p = entitiesOf(grid, 'player')[0];
  const sp = p ? cellCenter(p.col, p.row) : { x: W / 2, z: D / 2 };
  const ex = exitCells[0] ? cellCenter(exitCells[0].col, exitCells[0].row) : { x: sp.x, z: 0 };
  const yaw = Math.atan2(-(ex.x - sp.x), -(ex.z - sp.z));

  return {
    group, world, doors, lamps, key, exitCells,
    spawn: { x: sp.x, z: sp.z, yaw },
    setExitOpen(open: boolean) {
      exitOpen = open;
      gateMat.emissive.setHex(open ? 0x22ff66 : 0xff2a1a);
      for (const g of gates) g.box.enabled = !open;
    },
    update(dt: number) {
      exitProgress = Math.max(0, Math.min(1, exitProgress + (exitOpen ? dt : -dt) * 0.8));
      for (const g of gates) g.mesh.position.y = 1.7 + exitProgress * 3.3;
      for (const d of doors) {
        d.progress = Math.max(0, Math.min(1, d.progress + (d.open ? dt : -dt) * 1.6));
        d.mesh.position.y = Math.min(H, 3.4) / 2 + d.progress * 3.2;
        d.box.enabled = d.progress < 0.7;
      }
    },
    dispose() {
      for (const d of disposables) d.dispose();
      for (const m of [lowerMesh, upperMesh, crateMesh, stackMesh, fixtures]) m.dispose();
    },
  };
}
