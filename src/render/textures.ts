import * as THREE from 'three';

/** Texturas pintadas em canvas no carregamento: nenhuma imagem de fora (restrição do pedido). */
export function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function canvas(size: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D indisponível para gerar texturas');
  return [c, ctx];
}

function grime(ctx: CanvasRenderingContext2D, size: number, r: () => number, amount: number, dark = true): void {
  for (let i = 0; i < size * amount; i++) {
    const a = r() * 0.07;
    ctx.fillStyle = dark ? `rgba(0,0,0,${a})` : `rgba(255,255,255,${a * 0.6})`;
    const w = 1 + r() * 18;
    ctx.fillRect(r() * size, r() * size, w, 1 + r() * 3);
  }
}

function toTexture(c: HTMLCanvasElement, repeatX = 1, repeatY = 1, color = true): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeatX, repeatY);
  t.anisotropy = 8;
  if (color) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export interface PanelSet {
  map: THREE.CanvasTexture;
  bump: THREE.CanvasTexture;
  emissive: THREE.CanvasTexture;
}

/** Painel de parede: placas com junta, rebites, sujeira e uma faixa de luz embutida. */
export function panelTextures(base: string, seam: string, glow: string, seed: number): PanelSet {
  const S = 512;
  const r = rng(seed);
  const [c, ctx] = canvas(S);
  const [b, bctx] = canvas(S);
  const [e, ectx] = canvas(S);
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, S, S);
  bctx.fillStyle = '#808080';
  bctx.fillRect(0, 0, S, S);
  ectx.fillStyle = '#000';
  ectx.fillRect(0, 0, S, S);
  const rows = [0, 150, 330, 420, S];
  for (let i = 0; i < rows.length - 1; i++) {
    const y0 = rows[i] ?? 0;
    const y1 = rows[i + 1] ?? S;
    const cols = i === 2 ? 1 : 2;
    for (let j = 0; j < cols; j++) {
      const x0 = (j * S) / cols;
      const shade = Math.floor(r() * 18) - 9;
      ctx.fillStyle = `rgba(${shade > 0 ? 255 : 0},${shade > 0 ? 255 : 0},${shade > 0 ? 255 : 0},${Math.abs(shade) / 160})`;
      ctx.fillRect(x0 + 4, y0 + 4, S / cols - 8, y1 - y0 - 8);
      ctx.strokeStyle = seam;
      ctx.lineWidth = 4;
      ctx.strokeRect(x0 + 2, y0 + 2, S / cols - 4, y1 - y0 - 4);
      bctx.strokeStyle = '#202020';
      bctx.lineWidth = 6;
      bctx.strokeRect(x0 + 2, y0 + 2, S / cols - 4, y1 - y0 - 4);
      for (const [rx, ry] of [[x0 + 14, y0 + 14], [x0 + S / cols - 14, y0 + 14], [x0 + 14, y1 - 14], [x0 + S / cols - 14, y1 - 14]]) {
        ctx.fillStyle = 'rgba(0,0,0,0.45)';
        ctx.beginPath();
        ctx.arc(rx ?? 0, ry ?? 0, 4, 0, Math.PI * 2);
        ctx.fill();
        bctx.fillStyle = '#d0d0d0';
        bctx.beginPath();
        bctx.arc(rx ?? 0, ry ?? 0, 4, 0, Math.PI * 2);
        bctx.fill();
      }
    }
  }
  // Faixa de luz na altura dos olhos e grade de ventilação embaixo.
  ctx.fillStyle = '#111';
  ctx.fillRect(0, 336, S, 18);
  ectx.fillStyle = glow;
  ectx.fillRect(0, 340, S, 10);
  ctx.fillStyle = glow;
  ctx.fillRect(0, 340, S, 10);
  for (let x = 30; x < S - 30; x += 16) {
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(x, 440, 8, 50);
    bctx.fillStyle = '#101010';
    bctx.fillRect(x, 440, 8, 50);
  }
  grime(ctx, S, r, 3);
  return { map: toTexture(c), bump: toTexture(b, 1, 1, false), emissive: toTexture(e) };
}

/** Piso de grade metálica com faixas de perigo opcionais. */
export function floorTextures(base: string, line: string, seed: number, hazard: boolean): PanelSet {
  const S = 512;
  const r = rng(seed);
  const [c, ctx] = canvas(S);
  const [b, bctx] = canvas(S);
  const [e, ectx] = canvas(S);
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, S, S);
  bctx.fillStyle = '#909090';
  bctx.fillRect(0, 0, S, S);
  ectx.fillStyle = '#000';
  ectx.fillRect(0, 0, S, S);
  const tile = S / 2;
  for (let y = 0; y < 2; y++) {
    for (let x = 0; x < 2; x++) {
      ctx.strokeStyle = line;
      ctx.lineWidth = 6;
      ctx.strokeRect(x * tile + 3, y * tile + 3, tile - 6, tile - 6);
      bctx.strokeStyle = '#303030';
      bctx.lineWidth = 8;
      bctx.strokeRect(x * tile + 3, y * tile + 3, tile - 6, tile - 6);
      // Chapa xadrez antiderrapante.
      for (let i = 0; i < 90; i++) {
        const px = x * tile + 18 + r() * (tile - 36);
        const py = y * tile + 18 + r() * (tile - 36);
        bctx.fillStyle = '#b8b8b8';
        bctx.save();
        bctx.translate(px, py);
        bctx.rotate(r() > 0.5 ? 0.8 : -0.8);
        bctx.fillRect(-6, -1.5, 12, 3);
        bctx.restore();
      }
    }
  }
  if (hazard) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, S - 40, S, 40);
    ctx.clip();
    for (let x = -40; x < S + 40; x += 40) {
      ctx.fillStyle = '#d9a400';
      ctx.beginPath();
      ctx.moveTo(x, S);
      ctx.lineTo(x + 20, S);
      ctx.lineTo(x + 60, S - 40);
      ctx.lineTo(x + 40, S - 40);
      ctx.fill();
    }
    ctx.restore();
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(0, S - 40, S, 40);
  }
  grime(ctx, S, r, 5);
  return { map: toTexture(c), bump: toTexture(b, 1, 1, false), emissive: toTexture(e) };
}

/** Caixa de carga com reforço, estêncil e listras. */
export function crateTexture(base: string, stripe: string, seed: number): THREE.CanvasTexture {
  const S = 256;
  const r = rng(seed);
  const [c, ctx] = canvas(S);
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, S, S);
  ctx.strokeStyle = 'rgba(0,0,0,0.6)';
  ctx.lineWidth = 14;
  ctx.strokeRect(7, 7, S - 14, S - 14);
  ctx.fillStyle = 'rgba(255,255,255,0.08)';
  ctx.fillRect(14, 14, S - 28, 6);
  ctx.fillStyle = stripe;
  ctx.fillRect(14, S / 2 - 18, S - 28, 12);
  ctx.fillRect(14, S / 2 + 6, S - 28, 12);
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  ctx.font = 'bold 28px monospace';
  ctx.fillText(`K-${Math.floor(r() * 900 + 100)}`, 26, 60);
  grime(ctx, S, r, 4);
  return toTexture(c);
}

/** Sprite radial para clarão, faísca e brilho. */
export function glowTexture(inner: string, outer: string): THREE.CanvasTexture {
  const S = 128;
  const [c, ctx] = canvas(S);
  const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  g.addColorStop(0, inner);
  g.addColorStop(0.25, outer);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Estrela de clarão do cano: raios finos sobre um núcleo quente. */
export function flashTexture(): THREE.CanvasTexture {
  const S = 256;
  const [c, ctx] = canvas(S);
  ctx.translate(S / 2, S / 2);
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, S / 2);
  g.addColorStop(0, 'rgba(255,255,240,1)');
  g.addColorStop(0.15, 'rgba(255,220,140,0.95)');
  g.addColorStop(0.45, 'rgba(255,140,40,0.35)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  for (let i = 0; i < 7; i++) {
    ctx.rotate((Math.PI * 2) / 7 + 0.2);
    ctx.beginPath();
    ctx.moveTo(-8, 0);
    ctx.lineTo(0, -S / 2);
    ctx.lineTo(8, 0);
    ctx.fill();
  }
  ctx.beginPath();
  ctx.arc(0, 0, S / 5, 0, Math.PI * 2);
  ctx.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Furo de bala com borda queimada; alfa no próprio canvas. */
export function decalTexture(): THREE.CanvasTexture {
  const S = 64;
  const [c, ctx] = canvas(S);
  const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  g.addColorStop(0, 'rgba(5,5,5,1)');
  g.addColorStop(0.22, 'rgba(15,12,10,0.95)');
  g.addColorStop(0.4, 'rgba(40,30,20,0.6)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Superfície do planeta gelado: faixas de gelo, rachaduras e manchas de nuvem. */
export function planetTexture(seed: number): THREE.CanvasTexture {
  const W = 1024;
  const H = 512;
  const r = rng(seed);
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D indisponível para gerar texturas');
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#f2fbff');
  g.addColorStop(0.18, '#b9dcf0');
  g.addColorStop(0.5, '#6fa5c8');
  g.addColorStop(0.82, '#b9dcf0');
  g.addColorStop(1, '#f6fdff');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  for (let i = 0; i < 260; i++) {
    const y = r() * H;
    ctx.fillStyle = `rgba(${r() > 0.5 ? '255,255,255' : '40,80,120'},${r() * 0.12})`;
    ctx.fillRect(0, y, W, 2 + r() * 14);
  }
  ctx.strokeStyle = 'rgba(20,50,80,0.35)';
  for (let i = 0; i < 90; i++) {
    ctx.lineWidth = 0.5 + r() * 1.5;
    ctx.beginPath();
    let x = r() * W;
    let y = H * 0.25 + r() * H * 0.5;
    ctx.moveTo(x, y);
    for (let k = 0; k < 8; k++) {
      x += (r() - 0.5) * 60;
      y += (r() - 0.5) * 24;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  for (let i = 0; i < 70; i++) {
    const x = r() * W;
    const y = r() * H;
    const rad = 20 + r() * 90;
    const cg = ctx.createRadialGradient(x, y, 0, x, y, rad);
    cg.addColorStop(0, 'rgba(255,255,255,0.35)');
    cg.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = cg;
    ctx.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  return t;
}

/** Folha de planta com nervura, usada em cartões cruzados. */
export function leafTexture(seed: number): THREE.CanvasTexture {
  const S = 256;
  const r = rng(seed);
  const [c, ctx] = canvas(S);
  ctx.clearRect(0, 0, S, S);
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI - Math.PI / 2 + (r() - 0.5) * 0.3;
    ctx.save();
    ctx.translate(S / 2, S);
    ctx.rotate(a * 0.9);
    const len = S * (0.55 + r() * 0.4);
    const w = 16 + r() * 18;
    const g = ctx.createLinearGradient(0, 0, 0, -len);
    g.addColorStop(0, '#1d4a22');
    g.addColorStop(1, r() > 0.5 ? '#5fae4c' : '#3f8f5a');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(w, -len * 0.5, 0, -len);
    ctx.quadraticCurveTo(-w, -len * 0.5, 0, 0);
    ctx.fill();
    ctx.strokeStyle = 'rgba(200,255,180,0.35)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(0, -len * 0.95);
    ctx.stroke();
    ctx.restore();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
