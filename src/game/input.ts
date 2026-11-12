/**
 * Teclado, mouse e trava do mouse. O Esc solta a trava nativamente e não pode ser interceptado, então quem pausa
 * o jogo é a perda da trava (`onLockChange`), não a tecla (spec de arquitetura, "Console limpo").
 */
export class Input {
  private readonly held = new Set<string>();
  private readonly edges = new Set<string>();
  private mouseDX = 0;
  private mouseDY = 0;
  private wheel = 0;
  private buttons = 0;
  private clickEdge = false;
  /** Modo de teste (só em desenvolvimento): o jogo roda sem a trava do mouse, que o navegador sem tela recusa. */
  testMode = false;
  onLockChange: (locked: boolean) => void = () => undefined;

  constructor(private readonly target: HTMLElement) {
    document.addEventListener('keydown', (e) => {
      if (e.code === 'Tab' || e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
      if (!e.repeat) this.edges.add(e.code);
      this.held.add(e.code);
    });
    document.addEventListener('keyup', (e) => this.held.delete(e.code));
    document.addEventListener('mousemove', (e) => {
      if (!this.locked && !this.testMode) return;
      this.mouseDX += e.movementX;
      this.mouseDY += e.movementY;
    });
    document.addEventListener('mousedown', (e) => {
      this.buttons |= 1 << e.button;
      if (e.button === 0) this.clickEdge = true;
    });
    document.addEventListener('mouseup', (e) => {
      this.buttons &= ~(1 << e.button);
    });
    document.addEventListener('wheel', (e) => {
      this.wheel += Math.sign(e.deltaY);
    }, { passive: true });
    document.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('blur', () => this.releaseAll());
    document.addEventListener('pointerlockchange', () => {
      if (!this.locked) this.releaseAll();
      this.onLockChange(this.locked);
    });
  }

  get locked(): boolean {
    return document.pointerLockElement === this.target;
  }

  /**
   * Pede a trava; só funciona dentro de um gesto do usuário. A recusa (pedido logo depois de soltar, ou sem
   * suporte a movimento cru) é tratada aqui e devolvida como `false`, para a tela de pausa pedir outro clique.
   */
  async requestLock(): Promise<boolean> {
    if (this.testMode) return true;
    try {
      await this.target.requestPointerLock({ unadjustedMovement: true });
      return true;
    } catch {
      try {
        await this.target.requestPointerLock();
        return true;
      } catch (err) {
        console.info('Trava do mouse recusada pelo navegador; aguardando novo clique.', err);
        return false;
      }
    }
  }

  releaseLock(): void {
    if (this.locked) document.exitPointerLock();
  }

  private releaseAll(): void {
    this.held.clear();
    this.buttons = 0;
  }

  isDown(code: string): boolean {
    return this.held.has(code);
  }

  pressed(code: string): boolean {
    return this.edges.has(code);
  }

  get mouseLeft(): boolean {
    return (this.buttons & 1) !== 0;
  }

  get clicked(): boolean {
    return this.clickEdge;
  }

  get look(): { dx: number; dy: number } {
    return { dx: this.mouseDX, dy: this.mouseDY };
  }

  get wheelSteps(): number {
    return this.wheel;
  }

  /** Fim do quadro: bordas e deltas valem um quadro só. */
  endFrame(): void {
    this.edges.clear();
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.wheel = 0;
    this.clickEdge = false;
  }

  /** Usado pelo gancho de teste para simular teclas. */
  simulateKey(code: string, down: boolean): void {
    if (down) {
      this.edges.add(code);
      this.held.add(code);
    } else this.held.delete(code);
  }

  simulateMouse(down: boolean): void {
    this.buttons = down ? this.buttons | 1 : this.buttons & ~1;
  }
}
