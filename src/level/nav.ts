import { type Grid, tileAt } from './grid';

export interface Cell {
  readonly col: number;
  readonly row: number;
}

export type Passable = (col: number, row: number) => boolean;

const DIRS: readonly (readonly [number, number])[] = [
  [1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1],
];

/**
 * A* em 8 direções sobre a grade do setor, sem cortar quina (a diagonal exige as duas vizinhas livres): é o que
 * impede um robô de raspar a parede e ficar preso nela.
 */
export function findPath(g: Grid, from: Cell, to: Cell, passable: Passable): Cell[] | null {
  if (!passable(to.col, to.row)) return null;
  const n = g.cols * g.rows;
  const key = (c: number, r: number) => r * g.cols + c;
  const gScore = new Float64Array(n).fill(Infinity);
  const came = new Int32Array(n).fill(-1);
  const closed = new Uint8Array(n);
  const open: { k: number; f: number }[] = [];
  const h = (c: number, r: number) => {
    const dx = Math.abs(c - to.col);
    const dy = Math.abs(r - to.row);
    return Math.max(dx, dy) + (Math.SQRT2 - 1) * Math.min(dx, dy);
  };
  const start = key(from.col, from.row);
  gScore[start] = 0;
  open.push({ k: start, f: h(from.col, from.row) });
  const goal = key(to.col, to.row);
  while (open.length > 0) {
    let best = 0;
    for (let i = 1; i < open.length; i++) if ((open[i]?.f ?? Infinity) < (open[best]?.f ?? Infinity)) best = i;
    const cur = open.splice(best, 1)[0];
    if (!cur) break;
    if (cur.k === goal) return rebuild(came, goal, g.cols);
    if (closed[cur.k]) continue;
    closed[cur.k] = 1;
    const cc = cur.k % g.cols;
    const cr = Math.floor(cur.k / g.cols);
    for (const [dc, dr] of DIRS) {
      const nc = cc + dc;
      const nr = cr + dr;
      if (!passable(nc, nr)) continue;
      if (dc !== 0 && dr !== 0 && (!passable(cc + dc, cr) || !passable(cc, cr + dr))) continue;
      const nk = key(nc, nr);
      const tentative = (gScore[cur.k] ?? Infinity) + (dc !== 0 && dr !== 0 ? Math.SQRT2 : 1);
      if (tentative < (gScore[nk] ?? Infinity)) {
        gScore[nk] = tentative;
        came[nk] = cur.k;
        open.push({ k: nk, f: tentative + h(nc, nr) });
      }
    }
  }
  return null;
}

function rebuild(came: Int32Array, goal: number, cols: number): Cell[] {
  const path: Cell[] = [];
  for (let k = goal; k !== -1; k = came[k] ?? -1) path.push({ col: k % cols, row: Math.floor(k / cols) });
  return path.reverse();
}

/** Células alcançáveis a pé a partir de `from` (busca em largura, 4 direções). */
export function reachable(g: Grid, from: Cell, passable: Passable): Set<number> {
  const seen = new Set<number>([from.row * g.cols + from.col]);
  const queue: Cell[] = [from];
  while (queue.length > 0) {
    const c = queue.shift();
    if (!c) break;
    for (const [dc, dr] of DIRS.slice(0, 4)) {
      const nc = c.col + dc;
      const nr = c.row + dr;
      const k = nr * g.cols + nc;
      if (seen.has(k) || !passable(nc, nr)) continue;
      seen.add(k);
      queue.push({ col: nc, row: nr });
    }
  }
  return seen;
}

/** Passável a pé com todas as portas abertas: é o "caminho claro até a saída" depois de limpar o setor. */
export function walkableAllOpen(g: Grid): Passable {
  return (c, r) => {
    const t = tileAt(g, c, r);
    return t === 'floor' || t === 'exit' || t === 'door';
  };
}
