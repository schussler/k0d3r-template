/**
 * Mundo de colisão: caixas alinhadas aos eixos registradas por célula da grade do setor. Serve ao movimento do
 * jogador e dos robôs, ao tiro (raio) e aos pedaços e cápsulas que caem. Sem biblioteca de física (decisão na
 * spec de arquitetura).
 */
export type Surface = 'metal' | 'crate' | 'glass' | 'plant' | 'floor' | 'door';

export interface Box {
  minX: number;
  minY: number;
  minZ: number;
  maxX: number;
  maxY: number;
  maxZ: number;
  readonly surface: Surface;
  /** Porta aberta deixa de colidir; o objeto continua registrado. */
  enabled: boolean;
}

export interface RayHit {
  dist: number;
  x: number;
  y: number;
  z: number;
  nx: number;
  ny: number;
  nz: number;
  surface: Surface;
}

export function makeRayHit(): RayHit {
  return { dist: 0, x: 0, y: 0, z: 0, nx: 0, ny: 1, nz: 0, surface: 'floor' };
}

export class CollisionWorld {
  private readonly buckets: Box[][];
  readonly boxes: Box[] = [];

  constructor(
    readonly cols: number,
    readonly rows: number,
    readonly cell: number,
    readonly floorY: number,
    readonly ceilingY: number,
  ) {
    this.buckets = Array.from({ length: cols * rows }, () => []);
  }

  add(box: Box): Box {
    this.boxes.push(box);
    const c0 = this.clampCol(Math.floor(box.minX / this.cell));
    const c1 = this.clampCol(Math.floor((box.maxX - 1e-6) / this.cell));
    const r0 = this.clampRow(Math.floor(box.minZ / this.cell));
    const r1 = this.clampRow(Math.floor((box.maxZ - 1e-6) / this.cell));
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) this.buckets[r * this.cols + c]?.push(box);
    return box;
  }

  private clampCol(c: number): number {
    return Math.max(0, Math.min(this.cols - 1, c));
  }

  private clampRow(r: number): number {
    return Math.max(0, Math.min(this.rows - 1, r));
  }

  /** Caixas ativas que podem tocar o retângulo dado; `out` é reaproveitado para não alocar por quadro. */
  query(minX: number, minZ: number, maxX: number, maxZ: number, out: Box[]): Box[] {
    out.length = 0;
    const c0 = this.clampCol(Math.floor(minX / this.cell));
    const c1 = this.clampCol(Math.floor(maxX / this.cell));
    const r0 = this.clampRow(Math.floor(minZ / this.cell));
    const r1 = this.clampRow(Math.floor(maxZ / this.cell));
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        for (const b of this.buckets[r * this.cols + c] ?? []) if (b.enabled && !out.includes(b)) out.push(b);
      }
    }
    return out;
  }

  /** Raio contra caixas, piso e teto. Percorre as células em ordem (DDA) e para na primeira batida. */
  raycast(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, maxDist: number, hit: RayHit): boolean {
    let best = maxDist;
    let found = false;
    const planeT = dy < 0 ? (this.floorY - oy) / dy : dy > 0 ? (this.ceilingY - oy) / dy : Infinity;
    if (planeT >= 0 && planeT < best) {
      best = planeT;
      found = true;
      hit.nx = 0;
      hit.ny = dy < 0 ? 1 : -1;
      hit.nz = 0;
      hit.surface = 'floor';
    }
    let col = Math.floor(ox / this.cell);
    let row = Math.floor(oz / this.cell);
    const stepC = dx > 0 ? 1 : -1;
    const stepR = dz > 0 ? 1 : -1;
    const tDeltaC = dx !== 0 ? Math.abs(this.cell / dx) : Infinity;
    const tDeltaR = dz !== 0 ? Math.abs(this.cell / dz) : Infinity;
    let tMaxC = dx !== 0 ? ((dx > 0 ? (col + 1) * this.cell : col * this.cell) - ox) / dx : Infinity;
    let tMaxR = dz !== 0 ? ((dz > 0 ? (row + 1) * this.cell : row * this.cell) - oz) / dz : Infinity;
    let tCell = 0;
    while (tCell <= best) {
      if (col >= 0 && row >= 0 && col < this.cols && row < this.rows) {
        for (const b of this.buckets[row * this.cols + col] ?? []) {
          if (!b.enabled) continue;
          const t = rayBox(ox, oy, oz, dx, dy, dz, b, hit, best);
          if (t >= 0 && t < best) {
            best = t;
            found = true;
          }
        }
      } else if ((col < 0 && stepC < 0) || (row < 0 && stepR < 0) || (col >= this.cols && stepC > 0) || (row >= this.rows && stepR > 0)) {
        break;
      }
      if (tMaxC < tMaxR) {
        tCell = tMaxC;
        tMaxC += tDeltaC;
        col += stepC;
      } else {
        tCell = tMaxR;
        tMaxR += tDeltaR;
        row += stepR;
      }
    }
    if (found) {
      hit.dist = best;
      hit.x = ox + dx * best;
      hit.y = oy + dy * best;
      hit.z = oz + dz * best;
    }
    return found;
  }

  /** Altura do chão sob (x, z) a partir de `fromY` para baixo: topo de caixa ou piso. */
  groundAt(x: number, z: number, fromY: number, out: Box[]): number {
    let ground = this.floorY;
    for (const b of this.query(x, z, x, z, out)) {
      if (x >= b.minX && x <= b.maxX && z >= b.minZ && z <= b.maxZ && b.maxY <= fromY + 0.05 && b.maxY > ground) ground = b.maxY;
    }
    return ground;
  }

  /** Ponto dentro de alguma caixa ativa. */
  solidAt(x: number, y: number, z: number, out: Box[]): boolean {
    for (const b of this.query(x, z, x, z, out)) {
      if (x > b.minX && x < b.maxX && y > b.minY && y < b.maxY && z > b.minZ && z < b.maxZ) return true;
    }
    return false;
  }

  /** Linha de visão livre entre dois pontos. */
  lineOfSight(ax: number, ay: number, az: number, bx: number, by: number, bz: number, hit: RayHit): boolean {
    const dx = bx - ax;
    const dy = by - ay;
    const dz = bz - az;
    const len = Math.hypot(dx, dy, dz);
    if (len < 1e-6) return true;
    return !this.raycast(ax, ay, az, dx / len, dy / len, dz / len, len - 0.05, hit);
  }
}

/** Teste de lâminas; escreve a normal em `hit` só quando a batida é a melhor até agora. */
function rayBox(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, b: Box, hit: RayHit, best: number): number {
  slab.tmin = -Infinity;
  slab.tmax = Infinity;
  slab.axis = 0;
  slab.sign = 1;
  if (!slabAxis(0, ox, dx, b.minX, b.maxX) || !slabAxis(1, oy, dy, b.minY, b.maxY) || !slabAxis(2, oz, dz, b.minZ, b.maxZ)) return -1;
  if (slab.tmin < 0 || slab.tmin >= best) return -1;
  hit.nx = slab.axis === 0 ? slab.sign : 0;
  hit.ny = slab.axis === 1 ? slab.sign : 0;
  hit.nz = slab.axis === 2 ? slab.sign : 0;
  hit.surface = b.surface;
  return slab.tmin;
}

// Estado de rascunho do teste de lâminas: o raio roda muitas vezes por quadro e não deve alocar.
const slab = { tmin: 0, tmax: 0, axis: 0, sign: 1 };

function slabAxis(axis: number, o: number, d: number, lo: number, hi: number): boolean {
  if (Math.abs(d) < 1e-9) return o >= lo && o <= hi;
  let t1 = (lo - o) / d;
  let t2 = (hi - o) / d;
  let sg = -1;
  if (t1 > t2) {
    const tmp = t1;
    t1 = t2;
    t2 = tmp;
    sg = 1;
  }
  if (t1 > slab.tmin) {
    slab.tmin = t1;
    slab.axis = axis;
    slab.sign = sg;
  }
  if (t2 < slab.tmax) slab.tmax = t2;
  return slab.tmin <= slab.tmax && slab.tmax >= 0;
}
