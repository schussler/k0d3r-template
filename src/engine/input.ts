/**
 * Entrada por posição física da tecla (`KeyboardEvent.code`): WASD funciona em ABNT2 e AZERTY.
 * O travamento do mouse é tratado aqui, inclusive a recusa do navegador (gesto ausente ou o intervalo
 * imposto logo após o Esc), para nunca virar erro sem tratamento no console.
 */
export class Input {
  private readonly down = new Set<string>();
  private readonly pressed = new Set<string>();
  private mouseDx = 0;
  private mouseDy = 0;
  private wheel = 0;
  private locked = false;
  private readonly lockListeners: ((locked: boolean) => void)[] = [];
  private readonly lockErrorListeners: (() => void)[] = [];

  constructor(private readonly target: HTMLElement) {
    window.addEventListener('keydown', (e) => this.onKey(e, true));
    window.addEventListener('keyup', (e) => this.onKey(e, false));
    window.addEventListener('blur', () => this.down.clear());
    window.addEventListener('mousedown', (e) => {
      if (!this.locked) return;
      const code = `Mouse${e.button}`;
      if (!this.down.has(code)) this.pressed.add(code);
      this.down.add(code);
    });
    window.addEventListener('mouseup', (e) => this.down.delete(`Mouse${e.button}`));
    window.addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      this.mouseDx += e.movementX;
      this.mouseDy += e.movementY;
    });
    window.addEventListener(
      'wheel',
      (e) => {
        if (this.locked) this.wheel += Math.sign(e.deltaY);
      },
      { passive: true },
    );
    window.addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === this.target;
      if (!this.locked) this.down.clear();
      this.lockListeners.forEach((fn) => fn(this.locked));
    });
    document.addEventListener('pointerlockerror', () => this.lockErrorListeners.forEach((fn) => fn()));
  }

  private onKey(e: KeyboardEvent, isDown: boolean): void {
    // Espaço e setas rolariam a página; Tab trocaria o foco.
    if (['Space', 'ArrowUp', 'ArrowDown', 'Tab'].includes(e.code)) e.preventDefault();
    if (isDown) {
      if (!e.repeat && !this.down.has(e.code)) this.pressed.add(e.code);
      this.down.add(e.code);
    } else this.down.delete(e.code);
  }

  isDown(code: string): boolean {
    return this.down.has(code);
  }

  wasPressed(code: string): boolean {
    return this.pressed.has(code);
  }

  consumeMouse(): { dx: number; dy: number; wheel: number } {
    const out = { dx: this.mouseDx, dy: this.mouseDy, wheel: this.wheel };
    this.mouseDx = 0;
    this.mouseDy = 0;
    this.wheel = 0;
    return out;
  }

  /** Chamado no fim de cada quadro: as teclas "apertadas agora" valem um quadro só. */
  endFrame(): void {
    this.pressed.clear();
  }

  get isLocked(): boolean {
    return this.locked;
  }

  onLockChange(fn: (locked: boolean) => void): void {
    this.lockListeners.push(fn);
  }

  onLockError(fn: () => void): void {
    this.lockErrorListeners.push(fn);
  }

  /** Pede o travamento; a recusa chega por `onLockError`, nunca como promessa rejeitada solta. */
  requestLock(): void {
    try {
      const result: unknown = this.target.requestPointerLock();
      if (result instanceof Promise) {
        // A recusa também dispara 'pointerlockerror', que avisa os ouvintes; aqui só registra.
        result.catch((err: unknown) => {
          console.info('[kepler] travamento do mouse recusado:', err instanceof Error ? err.message : err);
        });
      }
    } catch (err: unknown) {
      console.info('[kepler] travamento do mouse indisponível:', err instanceof Error ? err.message : err);
      this.lockErrorListeners.forEach((fn) => fn());
    }
  }

  releaseLock(): void {
    if (document.pointerLockElement) document.exitPointerLock();
  }
}
