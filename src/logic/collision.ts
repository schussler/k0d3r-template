import { CELL, type HeightMode, type LevelGrid } from './level';

export interface Body {
  x: number;
  y: number;
  z: number;
}

export interface MoveResult {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly onGround: boolean;
  readonly hitCeiling: boolean;
  readonly blocked: boolean;
}

const EPS = 0.001;
const SUPPORT_TOLERANCE = 0.06;

/** Altura de bloqueio (0 = chão) de cada célula sob o quadrado de meia-largura `r` centrado em (x, z). */
function forEachCellUnder(x: number, z: number, r: number, fn: (i: number, j: number) => void): void {
  const i0 = Math.floor((x - r) / CELL);
  const i1 = Math.floor((x + r) / CELL);
  const j0 = Math.floor((z - r) / CELL);
  const j1 = Math.floor((z + r) / CELL);
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) fn(i, j);
}

function resolveAxis(
  grid: LevelGrid,
  pos: Body,
  axis: 'x' | 'z',
  delta: number,
  r: number,
  height: number,
  mode: HeightMode,
): boolean {
  if (delta === 0) return false;
  pos[axis] += delta;
  let blocked = false;
  forEachCellUnder(pos.x, pos.z, r, (i, j) => {
    const top = grid.height(i, j, mode);
    // Só bloqueia se a caixa da célula cruza o corpo na vertical (em cima de caixa não bloqueia).
    if (top <= pos.y + SUPPORT_TOLERANCE || pos.y + height <= 0) return;
    const cellMin = (axis === 'x' ? i : j) * CELL;
    if (delta > 0) pos[axis] = Math.min(pos[axis], cellMin - r - EPS);
    else pos[axis] = Math.max(pos[axis], cellMin + CELL + r + EPS);
    blocked = true;
  });
  return blocked;
}

/** Topo da superfície que sustenta o corpo (chão ou caixa) na posição atual. */
export function groundHeight(grid: LevelGrid, x: number, z: number, r: number, feetY: number, mode: HeightMode): number {
  let ground = 0;
  forEachCellUnder(x, z, r, (i, j) => {
    const top = grid.height(i, j, mode);
    if (top <= feetY + SUPPORT_TOLERANCE && top > ground) ground = top;
  });
  return ground;
}

/**
 * Move um corpo (quadrado de meia-largura `r`, altura `height`, pés em y) contra a grade, eixo a eixo e em
 * subpassos menores que o raio, para não atravessar parede em queda ou corrida.
 */
export function moveBody(
  grid: LevelGrid,
  start: Body,
  delta: Body,
  r: number,
  height: number,
  ceiling: number,
  mode: HeightMode = 'move',
): MoveResult {
  const pos = { ...start };
  const longest = Math.max(Math.abs(delta.x), Math.abs(delta.y), Math.abs(delta.z));
  const steps = Math.max(1, Math.ceil(longest / (r * 0.5)));
  let blocked = false;
  let onGround = false;
  let hitCeiling = false;
  for (let s = 0; s < steps; s++) {
    blocked = resolveAxis(grid, pos, 'x', delta.x / steps, r, height, mode) || blocked;
    blocked = resolveAxis(grid, pos, 'z', delta.z / steps, r, height, mode) || blocked;
    pos.y += delta.y / steps;
    const ground = groundHeight(grid, pos.x, pos.z, r, Math.max(pos.y, start.y), mode);
    if (pos.y <= ground) {
      pos.y = ground;
      onGround = true;
    }
    if (pos.y + height > ceiling) {
      pos.y = ceiling - height;
      hitCeiling = true;
    }
  }
  return { x: pos.x, y: pos.y, z: pos.z, onGround, hitCeiling, blocked };
}

export interface RayHit {
  readonly t: number;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  /** Normal da superfície atingida. */
  readonly nx: number;
  readonly ny: number;
  readonly nz: number;
}

/**
 * Raio contra a grade (travessia DDA de Amanatides-Woo) mais chão e teto. A direção deve estar normalizada.
 * Devolve null se nada for atingido até `maxDist`.
 */
export function raycastGrid(
  grid: LevelGrid,
  ox: number,
  oy: number,
  oz: number,
  dx: number,
  dy: number,
  dz: number,
  maxDist: number,
  ceiling: number,
  mode: HeightMode,
): RayHit | null {
  let tLimit = maxDist;
  let planeHit: RayHit | null = null;
  if (dy < 0) {
    const t = -oy / dy;
    if (t >= 0 && t < tLimit) {
      tLimit = t;
      planeHit = { t, x: ox + dx * t, y: 0, z: oz + dz * t, nx: 0, ny: 1, nz: 0 };
    }
  } else if (dy > 0) {
    const t = (ceiling - oy) / dy;
    if (t >= 0 && t < tLimit) {
      tLimit = t;
      planeHit = { t, x: ox + dx * t, y: ceiling, z: oz + dz * t, nx: 0, ny: -1, nz: 0 };
    }
  }

  let i = Math.floor(ox / CELL);
  let j = Math.floor(oz / CELL);
  const stepI = dx > 0 ? 1 : -1;
  const stepJ = dz > 0 ? 1 : -1;
  const tDeltaI = dx !== 0 ? Math.abs(CELL / dx) : Infinity;
  const tDeltaJ = dz !== 0 ? Math.abs(CELL / dz) : Infinity;
  let tMaxI = dx !== 0 ? ((dx > 0 ? (i + 1) * CELL : i * CELL) - ox) / dx : Infinity;
  let tMaxJ = dz !== 0 ? ((dz > 0 ? (j + 1) * CELL : j * CELL) - oz) / dz : Infinity;
  let tEnter = 0;
  let enterAxis: 'i' | 'j' | null = null;

  for (let guard = 0; guard < 512 && tEnter <= tLimit; guard++) {
    const top = grid.height(i, j, mode);
    if (top > 0) {
      const tExit = Math.min(tMaxI, tMaxJ, tLimit);
      const yEnter = oy + dy * tEnter;
      const yExit = oy + dy * tExit;
      if (yEnter <= top && enterAxis) {
        const nx = enterAxis === 'i' ? -stepI : 0;
        const nz = enterAxis === 'j' ? -stepJ : 0;
        return { t: tEnter, x: ox + dx * tEnter, y: yEnter, z: oz + dz * tEnter, nx, ny: 0, nz };
      }
      if (yEnter > top && yExit <= top && dy < 0) {
        const t = (top - oy) / dy;
        return { t, x: ox + dx * t, y: top, z: oz + dz * t, nx: 0, ny: 1, nz: 0 };
      }
    }
    if (tMaxI < tMaxJ) {
      tEnter = tMaxI;
      tMaxI += tDeltaI;
      i += stepI;
      enterAxis = 'i';
    } else {
      tEnter = tMaxJ;
      tMaxJ += tDeltaJ;
      j += stepJ;
      enterAxis = 'j';
    }
  }
  return planeHit;
}

/** Visada livre entre dois pontos para o modo dado (visão ou bala). */
export function hasLineOfSight(
  grid: LevelGrid,
  ax: number,
  ay: number,
  az: number,
  bx: number,
  by: number,
  bz: number,
  ceiling: number,
  mode: HeightMode = 'sight',
): boolean {
  const dx = bx - ax;
  const dy = by - ay;
  const dz = bz - az;
  const len = Math.hypot(dx, dy, dz);
  if (len < EPS) return true;
  const hit = raycastGrid(grid, ax, ay, az, dx / len, dy / len, dz / len, len, ceiling, mode);
  return hit === null || hit.t >= len - 0.05;
}

/** Interseção raio × esfera; devolve a distância ou null. */
export function raySphere(
  ox: number,
  oy: number,
  oz: number,
  dx: number,
  dy: number,
  dz: number,
  cx: number,
  cy: number,
  cz: number,
  radius: number,
): number | null {
  const lx = cx - ox;
  const ly = cy - oy;
  const lz = cz - oz;
  const tca = lx * dx + ly * dy + lz * dz;
  const d2 = lx * lx + ly * ly + lz * lz - tca * tca;
  const r2 = radius * radius;
  if (d2 > r2) return null;
  const thc = Math.sqrt(r2 - d2);
  const t0 = tca - thc;
  const t1 = tca + thc;
  if (t1 < 0) return null;
  return t0 >= 0 ? t0 : t1;
}
