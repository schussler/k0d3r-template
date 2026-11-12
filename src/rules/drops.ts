/** O que um robô solta ao morrer ("às vezes solta munição ou vida"). */
export const AMMO_CHANCE = 0.35;
export const HEALTH_CHANCE = 0.15;

export type Drop = 'ammo' | 'health';

/** `roll` em [0, 1). */
export function rollDrop(roll: number): Drop | null {
  if (roll < AMMO_CHANCE) return 'ammo';
  if (roll < AMMO_CHANCE + HEALTH_CHANCE) return 'health';
  return null;
}

/** Gerador determinístico (mulberry32) para testes e para sorteios reproduzíveis. */
export function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
