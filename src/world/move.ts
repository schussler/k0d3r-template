import type { Box, CollisionWorld } from './collision';

/**
 * Move um corpo circular (visto de cima) contra as caixas do mundo, eixo a eixo, deslizando na parede.
 * Só bloqueiam as caixas que cruzam a faixa de altura [minY, maxY] do corpo: um drone voando passa por cima
 * das caixas baixas. Devolve se algum eixo bateu.
 */
export interface Mover {
  x: number;
  z: number;
}

export function moveCircle(world: CollisionWorld, m: Mover, dx: number, dz: number, radius: number, minY: number, maxY: number, scratch: Box[]): boolean {
  let hit = false;
  if (dx !== 0) {
    if (blocked(world, m.x + dx, m.z, radius, minY, maxY, scratch)) hit = true;
    else m.x += dx;
  }
  if (dz !== 0) {
    if (blocked(world, m.x, m.z + dz, radius, minY, maxY, scratch)) hit = true;
    else m.z += dz;
  }
  return hit;
}

export function blocked(world: CollisionWorld, x: number, z: number, r: number, minY: number, maxY: number, scratch: Box[]): boolean {
  for (const b of world.query(x - r, z - r, x + r, z + r, scratch)) {
    if (b.maxY <= minY || b.minY >= maxY) continue;
    // Círculo contra retângulo: ponto mais próximo do retângulo ao centro.
    const cx = Math.max(b.minX, Math.min(x, b.maxX));
    const cz = Math.max(b.minZ, Math.min(z, b.maxZ));
    if ((cx - x) ** 2 + (cz - z) ** 2 < r * r) return true;
  }
  return x - r < 0 || z - r < 0 || x + r > world.cols * world.cell || z + r > world.rows * world.cell;
}
