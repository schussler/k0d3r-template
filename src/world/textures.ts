import * as THREE from 'three';
import { createRng } from '../logic/math';

/** Texturas procedurais desenhadas em canvas: nada de imagem externa. Cacheadas entre setores. */
const cache = new Map<string, THREE.Texture>();

function canvas(size: number, h = size): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = size;
  c.height = h;
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('canvas 2D indisponível para gerar texturas');
  return [c, ctx];
}

function finish(c: HTMLCanvasElement, color = true, repeat = true): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  if (color) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

function cached<T extends THREE.Texture>(key: string, make: () => T): T {
  const hit = cache.get(key);
  if (hit) return hit as T;
  const t = make();
  cache.set(key, t);
  return t;
}

/** Ruído granulado (sujeira, desgaste) por cima do que já foi desenhado. */
function grime(ctx: CanvasRenderingContext2D, size: number, amount: number, seed: number): void {
  const rng = createRng(seed);
  const img = ctx.getImageData(0, 0, size, size);
  const d = img.data;
  for (let n = 0; n < d.length; n += 4) {
    const v = (rng() - 0.5) * amount;
    d[n] = Math.max(0, Math.min(255, d[n]! + v));
    d[n + 1] = Math.max(0, Math.min(255, d[n + 1]! + v));
    d[n + 2] = Math.max(0, Math.min(255, d[n + 2]! + v));
  }
  ctx.putImageData(img, 0, 0);
  for (let n = 0; n < 14; n++) {
    const x = rng() * size;
    const y = rng() * size;
    const r = 10 + rng() * 50;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(0,0,0,${0.05 + rng() * 0.12})`);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
}

export interface PanelStyle {
  readonly base: string;
  readonly seam: string;
  readonly light: string;
  readonly stripe?: string;
}

/** Painel de parede: chapas com junta, rebites e uma faixa luminosa opcional. */
export function panelTexture(key: string, s: PanelStyle): THREE.Texture {
  return cached(`panel-${key}`, () => {
    const size = 256;
    const [c, ctx] = canvas(size);
    ctx.fillStyle = s.base;
    ctx.fillRect(0, 0, size, size);
    const plates = [
      [4, 4, 120, 160],
      [132, 4, 120, 160],
      [4, 172, 248, 80],
    ] as const;
    for (const [x, y, w, h] of plates) {
      const g = ctx.createLinearGradient(x, y, x, y + h);
      g.addColorStop(0, 'rgba(255,255,255,0.10)');
      g.addColorStop(1, 'rgba(0,0,0,0.12)');
      ctx.fillStyle = g;
      ctx.fillRect(x, y, w, h);
      ctx.strokeStyle = s.seam;
      ctx.lineWidth = 3;
      ctx.strokeRect(x, y, w, h);
      ctx.fillStyle = s.light;
      for (const [rx, ry] of [
        [x + 8, y + 8],
        [x + w - 8, y + 8],
        [x + 8, y + h - 8],
        [x + w - 8, y + h - 8],
      ] as const) {
        ctx.beginPath();
        ctx.arc(rx, ry, 2.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    if (s.stripe) {
      ctx.fillStyle = s.stripe;
      ctx.fillRect(0, 164, size, 6);
    }
    grime(ctx, size, 18, key.length * 97);
    return finish(c);
  });
}

/** Piso de chapa xadrez com grade de drenagem. */
export function floorTexture(key: string, base: string, line: string): THREE.Texture {
  return cached(`floor-${key}`, () => {
    const size = 256;
    const [c, ctx] = canvas(size);
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, size, size);
    ctx.strokeStyle = line;
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, size - 2, size - 2);
    ctx.globalAlpha = 0.35;
    for (let y = 12; y < size; y += 16) {
      for (let x = 12 + ((y / 16) % 2) * 8; x < size; x += 16) {
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(((x + y) % 32) / 16 > 0.5 ? 0.8 : -0.8);
        ctx.fillStyle = 'rgba(255,255,255,0.35)';
        ctx.fillRect(-4, -1, 8, 2);
        ctx.restore();
      }
    }
    ctx.globalAlpha = 1;
    grime(ctx, size, 22, key.length * 131);
    return finish(c);
  });
}

/** Caixa de carga com bordas reforçadas e marcação. */
export function crateTexture(key: string, base: string, edge: string, mark: string): THREE.Texture {
  return cached(`crate-${key}`, () => {
    const size = 256;
    const [c, ctx] = canvas(size);
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = edge;
    ctx.fillRect(0, 0, size, 18);
    ctx.fillRect(0, size - 18, size, 18);
    ctx.fillRect(0, 0, 18, size);
    ctx.fillRect(size - 18, 0, 18, size);
    ctx.strokeStyle = edge;
    ctx.lineWidth = 10;
    ctx.beginPath();
    ctx.moveTo(18, 18);
    ctx.lineTo(size - 18, size - 18);
    ctx.stroke();
    ctx.fillStyle = mark;
    ctx.font = 'bold 34px monospace';
    ctx.fillText('KPL-7', 70, 140);
    for (let n = 0; n < 6; n++) {
      ctx.fillStyle = n % 2 ? '#111' : mark;
      ctx.fillRect(40 + n * 30, 190, 30, 14);
    }
    grime(ctx, size, 26, key.length * 17);
    return finish(c);
  });
}

/** Listras de perigo em diagonal. */
export function hazardTexture(): THREE.Texture {
  return cached('hazard', () => {
    const size = 128;
    const [c, ctx] = canvas(size);
    ctx.fillStyle = '#d9a514';
    ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = '#1a1a1a';
    for (let n = -size; n < size * 2; n += 32) {
      ctx.beginPath();
      ctx.moveTo(n, 0);
      ctx.lineTo(n + 16, 0);
      ctx.lineTo(n + 16 - size, size);
      ctx.lineTo(n - size, size);
      ctx.fill();
    }
    grime(ctx, size, 30, 5);
    return finish(c);
  });
}

/** Tela de terminal com linhas de texto falso, usada como emissivo. */
export function screenTexture(color: string): THREE.Texture {
  return cached(`screen-${color}`, () => {
    const [c, ctx] = canvas(128, 96);
    ctx.fillStyle = '#020806';
    ctx.fillRect(0, 0, 128, 96);
    const rng = createRng(color.length * 7);
    ctx.fillStyle = color;
    for (let y = 8; y < 90; y += 9) {
      let x = 6;
      while (x < 120) {
        const w = 4 + rng() * 18;
        if (rng() > 0.25) ctx.fillRect(x, y, Math.min(w, 122 - x), 4);
        x += w + 4;
      }
    }
    return finish(c, true, false);
  });
}

/** Superfície do planeta gelado: faixas, manchas e rachaduras (equiretangular). */
export function planetTexture(): THREE.Texture {
  return cached('planet', () => {
    const w = 1024;
    const h = 512;
    const [c, ctx] = canvas(w, h);
    const rng = createRng(1234);
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#f4fbff');
    g.addColorStop(0.18, '#cfe6f5');
    g.addColorStop(0.5, '#7fa9c9');
    g.addColorStop(0.82, '#c4dff0');
    g.addColorStop(1, '#f7fcff');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    for (let n = 0; n < 60; n++) {
      const y = rng() * h;
      ctx.fillStyle = `rgba(${rng() > 0.5 ? '255,255,255' : '40,80,120'},${0.05 + rng() * 0.12})`;
      ctx.fillRect(0, y, w, 4 + rng() * 30);
    }
    for (let n = 0; n < 220; n++) {
      const x = rng() * w;
      const y = h * 0.15 + rng() * h * 0.7;
      const r = 6 + rng() * 40;
      const rg = ctx.createRadialGradient(x, y, 0, x, y, r);
      rg.addColorStop(0, `rgba(${rng() > 0.6 ? '20,60,100' : '255,255,255'},${0.15 + rng() * 0.25})`);
      rg.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = rg;
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }
    ctx.strokeStyle = 'rgba(30,70,110,0.45)';
    for (let n = 0; n < 70; n++) {
      let x = rng() * w;
      let y = h * 0.2 + rng() * h * 0.6;
      ctx.lineWidth = 0.5 + rng() * 1.5;
      ctx.beginPath();
      ctx.moveTo(x, y);
      for (let k = 0; k < 12; k++) {
        x += (rng() - 0.5) * 40;
        y += (rng() - 0.5) * 16;
        ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    return finish(c, true, false);
  });
}

/** Folha estilizada com nervura (alfa recortado), para as plantas da estufa. */
export function leafTexture(): THREE.Texture {
  return cached('leaf', () => {
    const [c, ctx] = canvas(128);
    ctx.clearRect(0, 0, 128, 128);
    const g = ctx.createLinearGradient(0, 0, 0, 128);
    g.addColorStop(0, '#9be36b');
    g.addColorStop(1, '#2f7a3a');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(64, 4);
    ctx.quadraticCurveTo(124, 54, 64, 124);
    ctx.quadraticCurveTo(4, 54, 64, 4);
    ctx.fill();
    ctx.strokeStyle = 'rgba(220,255,200,0.6)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(64, 10);
    ctx.lineTo(64, 120);
    ctx.stroke();
    return finish(c, true, false);
  });
}

/** Gradiente radial branco, usado em clarões, faíscas e brilhos. */
export function glowTexture(): THREE.Texture {
  return cached('glow', () => {
    const [c, ctx] = canvas(64);
    const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.25, 'rgba(255,255,255,0.7)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
    return finish(c, true, false);
  });
}

/** Clarão de boca de cano em estrela. */
export function flashTexture(): THREE.Texture {
  return cached('flash', () => {
    const [c, ctx] = canvas(128);
    ctx.translate(64, 64);
    for (let n = 0; n < 7; n++) {
      ctx.rotate((Math.PI * 2) / 7);
      const g = ctx.createLinearGradient(0, 0, 0, -60);
      g.addColorStop(0, 'rgba(255,240,200,1)');
      g.addColorStop(1, 'rgba(255,140,40,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(-7, 0);
      ctx.lineTo(0, -58 + (n % 2) * 18);
      ctx.lineTo(7, 0);
      ctx.fill();
    }
    const core = ctx.createRadialGradient(0, 0, 0, 0, 0, 26);
    core.addColorStop(0, 'rgba(255,255,240,1)');
    core.addColorStop(1, 'rgba(255,180,80,0)');
    ctx.fillStyle = core;
    ctx.fillRect(-30, -30, 60, 60);
    return finish(c, true, false);
  });
}
