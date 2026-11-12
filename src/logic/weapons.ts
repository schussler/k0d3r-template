export type WeaponId = 'pistol' | 'rifle' | 'shotgun';

export const WEAPON_ORDER: readonly WeaponId[] = ['pistol', 'rifle', 'shotgun'];

export interface WeaponDef {
  readonly id: WeaponId;
  readonly name: string;
  readonly auto: boolean;
  /** Segundos entre disparos. */
  readonly fireInterval: number;
  readonly magSize: number;
  readonly reserveMax: number;
  readonly reloadTime: number;
  readonly pellets: number;
  readonly damage: number;
  readonly headMult: number;
  /** Espalhamento base, em radianos (meio-ângulo do cone). */
  readonly spread: number;
  /** Abertura extra da mira a cada tiro. */
  readonly bloomPerShot: number;
  readonly falloffStart: number;
  readonly falloffEnd: number;
  readonly falloffMin: number;
  readonly recoilPitch: number;
  readonly recoilYaw: number;
  /** Raio, em metros, em que os robôs ouvem o tiro. */
  readonly noiseRadius: number;
  readonly range: number;
  readonly shake: number;
}

/** Valores iniciais de ajuste (spec: "valores iniciais de tuning, não contrato"). */
export const WEAPONS: Readonly<Record<WeaponId, WeaponDef>> = {
  pistol: {
    id: 'pistol',
    name: 'Pistola P-7',
    auto: false,
    fireInterval: 0.16,
    magSize: 12,
    reserveMax: Infinity,
    reloadTime: 1.1,
    pellets: 1,
    damage: 20,
    headMult: 2,
    spread: 0.006,
    bloomPerShot: 0.018,
    falloffStart: 30,
    falloffEnd: 60,
    falloffMin: 0.6,
    recoilPitch: 0.035,
    recoilYaw: 0.008,
    noiseRadius: 26,
    range: 120,
    shake: 0.08,
  },
  rifle: {
    id: 'rifle',
    name: 'Rifle AR-12',
    auto: true,
    fireInterval: 0.1,
    magSize: 30,
    reserveMax: 120,
    reloadTime: 1.7,
    pellets: 1,
    damage: 14,
    headMult: 2,
    spread: 0.01,
    bloomPerShot: 0.008,
    falloffStart: 35,
    falloffEnd: 80,
    falloffMin: 0.65,
    recoilPitch: 0.022,
    recoilYaw: 0.012,
    noiseRadius: 32,
    range: 140,
    shake: 0.06,
  },
  shotgun: {
    id: 'shotgun',
    name: 'Escopeta SG-4',
    auto: false,
    fireInterval: 0.85,
    magSize: 6,
    reserveMax: 30,
    reloadTime: 2.2,
    pellets: 8,
    damage: 12,
    headMult: 1.5,
    spread: 0.075,
    bloomPerShot: 0.04,
    falloffStart: 6,
    falloffEnd: 18,
    falloffMin: 0.2,
    recoilPitch: 0.09,
    recoilYaw: 0.02,
    noiseRadius: 38,
    range: 60,
    shake: 0.22,
  },
};

export const SWITCH_TIME = 0.5;

export interface WeaponSlot {
  readonly owned: boolean;
  readonly mag: number;
  readonly reserve: number;
}

export type ArsenalAction =
  | { readonly kind: 'none' }
  | { readonly kind: 'reload'; readonly t: number }
  | { readonly kind: 'switch'; readonly t: number; readonly to: WeaponId; readonly swapped: boolean };

export interface Arsenal {
  readonly current: WeaponId;
  readonly slots: Readonly<Record<WeaponId, WeaponSlot>>;
  readonly cooldown: number;
  readonly action: ArsenalAction;
}

export interface ArsenalInput {
  readonly triggerHeld: boolean;
  readonly triggerPressed: boolean;
  readonly reload: boolean;
  readonly switchTo: WeaponId | null;
  readonly canFire: boolean;
}

export type ArsenalEvent =
  | { readonly type: 'fire'; readonly weapon: WeaponId }
  | { readonly type: 'dry'; readonly weapon: WeaponId }
  | { readonly type: 'reloadStart'; readonly weapon: WeaponId }
  | { readonly type: 'reloadEnd'; readonly weapon: WeaponId }
  | { readonly type: 'switchStart'; readonly from: WeaponId; readonly to: WeaponId }
  | { readonly type: 'switchEnd'; readonly weapon: WeaponId };

export function createArsenal(): Arsenal {
  return {
    current: 'pistol',
    slots: {
      pistol: { owned: true, mag: WEAPONS.pistol.magSize, reserve: Infinity },
      rifle: { owned: false, mag: 0, reserve: 0 },
      shotgun: { owned: false, mag: 0, reserve: 0 },
    },
    cooldown: 0,
    action: { kind: 'none' },
  };
}

const withSlot = (a: Arsenal, id: WeaponId, slot: WeaponSlot): Arsenal => ({ ...a, slots: { ...a.slots, [id]: slot } });

function canReload(a: Arsenal): boolean {
  const slot = a.slots[a.current];
  const def = WEAPONS[a.current];
  return a.action.kind === 'none' && slot.reserve > 0 && slot.mag < def.magSize;
}

/** Recarga que preserva a bala da câmara: pente parcial comporta uma a mais. */
export function finishReload(slot: WeaponSlot, def: WeaponDef): WeaponSlot {
  const capacity = def.magSize + (slot.mag > 0 ? 1 : 0);
  const added = Math.min(capacity - slot.mag, slot.reserve);
  return { ...slot, mag: slot.mag + added, reserve: slot.reserve - added };
}

/** Um passo da máquina de estados das armas. Pura: devolve o estado novo e os eventos do passo. */
export function stepArsenal(a: Arsenal, input: ArsenalInput, dt: number): { arsenal: Arsenal; events: ArsenalEvent[] } {
  const events: ArsenalEvent[] = [];
  // O resto negativo do intervalo passa para o próximo tiro: a cadência não depende da taxa de quadros.
  const rawCooldown = a.cooldown - dt;
  let s: Arsenal = { ...a, cooldown: Math.max(0, rawCooldown) };

  const wanted = input.switchTo;
  if (wanted && wanted !== s.current && s.slots[wanted].owned && !(s.action.kind === 'switch' && s.action.to === wanted)) {
    events.push({ type: 'switchStart', from: s.current, to: wanted });
    s = { ...s, action: { kind: 'switch', t: 0, to: wanted, swapped: false } };
  }

  const action = s.action;
  if (action.kind === 'switch') {
    const t = action.t + dt;
    let current = s.current;
    let swapped = action.swapped;
    if (!swapped && t >= SWITCH_TIME / 2) {
      current = action.to;
      swapped = true;
    }
    if (t >= SWITCH_TIME) {
      events.push({ type: 'switchEnd', weapon: action.to });
      return { arsenal: { ...s, current: action.to, action: { kind: 'none' }, cooldown: 0 }, events };
    }
    return { arsenal: { ...s, current, action: { ...action, t, swapped } }, events };
  }

  if (action.kind === 'reload') {
    const t = action.t + dt;
    const def = WEAPONS[s.current];
    if (t >= def.reloadTime) {
      events.push({ type: 'reloadEnd', weapon: s.current });
      s = withSlot(s, s.current, finishReload(s.slots[s.current], def));
      return { arsenal: { ...s, action: { kind: 'none' } }, events };
    }
    return { arsenal: { ...s, action: { kind: 'reload', t } }, events };
  }

  if (input.reload && canReload(s)) {
    events.push({ type: 'reloadStart', weapon: s.current });
    return { arsenal: { ...s, action: { kind: 'reload', t: 0 } }, events };
  }

  const def = WEAPONS[s.current];
  const slot = s.slots[s.current];
  const pulling = def.auto ? input.triggerHeld : input.triggerPressed;
  if (pulling && input.canFire && s.cooldown <= 0) {
    if (slot.mag > 0) {
      events.push({ type: 'fire', weapon: s.current });
      s = withSlot(s, s.current, { ...slot, mag: slot.mag - 1 });
      s = { ...s, cooldown: def.fireInterval + Math.max(-def.fireInterval, Math.min(0, rawCooldown)) };
      if (slot.mag - 1 === 0 && slot.reserve > 0) {
        events.push({ type: 'reloadStart', weapon: s.current });
        s = { ...s, action: { kind: 'reload', t: -def.fireInterval } };
      }
    } else if (input.triggerPressed) {
      if (canReload(s)) {
        events.push({ type: 'reloadStart', weapon: s.current });
        s = { ...s, action: { kind: 'reload', t: 0 } };
      } else {
        events.push({ type: 'dry', weapon: s.current });
        s = { ...s, cooldown: 0.25 };
      }
    }
  }
  return { arsenal: s, events };
}

/** Recebe uma arma: passa a possuí-la com o pente cheio e munição extra. */
export function giveWeapon(a: Arsenal, id: WeaponId, extra: number): Arsenal {
  const def = WEAPONS[id];
  const slot = a.slots[id];
  if (slot.owned) return addAmmo(a, id, def.magSize);
  return withSlot(a, id, { owned: true, mag: def.magSize, reserve: Math.min(def.reserveMax, extra) });
}

export function addAmmo(a: Arsenal, id: WeaponId, amount: number): Arsenal {
  const slot = a.slots[id];
  const def = WEAPONS[id];
  if (!slot.owned) return a;
  return withSlot(a, id, { ...slot, reserve: Math.min(def.reserveMax, slot.reserve + amount) });
}

/** Caixa de munição: só vale se alguma arma possuída não estiver cheia. */
export function ammoBoxUseful(a: Arsenal): boolean {
  return (['rifle', 'shotgun'] as const).some((id) => a.slots[id].owned && a.slots[id].reserve < WEAPONS[id].reserveMax);
}

export const AMMO_BOX: Readonly<Record<'rifle' | 'shotgun', number>> = { rifle: 30, shotgun: 6 };

/** Próxima arma possuída na direção da roda do mouse. */
export function cycleWeapon(a: Arsenal, dir: 1 | -1): WeaponId {
  const base = a.action.kind === 'switch' ? a.action.to : a.current;
  const start = WEAPON_ORDER.indexOf(base);
  for (let n = 1; n <= WEAPON_ORDER.length; n++) {
    const id = WEAPON_ORDER[(start + dir * n + WEAPON_ORDER.length * 2) % WEAPON_ORDER.length]!;
    if (a.slots[id].owned) return id;
  }
  return base;
}

/** Fator de dano pela distância (queda linear entre início e fim). */
export function falloff(def: WeaponDef, distance: number): number {
  if (distance <= def.falloffStart) return 1;
  if (distance >= def.falloffEnd) return def.falloffMin;
  const t = (distance - def.falloffStart) / (def.falloffEnd - def.falloffStart);
  return 1 + (def.falloffMin - 1) * t;
}
