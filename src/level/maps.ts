/** Pincel para montar os mapas de setor em texto sem errar o alinhamento das colunas. */
export class MapCanvas {
  private readonly cells: string[][];

  constructor(readonly width: number, readonly height: number, fill = '#') {
    this.cells = Array.from({ length: height }, () => Array.from({ length: width }, () => fill));
  }

  rect(x0: number, y0: number, x1: number, y1: number, ch = '.'): this {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) this.set(x, y, ch);
    return this;
  }

  set(x: number, y: number, ch: string): this {
    const row = this.cells[y];
    if (!row || x < 0 || x >= this.width) throw new Error(`ponto fora do mapa: ${x},${y}`);
    row[x] = ch;
    return this;
  }

  /** Vários pontos com o mesmo caractere. */
  put(ch: string, ...points: readonly (readonly [number, number])[]): this {
    for (const [x, y] of points) this.set(x, y, ch);
    return this;
  }

  lines(): string[] {
    return this.cells.map((r) => r.join(''));
  }
}
