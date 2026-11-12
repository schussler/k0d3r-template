import { MAX_HEALTH, MAX_SHIELD, type Vitals } from '../logic/combat';
import { formatTime } from '../logic/flow';
import { WEAPONS, WEAPON_ORDER, type Arsenal } from '../logic/weapons';
import { CROSSHAIR, DAMAGE_ARC, HITMARKER, ICON_AMMO, ICON_HAND, ICON_HEALTH, ICON_SHIELD, WEAPON_ICONS } from './icons';

export type HitMarkerKind = 'body' | 'head' | 'kill' | 'blocked';

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, html = ''): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  e.className = cls;
  e.innerHTML = html;
  return e;
}

/** HUD em DOM + SVG sobre o canvas: vida, escudo, munição, setor, mira dinâmica, marcadores e chefe. */
export class Hud {
  readonly root = el('div', 'hud hidden');
  private readonly sector = el('div', 'hud-sector');
  private readonly timer = el('div', 'hud-timer');
  private readonly healthFill = el('div', 'bar-fill health');
  private readonly healthText = el('span', 'bar-text');
  private readonly shieldFill = el('div', 'bar-fill shield');
  private readonly shieldText = el('span', 'bar-text');
  private readonly ammoMag = el('span', 'ammo-mag');
  private readonly ammoReserve = el('span', 'ammo-reserve');
  private readonly weaponIcon = el('div', 'weapon-icon');
  private readonly weaponName = el('div', 'weapon-name');
  private readonly reload = el('div', 'reload-bar', '<div class="reload-fill"></div>');
  private readonly slots = el('div', 'weapon-slots');
  private readonly crosshair = el('div', 'crosshair', CROSSHAIR);
  private readonly hitmarker = el('div', 'hitmarker', HITMARKER);
  private readonly prompt = el('div', 'prompt hidden');
  private readonly toasts = el('div', 'toasts');
  private readonly vignette = el('div', 'vignette');
  private readonly damageArcs = el('div', 'damage-arcs');
  private readonly bossBar = el('div', 'boss hidden', '<div class="boss-name">GUARDIÃO DO NÚCLEO</div><div class="boss-track"><div class="boss-fill"></div><div class="boss-ghost"></div></div><div class="boss-phase"></div>');
  private readonly fps = el('div', 'fps hidden');
  private hitTime = 0;
  private hurt = 0;
  private bossGhost = 1;
  private lastWeapon = '';

  constructor(parent: HTMLElement) {
    const vitals = el('div', 'hud-vitals');
    const healthRow = el('div', 'bar-row', `<span class="icon icon-health">${ICON_HEALTH}</span>`);
    const healthTrack = el('div', 'bar-track');
    healthTrack.append(this.healthFill);
    healthRow.append(healthTrack, this.healthText);
    const shieldRow = el('div', 'bar-row', `<span class="icon icon-shield">${ICON_SHIELD}</span>`);
    const shieldTrack = el('div', 'bar-track');
    shieldTrack.append(this.shieldFill);
    shieldRow.append(shieldTrack, this.shieldText);
    vitals.append(shieldRow, healthRow);

    const weapon = el('div', 'hud-weapon');
    const ammo = el('div', 'ammo', `<span class="icon icon-ammo">${ICON_AMMO}</span>`);
    ammo.append(this.ammoMag, el('span', 'ammo-sep', '/'), this.ammoReserve);
    weapon.append(this.slots, this.weaponIcon, this.weaponName, ammo, this.reload);

    const top = el('div', 'hud-top');
    top.append(this.sector, this.timer);
    this.root.append(this.vignette, this.damageArcs, top, this.bossBar, vitals, weapon, this.crosshair, this.hitmarker, this.prompt, this.toasts, this.fps);
    parent.append(this.root);
  }

  show(visible: boolean): void {
    this.root.classList.toggle('hidden', !visible);
  }

  setSector(label: string, name: string): void {
    this.sector.innerHTML = `<span class="sector-label">${label}</span><span class="sector-name">${name}</span>`;
  }

  setPrompt(text: string | null): void {
    this.prompt.classList.toggle('hidden', text === null);
    if (text !== null) this.prompt.innerHTML = `<span class="icon">${ICON_HAND}</span><kbd>E</kbd> ${text}`;
  }

  toast(text: string): void {
    const t = el('div', 'toast', text);
    this.toasts.prepend(t);
    window.setTimeout(() => t.remove(), 2600);
  }

  hit(kind: HitMarkerKind): void {
    this.hitmarker.dataset.kind = kind;
    this.hitTime = kind === 'head' || kind === 'kill' ? 0.35 : 0.2;
  }

  /** Dano recebido: vinheta e arco apontando de onde veio (ângulo relativo à câmera). */
  damage(amount: number, relativeAngle: number | null): void {
    this.hurt = Math.min(1, this.hurt + amount / 30);
    if (relativeAngle === null) return;
    const arc = el('div', 'damage-arc', DAMAGE_ARC);
    arc.style.transform = `translate(-50%, -50%) rotate(${(-relativeAngle * 180) / Math.PI}deg)`;
    this.damageArcs.append(arc);
    window.setTimeout(() => arc.remove(), 900);
  }

  setFps(fps: number | null, quality: number): void {
    this.fps.classList.toggle('hidden', fps === null);
    if (fps !== null) this.fps.textContent = `${fps.toFixed(0)} FPS · qualidade ${quality}`;
  }

  setBoss(fraction: number | null, phase: number): void {
    this.bossBar.classList.toggle('hidden', fraction === null);
    if (fraction === null) return;
    const f = Math.max(0, fraction);
    this.bossGhost = Math.max(f, this.bossGhost - 0.004);
    (this.bossBar.querySelector('.boss-fill') as HTMLElement).style.width = `${f * 100}%`;
    (this.bossBar.querySelector('.boss-ghost') as HTMLElement).style.width = `${this.bossGhost * 100}%`;
    (this.bossBar.querySelector('.boss-phase') as HTMLElement).textContent = `FASE ${phase} / 3`;
  }

  update(dt: number, vitals: Vitals, arsenal: Arsenal, spread: number, elapsed: number): void {
    this.healthFill.style.width = `${(vitals.health / MAX_HEALTH) * 100}%`;
    this.healthText.textContent = String(Math.ceil(vitals.health));
    this.shieldFill.style.width = `${(vitals.shield / MAX_SHIELD) * 100}%`;
    this.shieldText.textContent = String(Math.ceil(vitals.shield));
    this.root.classList.toggle('low-health', vitals.health < 30);

    const slot = arsenal.slots[arsenal.current];
    const def = WEAPONS[arsenal.current];
    this.ammoMag.textContent = String(slot.mag);
    this.ammoMag.classList.toggle('empty', slot.mag === 0);
    this.ammoMag.classList.toggle('low', slot.mag > 0 && slot.mag <= Math.ceil(def.magSize / 4));
    this.ammoReserve.textContent = Number.isFinite(slot.reserve) ? String(slot.reserve) : '∞';
    if (this.lastWeapon !== arsenal.current) {
      this.lastWeapon = arsenal.current;
      this.weaponIcon.innerHTML = WEAPON_ICONS[arsenal.current];
      this.weaponName.textContent = def.name;
    }
    this.slots.innerHTML = WEAPON_ORDER.map((id, n) => {
      const owned = arsenal.slots[id].owned;
      const active = id === arsenal.current;
      return `<span class="slot${owned ? '' : ' locked'}${active ? ' active' : ''}">${n + 1}</span>`;
    }).join('');
    const reloading = arsenal.action.kind === 'reload';
    this.reload.classList.toggle('hidden', !reloading);
    if (arsenal.action.kind === 'reload') {
      (this.reload.firstElementChild as HTMLElement).style.width = `${Math.max(0, Math.min(1, arsenal.action.t / def.reloadTime)) * 100}%`;
    }

    // A abertura visual da mira é o mesmo espalhamento usado nos tiros (em pixels na tela).
    const fovPx = window.innerHeight / (2 * Math.tan((75 * Math.PI) / 360));
    const gap = Math.max(5, spread * fovPx);
    this.crosshair.style.setProperty('--gap', `${gap}px`);

    this.hitTime = Math.max(0, this.hitTime - dt);
    this.hitmarker.style.opacity = String(Math.min(1, this.hitTime * 6));
    this.hitmarker.style.transform = `translate(-50%, -50%) scale(${1 + this.hitTime * 1.2})`;
    this.hurt = Math.max(0, this.hurt - dt * 1.2);
    this.vignette.style.opacity = String(this.hurt + (vitals.health < 30 ? 0.25 + 0.15 * Math.sin(elapsed * 6) : 0));
    this.timer.textContent = formatTime(elapsed);
  }
}
