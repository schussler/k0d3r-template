import { WEAPONS, type ArsenalState, type WeaponId } from '../rules/arsenal';
import { ICON, WEAPON_ICON, path, svg } from './icons';

/**
 * HUD de visor de capacete por cima do canvas. Atualiza o DOM só quando um valor muda, para não pesar no quadro.
 */
const HIT_TIME = 0.16;
const HEAD_TIME = 0.32;

export interface HudState {
  health: number;
  maxHealth: number;
  shield: number;
  maxShield: number;
  arsenal: ArsenalState;
  sector: string;
  /** Dispersão em pixels de tela: o raio da mira. */
  spreadPx: number;
}

export class Hud {
  readonly root: HTMLDivElement;
  private readonly cross: SVGGElement;
  private readonly hitmark: SVGGElement;
  private readonly healthFill: HTMLElement;
  private readonly shieldFill: HTMLElement;
  private readonly healthText: HTMLElement;
  private readonly shieldText: HTMLElement;
  private readonly magText: HTMLElement;
  private readonly reserveText: HTMLElement;
  private readonly weaponName: HTMLElement;
  private readonly weaponIcon: HTMLElement;
  private readonly sectorText: HTMLElement;
  private readonly message: HTMLElement;
  private readonly objective: HTMLElement;
  private readonly timer: HTMLElement;
  private readonly prompt: HTMLElement;
  private readonly compass: HTMLElement;
  private readonly arrow: SVGElement;
  private readonly vignette: HTMLElement;
  private readonly slots: HTMLElement;
  private readonly bossBar: HTMLElement;
  private readonly bossFill: HTMLElement;
  private readonly bossName: HTMLElement;
  private readonly damageArc: SVGPathElement;
  private hitTimer = 0;
  private hitHead = false;
  private damageTimer = 0;
  private cache = new Map<string, string>();

  constructor(parent: HTMLElement) {
    const root = document.createElement('div');
    root.className = 'hud';
    root.innerHTML = `
      <div class="vignette"></div>
      <svg class="crosshair" viewBox="-60 -60 120 120" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <g class="cross">
          <line x1="0" y1="-8" x2="0" y2="-18"/><line x1="0" y1="8" x2="0" y2="18"/>
          <line x1="-8" y1="0" x2="-18" y2="0"/><line x1="8" y1="0" x2="18" y2="0"/>
          <circle cx="0" cy="0" r="1.2"/>
        </g>
        <g class="hitmark">
          <line x1="-6" y1="-6" x2="-15" y2="-15"/><line x1="6" y1="-6" x2="15" y2="-15"/>
          <line x1="-6" y1="6" x2="-15" y2="15"/><line x1="6" y1="6" x2="15" y2="15"/>
        </g>
        <path class="damage-arc" d="M -40 -40 A 56 56 0 0 1 40 -40"/>
      </svg>
      <div class="panel vitals">
        <div class="row">${svg('0 0 24 24', path(ICON.shield), 'ico shield')}<div class="bar"><div class="fill shield-fill"></div></div><span class="num shield-num">0</span></div>
        <div class="row">${svg('0 0 24 24', path(ICON.health), 'ico health')}<div class="bar"><div class="fill health-fill"></div></div><span class="num health-num">0</span></div>
      </div>
      <div class="panel ammo">
        <div class="weapon"><span class="weapon-icon"></span><span class="weapon-name"></span></div>
        <div class="counts"><span class="mag">0</span><span class="sep">/</span><span class="reserve">0</span></div>
        <div class="slots"></div>
      </div>
      <div class="panel sector">${svg('0 0 24 24', path(ICON.sector), 'ico')}<div><span class="sector-name"></span><span class="objective"></span></div></div>
      <div class="timer"></div>
      <div class="prompt hidden"></div>
      <div class="compass hidden">${svg('0 0 24 24', path(ICON.arrow), 'arrow')}<span>SAÍDA</span></div>
      <div class="boss hidden"><div class="boss-name"></div><div class="boss-bar"><div class="boss-fill"></div><i style="left:33.3%"></i><i style="left:66.6%"></i></div></div>
      <div class="message"></div>`;
    parent.appendChild(root);
    this.root = root;
    const q = <T extends Element>(sel: string): T => {
      const el = root.querySelector<T>(sel);
      if (!el) throw new Error(`HUD sem o elemento ${sel}`);
      return el;
    };
    this.cross = q('.cross');
    this.hitmark = q('.hitmark');
    this.healthFill = q('.health-fill');
    this.shieldFill = q('.shield-fill');
    this.healthText = q('.health-num');
    this.shieldText = q('.shield-num');
    this.magText = q('.mag');
    this.reserveText = q('.reserve');
    this.weaponName = q('.weapon-name');
    this.weaponIcon = q('.weapon-icon');
    this.sectorText = q('.sector-name');
    this.message = q('.message');
    this.objective = q('.objective');
    this.timer = q('.timer');
    this.prompt = q('.prompt');
    this.compass = q('.compass');
    this.arrow = q('.arrow');
    this.vignette = q('.vignette');
    this.slots = q('.slots');
    this.bossBar = q('.boss');
    this.bossFill = q('.boss-fill');
    this.bossName = q('.boss-name');
    this.damageArc = q('.damage-arc');
  }

  private set(key: string, value: string, apply: () => void): void {
    if (this.cache.get(key) === value) return;
    this.cache.set(key, value);
    apply();
  }

  showHit(head: boolean): void {
    this.hitHead = head;
    this.hitTimer = head ? HEAD_TIME : HIT_TIME;
  }

  /** Arco vermelho na borda da mira apontando de onde veio o dano; `angle` em radianos, 0 = à frente. */
  showDamage(angle: number): void {
    this.damageTimer = 0.9;
    this.damageArc.setAttribute('transform', `rotate(${(angle * 180) / Math.PI})`);
  }

  setObjective(text: string): void {
    this.set('objective', text, () => (this.objective.textContent = text));
  }

  setTimer(text: string): void {
    this.set('timer', text, () => (this.timer.textContent = text));
  }

  setPrompt(text: string | null): void {
    this.set('prompt', text ?? '', () => {
      this.prompt.classList.toggle('hidden', !text);
      this.prompt.textContent = text ?? '';
    });
  }

  /** Seta que aponta a saída; `angle` em radianos, 0 = à frente. Null esconde. */
  setCompass(angle: number | null): void {
    this.set('compass', angle === null ? '' : 'on', () => this.compass.classList.toggle('hidden', angle === null));
    if (angle !== null) this.arrow.style.transform = `rotate(${angle}rad)`;
  }

  setVisible(v: boolean): void {
    this.root.classList.toggle('hidden', !v);
  }

  setBoss(name: string | null, fraction: number): void {
    this.set('boss', name ?? '', () => {
      this.bossBar.classList.toggle('hidden', !name);
      this.bossName.textContent = name ?? '';
    });
    if (name) this.set('bossf', fraction.toFixed(3), () => (this.bossFill.style.width = `${Math.max(0, fraction) * 100}%`));
  }

  update(dt: number, s: HudState): void {
    const gap = 6 + s.spreadPx;
    this.set('gap', gap.toFixed(1), () => {
      const lines = this.cross.querySelectorAll('line');
      const g = gap.toFixed(1);
      const e = (gap + 10).toFixed(1);
      lines[0]?.setAttribute('y1', `-${g}`); lines[0]?.setAttribute('y2', `-${e}`);
      lines[1]?.setAttribute('y1', g); lines[1]?.setAttribute('y2', e);
      lines[2]?.setAttribute('x1', `-${g}`); lines[2]?.setAttribute('x2', `-${e}`);
      lines[3]?.setAttribute('x1', g); lines[3]?.setAttribute('x2', e);
    });
    this.hitTimer = Math.max(0, this.hitTimer - dt);
    const ht = this.hitTimer / (this.hitHead ? HEAD_TIME : HIT_TIME);
    this.hitmark.style.opacity = ht.toFixed(2);
    this.set('head', String(this.hitHead), () => this.hitmark.classList.toggle('head', this.hitHead));
    this.hitmark.setAttribute('transform', `scale(${(1 + (1 - ht) * (this.hitHead ? 0.6 : 0.25)).toFixed(2)})`);
    this.damageTimer = Math.max(0, this.damageTimer - dt);
    this.damageArc.style.opacity = this.damageTimer.toFixed(2);

    const hp = Math.max(0, s.health / s.maxHealth);
    const sh = Math.max(0, s.shield / s.maxShield);
    this.set('hp', Math.ceil(s.health).toString(), () => {
      this.healthFill.style.width = `${hp * 100}%`;
      this.healthText.textContent = Math.ceil(s.health).toString();
      this.root.classList.toggle('low', hp < 0.3);
    });
    this.set('sh', Math.ceil(s.shield).toString(), () => {
      this.shieldFill.style.width = `${sh * 100}%`;
      this.shieldText.textContent = Math.ceil(s.shield).toString();
    });
    this.vignette.style.opacity = (hp < 0.3 ? 0.55 + Math.sin(performance.now() / 180) * 0.15 : 0).toFixed(2);

    const a = s.arsenal;
    const def = WEAPONS[a.current];
    const gun = a.guns[a.current];
    this.set('weapon', a.current, () => {
      this.weaponName.textContent = def.label;
      this.weaponIcon.innerHTML = svg('0 0 64 24', path(WEAPON_ICON[a.current]));
    });
    this.set('mag', `${gun.mag}`, () => {
      this.magText.textContent = String(gun.mag);
      this.magText.classList.toggle('empty', gun.mag === 0);
    });
    this.set('reserve', def.infiniteReserve ? 'inf' : `${gun.reserve}`, () => {
      this.reserveText.innerHTML = def.infiniteReserve ? svg('0 0 32 24', path(ICON.infinity), 'inf') : String(gun.reserve);
    });
    this.set('slots', `${a.owned.join(',')}|${a.current}`, () => {
      this.slots.innerHTML = (['pistol', 'rifle', 'shotgun'] as WeaponId[])
        .map((w, i) => `<span class="slot ${a.owned.includes(w) ? '' : 'locked'} ${w === a.current ? 'on' : ''}">${i + 1}</span>`)
        .join('');
    });
    this.set('sector', s.sector, () => (this.sectorText.textContent = s.sector));

    const lowAmmo = gun.mag === 0 || gun.mag <= def.magSize * 0.25;
    const noReserve = !def.infiniteReserve && gun.reserve === 0;
    const msg = a.action.kind === 'reload' ? 'RECARREGANDO' : gun.mag === 0 && noReserve ? 'SEM MUNIÇÃO' : lowAmmo && !noReserve ? 'RECARREGAR [R]' : '';
    this.set('msg', msg, () => {
      this.message.textContent = msg;
      this.message.classList.toggle('warn', msg !== '' && msg !== 'RECARREGANDO');
    });
  }
}
