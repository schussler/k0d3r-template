import { createVitals, type Vitals } from './combat';
import { createArsenal, type Arsenal } from './weapons';

export type SectorId = 'hangar' | 'labs' | 'greenhouse' | 'core';

export const SECTOR_ORDER: readonly SectorId[] = ['hangar', 'labs', 'greenhouse', 'core'];

/** Retrato tirado na entrada do setor: "Tentar de novo" volta exatamente a ele. */
export interface SectorSnapshot {
  readonly sector: SectorId;
  readonly vitals: Vitals;
  readonly arsenal: Arsenal;
}

export function takeSnapshot(sector: SectorId, vitals: Vitals, arsenal: Arsenal): SectorSnapshot {
  // Volta com a arma parada: sem recarga nem troca pela metade.
  return { sector, vitals: { ...vitals }, arsenal: { ...arsenal, action: { kind: 'none' }, cooldown: 0 } };
}

export const initialSnapshot = (): SectorSnapshot => takeSnapshot('hangar', createVitals(), createArsenal());

export function nextSector(current: SectorId): SectorId | null {
  const n = SECTOR_ORDER.indexOf(current);
  return SECTOR_ORDER[n + 1] ?? null;
}

/** Tempo total no formato mm:ss.d (minutos podem passar de 59). */
export function formatTime(seconds: number): string {
  const safe = Math.max(0, seconds);
  const m = Math.floor(safe / 60);
  const s = Math.floor(safe % 60);
  const d = Math.floor((safe * 10) % 10);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${d}`;
}
