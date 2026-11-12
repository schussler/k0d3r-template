export interface Settings {
  readonly sensitivity: number;
  readonly volume: number;
}

const KEY = 'kepler.settings';
const DEFAULTS: Settings = { sensitivity: 1, volume: 0.8 };

const inRange = (v: unknown, min: number, max: number): v is number => typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max;

/** Preferências locais. Sem armazenamento (aba privada, bloqueio), valem os padrões. */
export function loadSettings(): Settings {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return DEFAULTS;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return DEFAULTS;
    const p = parsed as Record<string, unknown>;
    return {
      sensitivity: inRange(p.sensitivity, 0.4, 2.5) ? p.sensitivity : DEFAULTS.sensitivity,
      volume: inRange(p.volume, 0, 1) ? p.volume : DEFAULTS.volume,
    };
  } catch (err: unknown) {
    console.info('[kepler] preferências indisponíveis; usando padrões', err instanceof Error ? err.message : err);
    return DEFAULTS;
  }
}

export function saveSettings(s: Settings): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(s));
  } catch (err: unknown) {
    console.info('[kepler] não foi possível salvar as preferências', err instanceof Error ? err.message : err);
  }
}
