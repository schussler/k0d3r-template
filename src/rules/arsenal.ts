/**
 * Estado das armas do jogador: tiro, recarga, troca e munição. Funções puras; o lado visual e sonoro reage aos
 * eventos que `updateArsenal` devolve. Números iniciais na spec de produto (tabela de armas).
 */
export type WeaponId = 'pistol' | 'rifle' | 'shotgun';

export const WEAPON_ORDER: readonly WeaponId[] = ['pistol', 'rifle', 'shotgun'];

export interface WeaponDef {
  readonly id: WeaponId;
  readonly label: string;
  readonly magSize: number;
  readonly infiniteReserve: boolean;
  readonly startReserve: number;
  readonly reserveMax: number;
  readonly damage: number;
  readonly pellets: number;
  readonly headMultiplier: number;
  /** Fração do dano que atravessa o escudo frontal do brutamontes. */
  readonly shieldPierce: number;
  readonly fireInterval: number;
  readonly automatic: boolean;
  /** Recarga inteira, ou por cartucho quando `perShellReload`. */
  readonly reloadTime: number;
  readonly perShellReload: boolean;
  readonly spreadBase: number;
  readonly spreadMove: number;
  readonly spreadPerShot: number;
  readonly spreadMax: number;
  /** Radianos por segundo que a dispersão fecha. */
  readonly spreadRecovery: number;
  readonly recoilKick: number;
  readonly falloffStart: number;
  readonly falloffEnd: number;
  readonly falloffFloor: number;
  /** Raio, em metros, em que os robôs ouvem o tiro. */
  readonly noiseRadius: number;
  readonly range: number;
}

export const WEAPONS: Readonly<Record<WeaponId, WeaponDef>> = {
  pistol: {
    id: 'pistol', label: 'PISTOLA', magSize: 12, infiniteReserve: true, startReserve: 0, reserveMax: 0,
    damage: 22, pellets: 1, headMultiplier: 2, shieldPierce: 0, fireInterval: 0.25, automatic: false,
    reloadTime: 1.1, perShellReload: false,
    spreadBase: 0.004, spreadMove: 0.02, spreadPerShot: 0.014, spreadMax: 0.055, spreadRecovery: 0.14,
    recoilKick: 0.75, falloffStart: 20, falloffEnd: 45, falloffFloor: 0.6, noiseRadius: 24, range: 120,
  },
  rifle: {
    id: 'rifle', label: 'RIFLE', magSize: 30, infiniteReserve: false, startReserve: 120, reserveMax: 240,
    damage: 16, pellets: 1, headMultiplier: 2, shieldPierce: 0, fireInterval: 0.1, automatic: true,
    reloadTime: 1.8, perShellReload: false,
    spreadBase: 0.006, spreadMove: 0.03, spreadPerShot: 0.0065, spreadMax: 0.07, spreadRecovery: 0.16,
    recoilKick: 0.42, falloffStart: 25, falloffEnd: 50, falloffFloor: 0.6, noiseRadius: 32, range: 120,
  },
  shotgun: {
    id: 'shotgun', label: 'ESCOPETA', magSize: 6, infiniteReserve: false, startReserve: 24, reserveMax: 36,
    damage: 12, pellets: 9, headMultiplier: 1.5, shieldPierce: 0.5, fireInterval: 0.9, automatic: false,
    reloadTime: 0.45, perShellReload: true,
    spreadBase: 0.065, spreadMove: 0.02, spreadPerShot: 0.02, spreadMax: 0.11, spreadRecovery: 0.1,
    recoilKick: 1.7, falloffStart: 6, falloffEnd: 20, falloffFloor: 0.25, noiseRadius: 38, range: 60,
  },
};

export const LOWER_TIME = 0.18;
export const RAISE_TIME = 0.3;
const DRY_FIRE_INTERVAL = 0.25;

export interface GunState {
  readonly mag: number;
  readonly reserve: number;
}

export type ArsenalAction =
  | { readonly kind: 'idle' }
  | { readonly kind: 'reload'; readonly remaining: number }
  | { readonly kind: 'lower'; readonly remaining: number; readonly to: WeaponId }
  | { readonly kind: 'raise'; readonly remaining: number };

export interface ArsenalState {
  readonly owned: readonly WeaponId[];
  readonly current: WeaponId;
  readonly guns: Readonly<Record<WeaponId, GunState>>;
  readonly action: ArsenalAction;
  readonly cooldown: number;
  /** Gatilho ainda segurado desde o último tiro: arma semiautomática espera soltar. */
  readonly triggerLatched: boolean;
}

export interface ArsenalInput {
  readonly trigger: boolean;
  /** Borda de R pressionado. */
  readonly reload: boolean;
  readonly select: WeaponId | null;
  readonly cycle: -1 | 0 | 1;
  readonly sprinting: boolean;
}

export type ArsenalEvent =
  | { readonly type: 'fire'; readonly weapon: WeaponId }
  | { readonly type: 'dry'; readonly weapon: WeaponId }
  | { readonly type: 'reload-start'; readonly weapon: WeaponId }
  | { readonly type: 'reload-shell'; readonly weapon: WeaponId }
  | { readonly type: 'reload-end'; readonly weapon: WeaponId }
  | { readonly type: 'switch-start'; readonly weapon: WeaponId }
  | { readonly type: 'draw'; readonly weapon: WeaponId }
  | { readonly type: 'switch-end'; readonly weapon: WeaponId };

const IDLE: ArsenalAction = { kind: 'idle' };

export function createArsenal(): ArsenalState {
  return {
    owned: ['pistol'],
    current: 'pistol',
    guns: {
      pistol: { mag: WEAPONS.pistol.magSize, reserve: 0 },
      rifle: { mag: 0, reserve: 0 },
      shotgun: { mag: 0, reserve: 0 },
    },
    action: IDLE,
    cooldown: 0,
    triggerLatched: false,
  };
}

function withGun(s: ArsenalState, id: WeaponId, gun: GunState): ArsenalState {
  return { ...s, guns: { ...s.guns, [id]: gun } };
}

export function addAmmo(s: ArsenalState, id: WeaponId, amount: number): ArsenalState {
  const def = WEAPONS[id];
  if (def.infiniteReserve) return s;
  const gun = s.guns[id];
  return withGun(s, id, { mag: gun.mag, reserve: Math.min(def.reserveMax, gun.reserve + amount) });
}

export function giveWeapon(s: ArsenalState, id: WeaponId): ArsenalState {
  if (s.owned.includes(id)) return addAmmo(s, id, WEAPONS[id].startReserve);
  const owned = WEAPON_ORDER.filter((w) => w === id || s.owned.includes(w));
  const def = WEAPONS[id];
  return withGun({ ...s, owned }, id, { mag: def.magSize, reserve: def.startReserve });
}

function canReload(s: ArsenalState): boolean {
  const def = WEAPONS[s.current];
  const gun = s.guns[s.current];
  return gun.mag < def.magSize && (def.infiniteReserve || gun.reserve > 0);
}

function requestedWeapon(s: ArsenalState, input: ArsenalInput): WeaponId | null {
  if (input.select) return s.owned.includes(input.select) ? input.select : null;
  if (input.cycle === 0 || s.owned.length < 2) return null;
  const from = s.action.kind === 'lower' ? s.action.to : s.current;
  const i = s.owned.indexOf(from);
  return s.owned[(i + input.cycle + s.owned.length) % s.owned.length] ?? null;
}

function applySwitch(s: ArsenalState, target: WeaponId | null, events: ArsenalEvent[]): ArsenalState {
  if (!target) return s;
  if (s.action.kind === 'lower') return target === s.action.to ? s : { ...s, action: { ...s.action, to: target } };
  if (target === s.current) return s;
  events.push({ type: 'switch-start', weapon: target });
  return { ...s, action: { kind: 'lower', remaining: LOWER_TIME, to: target } };
}

function finishReloadStep(s: ArsenalState, events: ArsenalEvent[]): ArsenalState {
  const def = WEAPONS[s.current];
  const gun = s.guns[s.current];
  if (def.perShellReload) {
    const loaded = withGun(s, s.current, {
      mag: gun.mag + 1,
      reserve: def.infiniteReserve ? gun.reserve : gun.reserve - 1,
    });
    events.push({ type: 'reload-shell', weapon: s.current });
    if (canReload(loaded)) return { ...loaded, action: { kind: 'reload', remaining: def.reloadTime } };
    events.push({ type: 'reload-end', weapon: s.current });
    return { ...loaded, action: IDLE };
  }
  const take = def.infiniteReserve ? def.magSize - gun.mag : Math.min(def.magSize - gun.mag, gun.reserve);
  events.push({ type: 'reload-end', weapon: s.current });
  return {
    ...withGun(s, s.current, { mag: gun.mag + take, reserve: def.infiniteReserve ? gun.reserve : gun.reserve - take }),
    action: IDLE,
  };
}

function advanceAction(s: ArsenalState, dt: number, events: ArsenalEvent[]): ArsenalState {
  const a = s.action;
  if (a.kind === 'idle') return s;
  const remaining = a.remaining - dt;
  if (remaining > 0) return { ...s, action: { ...a, remaining } };
  switch (a.kind) {
    case 'lower':
      events.push({ type: 'draw', weapon: a.to });
      return { ...s, current: a.to, action: { kind: 'raise', remaining: RAISE_TIME } };
    case 'raise':
      events.push({ type: 'switch-end', weapon: s.current });
      return { ...s, action: IDLE };
    case 'reload':
      return finishReloadStep(s, events);
  }
}

function startReload(s: ArsenalState, events: ArsenalEvent[]): ArsenalState {
  events.push({ type: 'reload-start', weapon: s.current });
  return { ...s, action: { kind: 'reload', remaining: WEAPONS[s.current].reloadTime } };
}

function tryFire(s: ArsenalState, input: ArsenalInput, events: ArsenalEvent[]): ArsenalState {
  const def = WEAPONS[s.current];
  const gun = s.guns[s.current];
  const canInterrupt = s.action.kind === 'reload' && def.perShellReload && gun.mag > 0;
  if (!input.trigger || input.sprinting || s.cooldown > 0) return s;
  if (s.action.kind !== 'idle' && !canInterrupt) return s;
  if (!def.automatic && s.triggerLatched) return s;
  if (gun.mag > 0) {
    events.push({ type: 'fire', weapon: s.current });
    return {
      ...withGun(s, s.current, { mag: gun.mag - 1, reserve: gun.reserve }),
      action: IDLE,
      cooldown: s.cooldown + def.fireInterval,
      triggerLatched: true,
    };
  }
  if (canReload(s)) return { ...startReload(s, events), triggerLatched: true };
  events.push({ type: 'dry', weapon: s.current });
  return { ...s, cooldown: DRY_FIRE_INTERVAL, triggerLatched: true };
}

export function updateArsenal(
  state: ArsenalState,
  input: ArsenalInput,
  dt: number,
): { state: ArsenalState; events: ArsenalEvent[] } {
  const events: ArsenalEvent[] = [];
  let s: ArsenalState = {
    ...state,
    cooldown: Math.max(-dt, state.cooldown - dt),
    triggerLatched: state.triggerLatched && input.trigger,
  };
  s = applySwitch(s, requestedWeapon(s, input), events);
  s = advanceAction(s, dt, events);
  if (input.reload && s.action.kind === 'idle' && canReload(s)) s = startReload(s, events);
  s = tryFire(s, input, events);
  if (s.cooldown < 0 && !input.trigger) s = { ...s, cooldown: 0 };
  return { state: s, events };
}
