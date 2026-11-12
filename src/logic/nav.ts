import type { Cell, LevelGrid } from './level';

const NEIGHBORS: readonly (readonly [number, number, number])[] = [
  [1, 0, 1],
  [-1, 0, 1],
  [0, 1, 1],
  [0, -1, 1],
  [1, 1, Math.SQRT2],
  [1, -1, Math.SQRT2],
  [-1, 1, Math.SQRT2],
  [-1, -1, Math.SQRT2],
];

const MAX_EXPANSIONS = 6000;

const key = (i: number, j: number): number => j * 4096 + i;

/** Fila de prioridade mínima (heap binário) para o A*. */
class MinHeap {
  private readonly items: { k: number; f: number }[] = [];

  get size(): number {
    return this.items.length;
  }

  push(k: number, f: number): void {
    const items = this.items;
    items.push({ k, f });
    let n = items.length - 1;
    while (n > 0) {
      const p = (n - 1) >> 1;
      const parent = items[p]!;
      const node = items[n]!;
      if (parent.f <= node.f) break;
      items[p] = node;
      items[n] = parent;
      n = p;
    }
  }

  pop(): number {
    const items = this.items;
    const top = items[0]!;
    const last = items.pop()!;
    if (items.length > 0) {
      items[0] = last;
      let n = 0;
      for (;;) {
        const l = n * 2 + 1;
        const r = l + 1;
        let m = n;
        if (l < items.length && items[l]!.f < items[m]!.f) m = l;
        if (r < items.length && items[r]!.f < items[m]!.f) m = r;
        if (m === n) break;
        const tmp = items[m]!;
        items[m] = items[n]!;
        items[n] = tmp;
        n = m;
      }
    }
    return top.k;
  }
}

/** A* em 8 direções, sem cortar quina de obstáculo. Devolve as células do início ao fim, ou null. */
export function findPath(grid: LevelGrid, from: Cell, to: Cell, fly = false): Cell[] | null {
  if (!grid.isWalkable(to.i, to.j, fly)) return null;
  const start = key(from.i, from.j);
  const goal = key(to.i, to.j);
  const g = new Map<number, number>([[start, 0]]);
  const parent = new Map<number, number>();
  const closed = new Set<number>();
  const open = new MinHeap();
  const h = (i: number, j: number): number => Math.hypot(i - to.i, j - to.j);
  open.push(start, h(from.i, from.j));

  for (let expansions = 0; open.size > 0 && expansions < MAX_EXPANSIONS; expansions++) {
    const current = open.pop();
    if (current === goal) return rebuild(parent, current);
    if (closed.has(current)) continue;
    closed.add(current);
    const ci = current % 4096;
    const cj = Math.floor(current / 4096);
    const gc = g.get(current) ?? 0;
    for (const [di, dj, cost] of NEIGHBORS) {
      const ni = ci + di;
      const nj = cj + dj;
      if (!grid.isWalkable(ni, nj, fly)) continue;
      if (di !== 0 && dj !== 0 && (!grid.isWalkable(ci + di, cj, fly) || !grid.isWalkable(ci, cj + dj, fly))) continue;
      const nk = key(ni, nj);
      const ng = gc + cost;
      if (ng >= (g.get(nk) ?? Infinity)) continue;
      g.set(nk, ng);
      parent.set(nk, current);
      open.push(nk, ng + h(ni, nj));
    }
  }
  return null;
}

function rebuild(parent: Map<number, number>, end: number): Cell[] {
  const out: Cell[] = [];
  let k: number | undefined = end;
  while (k !== undefined) {
    out.push({ i: k % 4096, j: Math.floor(k / 4096) });
    k = parent.get(k);
  }
  return out.reverse();
}

/** Linha reta entre células passa só por células livres (amostragem fina, com folga lateral). */
export function walkableLine(grid: LevelGrid, a: Cell, b: Cell, fly = false): boolean {
  const ax = a.i + 0.5;
  const az = a.j + 0.5;
  const bx = b.i + 0.5;
  const bz = b.j + 0.5;
  const len = Math.hypot(bx - ax, bz - az);
  const steps = Math.max(1, Math.ceil(len * 4));
  const margin = 0.3;
  for (let s = 0; s <= steps; s++) {
    const t = s / steps;
    const x = ax + (bx - ax) * t;
    const z = az + (bz - az) * t;
    for (const [ox, oz] of [
      [-margin, -margin],
      [margin, -margin],
      [-margin, margin],
      [margin, margin],
    ] as const) {
      if (!grid.isWalkable(Math.floor(x + ox), Math.floor(z + oz), fly)) return false;
    }
  }
  return true;
}

/** Remove pontos intermediários quando há linha livre entre os vizinhos (caminho menos serrilhado). */
export function smoothPath(grid: LevelGrid, path: readonly Cell[], fly = false): Cell[] {
  if (path.length <= 2) return [...path];
  const out: Cell[] = [path[0]!];
  let anchor = 0;
  for (let n = 2; n < path.length; n++) {
    if (!walkableLine(grid, path[anchor]!, path[n]!, fly)) {
      out.push(path[n - 1]!);
      anchor = n - 1;
    }
  }
  out.push(path[path.length - 1]!);
  return out;
}

/** Célula livre mais próxima (busca em largura), para destravar um robô ou ajustar um alvo. */
export function nearestWalkable(grid: LevelGrid, cell: Cell, fly = false, maxRadius = 12): Cell | null {
  if (grid.isWalkable(cell.i, cell.j, fly)) return cell;
  for (let r = 1; r <= maxRadius; r++) {
    let best: Cell | null = null;
    let bestD = Infinity;
    for (let dj = -r; dj <= r; dj++) {
      for (let di = -r; di <= r; di++) {
        if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
        const c = { i: cell.i + di, j: cell.j + dj };
        const d = Math.hypot(di, dj);
        if (d < bestD && grid.isWalkable(c.i, c.j, fly)) {
          best = c;
          bestD = d;
        }
      }
    }
    if (best) return best;
  }
  return null;
}
