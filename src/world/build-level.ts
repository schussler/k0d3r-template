import * as THREE from 'three';
import { ALARM_PERIOD } from '../audio/audio';
import { CELL, isDoorChar, type Cell, type LevelData, type SwitchSpawn } from '../logic/level';
import type { SectorDef } from '../logic/maps';
import { createRng } from '../logic/math';
import { buildDecor } from './decor';
import { createPlanet, createStars } from './sky';
import { crateTexture, floorTexture, glowTexture, panelTexture } from './textures';
import { THEMES, type Theme } from './themes';

export interface DoorVisual {
  readonly id: string;
  readonly meshes: THREE.Mesh[];
  readonly height: number;
  readonly center: THREE.Vector3;
}

export interface SwitchVisual {
  readonly spawn: SwitchSpawn;
  readonly screen: THREE.MeshBasicMaterial;
  readonly beacon: THREE.Sprite;
  /** Ponto (no mundo) do painel, usado para a distância de interação. */
  readonly position: THREE.Vector3;
  /** Direção para fora da parede (de frente para quem usa). */
  readonly normal: THREE.Vector3;
}

export interface SectorVisual {
  readonly group: THREE.Group;
  readonly doors: Map<string, DoorVisual>;
  readonly switches: SwitchVisual[];
  update(time: number, dt: number): void;
  dispose(): void;
}

/** Recursos (geometria, material) criados para o setor: liberados ao trocar de setor. */
export class Disposables {
  private readonly items: { dispose(): void }[] = [];
  add<T extends { dispose(): void }>(item: T): T {
    this.items.push(item);
    return item;
  }
  dispose(): void {
    this.items.forEach((i) => i.dispose());
  }
}

const isSolidChar = (c: string): boolean => c === '#' || c === ' ';

/** Caixa com UV das laterais escalado pela altura: a textura não estica em parede alta. */
function tallBox(w: number, h: number, d: number): THREE.BoxGeometry {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.getAttribute('uv') as THREE.BufferAttribute;
  for (let face = 0; face < 6; face++) {
    if (face === 2 || face === 3) continue;
    for (let v = 0; v < 4; v++) {
      const n = face * 4 + v;
      uv.setY(n, uv.getY(n) * (h / CELL));
    }
  }
  return g;
}

function instanced(geo: THREE.BufferGeometry, mat: THREE.Material, cells: readonly Cell[], y: number, shadows: boolean): THREE.InstancedMesh {
  const mesh = new THREE.InstancedMesh(geo, mat, Math.max(1, cells.length));
  const m = new THREE.Matrix4();
  cells.forEach((c, n) => {
    m.makeTranslation(c.i * CELL + CELL / 2, y, c.j * CELL + CELL / 2);
    mesh.setMatrixAt(n, m);
  });
  mesh.count = cells.length;
  mesh.castShadow = shadows;
  mesh.receiveShadow = true;
  return mesh;
}

export function buildSector(def: SectorDef, level: LevelData): SectorVisual {
  const theme = THEMES[def.id];
  const d = new Disposables();
  const group = new THREE.Group();
  const grid = level.grid;
  const H = def.ceiling;
  const W = grid.width * CELL;
  const D = grid.depth * CELL;
  const updaters: ((t: number, dt: number) => void)[] = [];

  const visibleWalls: Cell[] = [];
  const glass: Cell[] = [];
  const lowCrates: Cell[] = [];
  const tallCrates: Cell[] = [];
  const planters: Cell[] = [];
  const forceField: Cell[] = [];
  for (let j = 0; j < grid.depth; j++) {
    for (let i = 0; i < grid.width; i++) {
      const c = grid.charAt(i, j);
      const cell = { i, j };
      if (c === '#') {
        if (!hasOpenNeighbor(level, i, j)) continue;
        // O hangar tem a parede leste aberta para o espaço, fechada por um campo de força.
        if (def.id === 'hangar' && i === grid.width - 1) forceField.push(cell);
        else visibleWalls.push(cell);
      } else if (c === '~') glass.push(cell);
      else if (c === 'o') lowCrates.push(cell);
      else if (c === 'O') tallCrates.push(cell);
      else if (c === 'p') planters.push(cell);
    }
  }

  const wallMat = d.add(
    new THREE.MeshStandardMaterial({ map: panelTexture(def.id, theme.wall), roughness: 0.62, metalness: 0.45 }),
  );
  group.add(instanced(d.add(tallBox(CELL, H, CELL)), wallMat, visibleWalls, H / 2, true));

  const floorTex = floorTexture(def.id, theme.floor.base, theme.floor.line).clone();
  floorTex.repeat.set(grid.width, grid.depth);
  floorTex.needsUpdate = true;
  d.add(floorTex);
  const floor = new THREE.Mesh(
    d.add(new THREE.PlaneGeometry(W, D)),
    d.add(new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.5, metalness: 0.5 })),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(W / 2, 0, D / 2);
  floor.receiveShadow = true;
  group.add(floor);

  addCeiling(def, theme, group, d, W, D, H);

  const crateTex = crateTexture(def.id, theme.crate.base, theme.crate.edge, theme.crate.mark);
  const crateMat = d.add(new THREE.MeshStandardMaterial({ map: crateTex, roughness: 0.75, metalness: 0.25 }));
  group.add(instanced(d.add(new THREE.BoxGeometry(CELL * 0.94, 1, CELL * 0.94)), crateMat, lowCrates, 0.5, true));
  group.add(instanced(d.add(tallBox(CELL * 0.94, 2.4, CELL * 0.94)), crateMat, tallCrates, 1.2, true));

  if (glass.length > 0) {
    const glassMat = d.add(
      new THREE.MeshStandardMaterial({
        color: 0x9fd8ff,
        transparent: true,
        opacity: 0.12,
        roughness: 0.05,
        metalness: 0.9,
        depthWrite: false,
      }),
    );
    group.add(fromMatrices(d.add(new THREE.BoxGeometry(CELL, H, CELL * 0.2)), glassMat, glassMatrices(level, glass, H)));
  }

  if (forceField.length > 0) updaters.push(addForceField(group, d, forceField, H));
  updaters.push(addStrips(level, theme, group, d, H, def.id === 'labs'));
  const doors = addDoors(level, group, d, H);
  const switches = addSwitches(level, group, d);
  updaters.push((t) => {
    for (const s of switches) s.beacon.material.opacity = 0.55 + 0.45 * Math.sin(t * 5);
  });
  addLights(def, level, theme, group, H, updaters);
  updaters.push(...buildDecor(def, level, group, d, planters));

  if (def.id !== 'labs') {
    group.add(createStars());
    if (def.id !== 'core') {
      const planet = createPlanet(900);
      // Visível pelo campo de força do hangar (leste) e pela cúpula de vidro da estufa (norte-leste).
      if (def.id === 'hangar') planet.group.position.set(W + 1500, -350, D * 0.6);
      else planet.group.position.set(W + 900, 200, -1300);
      group.add(planet.group);
      updaters.push((t) => planet.update(t));
    }
  }

  return {
    group,
    doors,
    switches,
    update(time, dt) {
      for (const u of updaters) u(time, dt);
    },
    dispose() {
      d.dispose();
    },
  };
}

function hasOpenNeighbor(level: LevelData, i: number, j: number): boolean {
  for (let dj = -1; dj <= 1; dj++) {
    for (let di = -1; di <= 1; di++) {
      const c = level.grid.charAt(i + di, j + dj);
      if (!isSolidChar(c)) return true;
    }
  }
  return false;
}

function glassMatrices(level: LevelData, cells: readonly Cell[], H: number): THREE.Matrix4[] {
  const up = new THREE.Vector3(0, 1, 0);
  const one = new THREE.Vector3(1, 1, 1);
  return cells.map((c) => {
    const isEdge = (ch: string): boolean => ch === '~' || ch === '#';
    const alongX = isEdge(level.grid.charAt(c.i - 1, c.j)) || isEdge(level.grid.charAt(c.i + 1, c.j));
    const q = new THREE.Quaternion().setFromAxisAngle(up, alongX ? 0 : Math.PI / 2);
    const p = new THREE.Vector3(c.i * CELL + CELL / 2, H / 2, c.j * CELL + CELL / 2);
    return new THREE.Matrix4().compose(p, q, one);
  });
}

function fromMatrices(geo: THREE.BufferGeometry, mat: THREE.Material, matrices: readonly THREE.Matrix4[]): THREE.InstancedMesh {
  const mesh = new THREE.InstancedMesh(geo, mat, Math.max(1, matrices.length));
  matrices.forEach((m, n) => mesh.setMatrixAt(n, m));
  mesh.count = matrices.length;
  return mesh;
}

function addCeiling(def: SectorDef, theme: Theme, group: THREE.Group, d: Disposables, W: number, D: number, H: number): void {
  if (def.id === 'greenhouse') {
    // Teto de vidro: deixa ver as estrelas; uma treliça escura dá a forma da cúpula.
    const frameMat = d.add(new THREE.MeshStandardMaterial({ color: 0x2b3530, roughness: 0.6, metalness: 0.6 }));
    const beamGeo = d.add(new THREE.BoxGeometry(0.25, 0.35, D));
    for (let x = 0; x <= W; x += 8) {
      const beam = new THREE.Mesh(beamGeo, frameMat);
      beam.position.set(x, H, D / 2);
      group.add(beam);
    }
    const crossGeo = d.add(new THREE.BoxGeometry(W, 0.25, 0.25));
    for (let z = 0; z <= D; z += 8) {
      const beam = new THREE.Mesh(crossGeo, frameMat);
      beam.position.set(W / 2, H, z);
      group.add(beam);
    }
    const pane = new THREE.Mesh(
      d.add(new THREE.PlaneGeometry(W, D)),
      d.add(new THREE.MeshStandardMaterial({ color: 0x9fd8ff, transparent: true, opacity: 0.08, side: THREE.DoubleSide, depthWrite: false })),
    );
    pane.rotation.x = Math.PI / 2;
    pane.position.set(W / 2, H, D / 2);
    group.add(pane);
    return;
  }
  const tex = panelTexture(`${def.id}-ceil`, { ...theme.wall, stripe: undefined }).clone();
  tex.repeat.set(W / CELL / 2, D / CELL / 2);
  tex.needsUpdate = true;
  d.add(tex);
  const ceil = new THREE.Mesh(
    d.add(new THREE.PlaneGeometry(W, D)),
    d.add(new THREE.MeshStandardMaterial({ map: tex, color: 0x9098a0, roughness: 0.8, metalness: 0.3 })),
  );
  ceil.rotation.x = Math.PI / 2;
  ceil.position.set(W / 2, H, D / 2);
  group.add(ceil);
}

/** Faixas luminosas nas paredes (no laboratório, piscam com o alarme). */
function addStrips(level: LevelData, theme: Theme, group: THREE.Group, d: Disposables, H: number, alarm: boolean): (t: number) => void {
  const grid = level.grid;
  const mat = d.add(new THREE.MeshBasicMaterial({ color: theme.stripColor }));
  const geo = d.add(new THREE.BoxGeometry(CELL * 0.85, 0.07, 0.05));
  const transforms: THREE.Matrix4[] = [];
  const y = Math.min(H - 0.4, 2.7);
  const q = new THREE.Quaternion();
  for (let j = 0; j < grid.depth; j++) {
    for (let i = 0; i < grid.width; i++) {
      if (grid.charAt(i, j) !== '#' || (i + j) % 2 !== 0) continue;
      for (const [di, dj] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ] as const) {
        const n = grid.charAt(i + di, j + dj);
        if (isSolidChar(n) || n === '~' || isDoorChar(n)) continue;
        const pos = new THREE.Vector3(i * CELL + CELL / 2 + di * (CELL / 2 + 0.03), y, j * CELL + CELL / 2 + dj * (CELL / 2 + 0.03));
        q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), di !== 0 ? Math.PI / 2 : 0);
        transforms.push(new THREE.Matrix4().compose(pos, q, new THREE.Vector3(1, 1, 1)));
      }
    }
  }
  group.add(fromMatrices(geo, mat, transforms));
  const base = new THREE.Color(theme.stripColor);
  return (t: number) => {
    if (!alarm) return;
    const pulse = 0.15 + 0.85 * Math.max(0, Math.sin((t / ALARM_PERIOD) * Math.PI * 2));
    mat.color.copy(base).multiplyScalar(0.25 + pulse * 1.6);
  };
}

function addForceField(group: THREE.Group, d: Disposables, cells: readonly Cell[], H: number): (t: number) => void {
  const minJ = Math.min(...cells.map((c) => c.j));
  const maxJ = Math.max(...cells.map((c) => c.j));
  const i = cells[0]!.i;
  const len = (maxJ - minJ + 1) * CELL;
  const uniforms = { time: { value: 0 } };
  const mat = d.add(
    new THREE.ShaderMaterial({
      uniforms,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `uniform float time; varying vec2 vUv;
        void main(){
          float scan = 0.5 + 0.5 * sin(vUv.y * 90.0 - time * 3.0);
          float hex = 0.5 + 0.5 * sin(vUv.x * 120.0 + time) * sin(vUv.y * 60.0);
          float edge = smoothstep(0.08, 0.0, min(min(vUv.x, 1.0 - vUv.x), min(vUv.y, 1.0 - vUv.y)));
          float a = 0.05 + 0.05 * scan + 0.04 * hex + edge * 0.5;
          gl_FragColor = vec4(vec3(0.35, 0.7, 1.0) * a, a);
        }`,
    }),
  );
  const plane = new THREE.Mesh(d.add(new THREE.PlaneGeometry(len, H)), mat);
  plane.position.set(i * CELL + 0.2, H / 2, minJ * CELL + len / 2);
  plane.rotation.y = -Math.PI / 2;
  group.add(plane);
  // Moldura da comporta aberta.
  const frameMat = d.add(new THREE.MeshStandardMaterial({ color: 0x30363d, roughness: 0.5, metalness: 0.7 }));
  for (const z of [minJ * CELL, (maxJ + 1) * CELL]) {
    const post = new THREE.Mesh(d.add(new THREE.BoxGeometry(1.2, H, 1.2)), frameMat);
    post.position.set(i * CELL + 0.6, H / 2, z);
    group.add(post);
  }
  return (t) => {
    uniforms.time.value = t;
  };
}

function addDoors(level: LevelData, group: THREE.Group, d: Disposables, H: number): Map<string, DoorVisual> {
  const out = new Map<string, DoorVisual>();
  const tex = panelTexture('door', { base: '#4a525c', seam: '#1b1f24', light: '#c9a227', stripe: '#c9a227' });
  const mat = d.add(new THREE.MeshStandardMaterial({ map: tex, roughness: 0.5, metalness: 0.6 }));
  const lightMat = d.add(new THREE.MeshBasicMaterial({ color: 0x3dff7a }));
  for (const [id, cells] of level.doors) {
    const meshes: THREE.Mesh[] = [];
    const center = new THREE.Vector3();
    for (const c of cells) {
      const grid = level.grid;
      const alongX = grid.charAt(c.i - 1, c.j) === id || grid.charAt(c.i + 1, c.j) === id || grid.charAt(c.i - 1, c.j) === '#';
      const geo = d.add(tallBox(alongX ? CELL : 0.4, H, alongX ? 0.4 : CELL));
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(c.i * CELL + CELL / 2, H / 2, c.j * CELL + CELL / 2);
      mesh.castShadow = true;
      const strip = new THREE.Mesh(d.add(new THREE.BoxGeometry(alongX ? CELL * 0.9 : 0.42, 0.12, alongX ? 0.42 : CELL * 0.9)), lightMat);
      strip.position.y = -H / 2 + 2.2;
      mesh.add(strip);
      group.add(mesh);
      meshes.push(mesh);
      center.add(mesh.position);
    }
    center.divideScalar(Math.max(1, cells.length));
    center.y = 1.5;
    out.set(id, { id, meshes, height: H, center });
  }
  return out;
}

function addSwitches(level: LevelData, group: THREE.Group, d: Disposables): SwitchVisual[] {
  const bodyMat = d.add(new THREE.MeshStandardMaterial({ color: 0x2d333b, roughness: 0.4, metalness: 0.7 }));
  const bodyGeo = d.add(new THREE.BoxGeometry(0.8, 1.1, 0.18));
  const screenGeo = d.add(new THREE.PlaneGeometry(0.6, 0.45));
  return level.switches.map((spawn) => {
    const normal = new THREE.Vector3(-spawn.wall.i, 0, -spawn.wall.j);
    const position = new THREE.Vector3(
      spawn.cell.i * CELL + CELL / 2 + spawn.wall.i * (CELL / 2 - 0.09),
      1.3,
      spawn.cell.j * CELL + CELL / 2 + spawn.wall.j * (CELL / 2 - 0.09),
    );
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.copy(position);
    body.lookAt(position.clone().add(normal));
    const screen = d.add(new THREE.MeshBasicMaterial({ color: 0xff3b2f }));
    const screenMesh = new THREE.Mesh(screenGeo, screen);
    screenMesh.position.z = 0.1;
    body.add(screenMesh);
    const beacon = new THREE.Sprite(d.add(new THREE.SpriteMaterial({ map: glowTexture(), color: 0x3dff7a, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })));
    beacon.scale.set(1.6, 1.6, 1);
    beacon.position.set(0, 0.95, 0.15);
    body.add(beacon);
    group.add(body);
    return { spawn, screen, beacon, position, normal };
  });
}

/** Poucas luzes pontuais fixas (o número de luzes não muda durante o jogo: trocar recompila shaders). */
function addLights(def: SectorDef, level: LevelData, theme: Theme, group: THREE.Group, H: number, updaters: ((t: number, dt: number) => void)[]): void {
  const grid = level.grid;
  group.add(new THREE.HemisphereLight(theme.hemiSky, theme.hemiGround, theme.hemiIntensity));
  const W = grid.width * CELL;
  const D = grid.depth * CELL;
  const key = new THREE.DirectionalLight(theme.keyColor, theme.keyIntensity);
  key.position.set(W * 0.3, H + 30, D * 0.2);
  key.target.position.set(W / 2, 0, D / 2);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  const ext = Math.max(W, D) * 0.75;
  key.shadow.camera.left = -ext;
  key.shadow.camera.right = ext;
  key.shadow.camera.top = ext;
  key.shadow.camera.bottom = -ext;
  key.shadow.camera.near = 1;
  key.shadow.camera.far = H + 120;
  key.shadow.bias = -0.0006;
  key.shadow.normalBias = 0.04;
  group.add(key, key.target);

  const spots = pickLightCells(level, 6, createRng(def.seed));
  const lights = spots.map((c, n) => {
    const alarm = def.id === 'labs' && n % 2 === 0;
    const light = new THREE.PointLight(alarm ? 0xff2a1a : theme.pointColor, theme.pointIntensity, 34, 1.6);
    light.position.set(c.i * CELL + CELL / 2, H - 0.8, c.j * CELL + CELL / 2);
    group.add(light);
    return { light, alarm, base: theme.pointIntensity };
  });
  updaters.push((t) => {
    for (const l of lights) {
      if (l.alarm) l.light.intensity = l.base * (0.1 + 1.6 * Math.max(0, Math.sin((t / ALARM_PERIOD) * Math.PI * 2)));
    }
  });
}

/** Células de luz espalhadas pelos espaços mais abertos do mapa. */
function pickLightCells(level: LevelData, count: number, rng: () => number): Cell[] {
  const grid = level.grid;
  const candidates: { c: Cell; open: number }[] = [];
  for (let j = 2; j < grid.depth - 2; j++) {
    for (let i = 2; i < grid.width - 2; i++) {
      if (!grid.isWalkable(i, j)) continue;
      let open = 0;
      for (let dj = -2; dj <= 2; dj++) for (let di = -2; di <= 2; di++) if (grid.height(i + di, j + dj, 'move') < 1000) open++;
      candidates.push({ c: { i, j }, open: open + rng() * 2 });
    }
  }
  candidates.sort((a, b) => b.open - a.open);
  const chosen: Cell[] = [];
  for (const cand of candidates) {
    if (chosen.every((c) => Math.hypot(c.i - cand.c.i, c.j - cand.c.j) > 7)) chosen.push(cand.c);
    if (chosen.length >= count) break;
  }
  return chosen;
}
