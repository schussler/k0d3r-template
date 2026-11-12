import { logo } from './icons';

export type ScreenId = 'title' | 'pause' | 'dead' | 'victory' | 'resume' | 'error' | 'none';

export interface ScreenHandlers {
  play(): void;
  resume(): void;
  restartSector(): void;
  retry(): void;
  backToTitle(): void;
  setSensitivity(value: number): void;
  setVolume(value: number): void;
}

const CONTROLS = `
<ul class="controls">
  <li><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> mover</li>
  <li><kbd>Shift</kbd> correr</li>
  <li><kbd>Espaço</kbd> pular</li>
  <li><kbd>C</kbd> agachar</li>
  <li><kbd>R</kbd> recarregar</li>
  <li><kbd>1</kbd><kbd>2</kbd><kbd>3</kbd> ou roda: trocar arma</li>
  <li><kbd>E</kbd> usar interruptor</li>
  <li><kbd>Esc</kbd> pausar</li>
</ul>`;

/** Telas sobre o jogo (título, pausa, morte, vitória, avisos). Texto em pt-BR. */
export class Screens {
  private readonly root = document.createElement('div');
  private readonly panels = new Map<ScreenId, HTMLElement>();
  private readonly fade = document.createElement('div');
  private readonly card = document.createElement('div');
  current: ScreenId = 'none';

  constructor(parent: HTMLElement, private readonly handlers: ScreenHandlers, initial: { sensitivity: number; volume: number }) {
    this.root.className = 'screens';
    this.fade.className = 'fade';
    this.card.className = 'sector-card hidden';
    parent.append(this.root, this.fade, this.card);

    this.panel('title', `
      <div class="title-block">
        <div class="logo">${logo('logo-title')}</div>
        <h1>ESTAÇÃO <span>KEPLER</span></h1>
        <p class="tagline">A IA da estação virou os robôs contra a tripulação. Você é a última técnica acordada. Chegue ao núcleo e desligue-a.</p>
        <button class="btn primary" data-action="play">Jogar</button>
        ${CONTROLS}
      </div>`);
    this.panel('pause', `
      <div class="menu">
        <h2>PAUSADO</h2>
        <button class="btn primary" data-action="resume">Continuar</button>
        <button class="btn" data-action="restart">Recomeçar setor</button>
        <label class="slider">Sensibilidade do mouse <input type="range" min="0.4" max="2.5" step="0.05" data-setting="sensitivity" value="${initial.sensitivity}"></label>
        <label class="slider">Volume <input type="range" min="0" max="1" step="0.05" data-setting="volume" value="${initial.volume}"></label>
        <button class="btn ghost" data-action="title">Sair para o título</button>
        ${CONTROLS}
      </div>`);
    this.panel('dead', `
      <div class="menu dead">
        <h2>SINAL VITAL PERDIDO</h2>
        <p>Os robôs ainda estão de pé. O setor espera por você.</p>
        <button class="btn primary" data-action="retry">Tentar de novo</button>
        <button class="btn ghost" data-action="title">Sair para o título</button>
      </div>`);
    this.panel('victory', `
      <div class="menu victory">
        <div class="logo small">${logo('logo-victory')}</div>
        <h2>NÚCLEO DESLIGADO</h2>
        <p>A estação está quieta de novo. Os robôs param no meio do passo.</p>
        <div class="final-time"><span>Tempo total</span><strong data-field="time">00:00.0</strong></div>
        <div class="final-deaths" data-field="deaths"></div>
        <button class="btn primary" data-action="title">Jogar de novo</button>
      </div>`);
    this.panel('resume', `
      <div class="menu compact">
        <h2>Clique para continuar</h2>
        <p>O navegador soltou o mouse. Um clique trava de novo.</p>
        <button class="btn primary" data-action="resume">Continuar</button>
      </div>`);
    this.panel('error', `<div class="menu error"><h2 data-field="title">Erro</h2><p data-field="message"></p><button class="btn primary" data-action="reload">Recarregar</button></div>`);

    this.root.addEventListener('click', (e) => {
      const target = (e.target as HTMLElement).closest<HTMLElement>('[data-action]');
      if (!target) return;
      const action = target.dataset.action;
      if (action === 'play') handlers.play();
      else if (action === 'resume') handlers.resume();
      else if (action === 'restart') handlers.restartSector();
      else if (action === 'retry') handlers.retry();
      else if (action === 'title') handlers.backToTitle();
      else if (action === 'reload') window.location.reload();
    });
    this.root.addEventListener('input', (e) => {
      const input = e.target as HTMLInputElement;
      if (input.dataset.setting === 'sensitivity') this.handlers.setSensitivity(Number(input.value));
      if (input.dataset.setting === 'volume') this.handlers.setVolume(Number(input.value));
    });
  }

  private panel(id: ScreenId, html: string): void {
    const p = document.createElement('div');
    p.className = `screen screen-${id} hidden`;
    p.innerHTML = html;
    this.root.append(p);
    this.panels.set(id, p);
  }

  show(id: ScreenId): void {
    this.current = id;
    for (const [key, p] of this.panels) p.classList.toggle('hidden', key !== id);
    this.root.classList.toggle('active', id !== 'none');
  }

  setVictory(time: string, deaths: number): void {
    const p = this.panels.get('victory')!;
    (p.querySelector('[data-field="time"]') as HTMLElement).textContent = time;
    (p.querySelector('[data-field="deaths"]') as HTMLElement).textContent = deaths === 0 ? 'Sem nenhuma queda.' : `${deaths} ${deaths === 1 ? 'queda' : 'quedas'} no caminho.`;
  }

  showError(title: string, message: string): void {
    const p = this.panels.get('error')!;
    (p.querySelector('[data-field="title"]') as HTMLElement).textContent = title;
    (p.querySelector('[data-field="message"]') as HTMLElement).textContent = message;
    this.show('error');
  }

  /** Escurece a tela; `opacity` 0 a 1. */
  setFade(opacity: number): void {
    this.fade.style.opacity = String(opacity);
  }

  /** Cartão com o nome do setor na entrada. */
  sectorCard(label: string, name: string): void {
    this.card.innerHTML = `<span>${label}</span><strong>${name}</strong>`;
    this.card.classList.remove('hidden');
    this.card.classList.remove('animate');
    void this.card.offsetWidth;
    this.card.classList.add('animate');
    window.setTimeout(() => this.card.classList.add('hidden'), 3200);
  }
}
