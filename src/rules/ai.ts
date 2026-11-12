/**
 * Máquina de estados comum aos robôs: patrulha → alerta (ouviu tiro ou um vizinho chamou) → combate (viu ou levou
 * tiro) → busca (perdeu de vista) → patrulha. Cada robô decide o que fazer em cada estado; a transição é esta.
 */
export type AiMode = 'patrol' | 'alert' | 'combat' | 'search';

export const AI = {
  ALERT_GIVEUP: 7,
  LOSE_SIGHT: 2.5,
  SEARCH_GIVEUP: 9,
  /** Jogador escondido por mais que isso: o robô procura outro ângulo. */
  FLANK_AFTER: 4,
} as const;

export interface AiMemory {
  readonly mode: AiMode;
  readonly modeTime: number;
  readonly lastSeenAgo: number;
}

export interface Senses {
  readonly sees: boolean;
  readonly heard: boolean;
  readonly allyCall: boolean;
  readonly damaged: boolean;
}

export function initialMemory(): AiMemory {
  return { mode: 'patrol', modeTime: 0, lastSeenAgo: Infinity };
}

function nextMode(m: AiMemory, s: Senses, lastSeenAgo: number): AiMode {
  if (s.sees || s.damaged) return 'combat';
  switch (m.mode) {
    case 'patrol':
      return s.heard || s.allyCall ? 'alert' : 'patrol';
    case 'alert':
      return m.modeTime > AI.ALERT_GIVEUP ? 'patrol' : 'alert';
    case 'combat':
      return lastSeenAgo > AI.LOSE_SIGHT ? 'search' : 'combat';
    case 'search':
      return m.modeTime > AI.SEARCH_GIVEUP ? 'patrol' : 'search';
  }
}

export function stepAi(m: AiMemory, s: Senses, dt: number): AiMemory {
  // Levar tiro também conta como "acabei de saber onde está": sem isso o robô baleado pelas costas cairia em busca no quadro seguinte.
  const lastSeenAgo = s.sees || s.damaged ? 0 : m.lastSeenAgo + dt;
  const mode = nextMode(m, s, lastSeenAgo);
  const restart = mode !== m.mode || (s.heard && (mode === 'alert' || mode === 'search'));
  return { mode, modeTime: restart ? 0 : m.modeTime + dt, lastSeenAgo };
}

export function shouldFlank(m: AiMemory): boolean {
  return (m.mode === 'combat' || m.mode === 'search') && m.lastSeenAgo > AI.FLANK_AFTER;
}

/** Ângulos ao redor do jogador para um grupo: espalhados em leque em vez de virem em fila. */
export function flankAngles(count: number, base: number, spacing = 1.15): number[] {
  return Array.from({ length: count }, (_, i) => base + (i - (count - 1) / 2) * spacing);
}

/** Gira `current` na direção de `target` no máximo `maxStep` radianos, pelo lado mais curto. */
export function turnTowards(current: number, target: number, maxStep: number): number {
  let d = (target - current) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return current + Math.max(-maxStep, Math.min(maxStep, d));
}
