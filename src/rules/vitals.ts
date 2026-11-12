/** Vida e escudo do jogador. O escudo absorve primeiro e volta sozinho; a vida só volta com pickup. */
export const MAX_HEALTH = 100;
export const MAX_SHIELD = 100;
export const SHIELD_DELAY = 4;
const SHIELD_RATE = 25;

export interface Vitals {
  readonly health: number;
  readonly shield: number;
  /** Segundos desde o último dano. */
  readonly sinceDamage: number;
}

export function fullVitals(): Vitals {
  return { health: MAX_HEALTH, shield: MAX_SHIELD, sinceDamage: SHIELD_DELAY };
}

export function damagePlayer(v: Vitals, amount: number): Vitals {
  const absorbed = Math.min(v.shield, amount);
  return { health: Math.max(0, v.health - (amount - absorbed)), shield: v.shield - absorbed, sinceDamage: 0 };
}

export function tickVitals(v: Vitals, dt: number): Vitals {
  const since = v.sinceDamage + dt;
  const shield = since >= SHIELD_DELAY ? Math.min(MAX_SHIELD, v.shield + SHIELD_RATE * dt) : v.shield;
  return { ...v, shield, sinceDamage: since };
}

export function heal(v: Vitals, amount: number): Vitals {
  return { ...v, health: Math.min(MAX_HEALTH, v.health + amount) };
}

export function isDead(v: Vitals): boolean {
  return v.health <= 0;
}
