import { hasLineOfSight } from './collision';
import { CELL, type Cell, type LevelGrid } from './level';
import { nearestWalkable } from './nav';

export interface FlankAgent {
  readonly id: number;
  readonly x: number;
  readonly z: number;
  readonly range: number;
  readonly fly: boolean;
}

export interface Point {
  readonly x: number;
  readonly z: number;
}

/** Ângulos das vagas em volta da jogadora: frente, os dois lados, depois as diagonais de trás. */
export const FLANK_SLOTS: readonly number[] = [0, 1.1, -1.1, 2.0, -2.0, 0.55, -0.55];

/**
 * Cerco: cada robô em combate recebe uma vaga em ângulo diferente em volta da jogadora, a partir da
 * direção do robô mais próximo. Os mais próximos pegam as vagas da frente; os outros, os lados.
 */
export function assignFlankTargets(grid: LevelGrid, player: Point, agents: readonly FlankAgent[]): Map<number, Point> {
  const out = new Map<number, Point>();
  if (agents.length === 0) return out;
  const sorted = [...agents].sort((a, b) => Math.hypot(a.x - player.x, a.z - player.z) - Math.hypot(b.x - player.x, b.z - player.z));
  const first = sorted[0]!;
  const base = Math.atan2(first.x - player.x, first.z - player.z);
  sorted.forEach((agent, n) => {
    const angle = base + FLANK_SLOTS[n % FLANK_SLOTS.length]!;
    const tx = player.x + Math.sin(angle) * agent.range;
    const tz = player.z + Math.cos(angle) * agent.range;
    const cell = nearestWalkable(grid, grid.worldToCell(tx, tz), agent.fly, 6);
    if (cell) out.set(agent.id, grid.cellCenter(cell));
  });
  return out;
}

/**
 * Ponto de cobertura para a sentinela: célula livre, perto dela, de onde a jogadora não a vê agachada
 * (atrás de caixa ou parede), mas a até 2 células de uma posição para espiar.
 */
export function findCover(
  grid: LevelGrid,
  from: Point,
  player: Point,
  playerEye: number,
  ceiling: number,
  maxCells = 7,
): Cell | null {
  const origin = grid.worldToCell(from.x, from.z);
  let best: Cell | null = null;
  let bestScore = Infinity;
  for (let dj = -maxCells; dj <= maxCells; dj++) {
    for (let di = -maxCells; di <= maxCells; di++) {
      const c = { i: origin.i + di, j: origin.j + dj };
      if (!grid.isWalkable(c.i, c.j)) continue;
      if (!hasCoverNeighbor(grid, c)) continue;
      const p = grid.cellCenter(c);
      const distPlayer = Math.hypot(p.x - player.x, p.z - player.z);
      if (distPlayer < 6) continue;
      if (hasLineOfSight(grid, player.x, playerEye, player.z, p.x, 0.9, p.z, ceiling, 'bullet')) continue;
      const score = Math.hypot(di, dj) + Math.abs(distPlayer - 16) * 0.15;
      if (score < bestScore) {
        best = c;
        bestScore = score;
      }
    }
  }
  return best;
}

function hasCoverNeighbor(grid: LevelGrid, c: Cell): boolean {
  for (const [di, dj] of [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ] as const) {
    if (grid.height(c.i + di, c.j + dj, 'bullet') >= 1) return true;
  }
  return false;
}

/** Ponto para espiar a partir da cobertura: célula vizinha com visada para a jogadora. */
export function findPeek(grid: LevelGrid, cover: Cell, player: Point, playerEye: number, ceiling: number): Cell | null {
  for (let r = 1; r <= 3; r++) {
    for (let dj = -r; dj <= r; dj++) {
      for (let di = -r; di <= r; di++) {
        if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
        const c = { i: cover.i + di, j: cover.j + dj };
        if (!grid.isWalkable(c.i, c.j)) continue;
        const p = grid.cellCenter(c);
        if (hasLineOfSight(grid, p.x, 1.7, p.z, player.x, playerEye, player.z, ceiling, 'bullet')) return c;
      }
    }
  }
  return null;
}

/** Rota de patrulha determinística: pontos livres em volta do ponto de nascimento. */
export function patrolRoute(grid: LevelGrid, home: Cell, rng: () => number, fly: boolean, points = 3, radius = 5): Cell[] {
  const route: Cell[] = [home];
  for (let n = 0; n < points * 6 && route.length < points; n++) {
    const c = {
      i: home.i + Math.round((rng() * 2 - 1) * radius),
      j: home.j + Math.round((rng() * 2 - 1) * radius),
    };
    if (grid.isWalkable(c.i, c.j, fly)) route.push(c);
  }
  return route;
}

/** O som de um tiro alcança o robô? Paredes no caminho cortam o raio pela metade. */
export function hearsNoise(
  grid: LevelGrid,
  listener: Point,
  source: Point,
  radius: number,
  ceiling: number,
): boolean {
  const d = Math.hypot(listener.x - source.x, listener.z - source.z);
  if (d > radius) return false;
  if (d <= radius * 0.5) return true;
  return hasLineOfSight(grid, source.x, 1.5, source.z, listener.x, 1.5, listener.z, ceiling, 'bullet');
}

export const cellsToMeters = (cells: number): number => cells * CELL;
