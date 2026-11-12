import * as THREE from 'three';
import { rng } from './textures';

/**
 * A Estação Kepler vista de fora, para a tela de título: cubo central com módulos, anel habitado que gira, painéis
 * solares e luzes de posição piscando. Tudo de primitivas e texturas pintadas no carregamento.
 */
export interface Station {
  readonly group: THREE.Group;
  update(dt: number, time: number): void;
}

function windowTexture(seed: number): THREE.CanvasTexture {
  const W = 512;
  const H = 64;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D indisponível para gerar texturas');
  const r = rng(seed);
  ctx.fillStyle = '#10141b';
  ctx.fillRect(0, 0, W, H);
  for (let x = 6; x < W - 10; x += 14) {
    const lit = r() > 0.25;
    ctx.fillStyle = lit ? (r() > 0.85 ? '#ffb347' : '#bfe9ff') : '#1a2029';
    ctx.fillRect(x, 18, 8, 28);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  return t;
}

function panelTexture(): THREE.CanvasTexture {
  const S = 256;
  const c = document.createElement('canvas');
  c.width = S;
  c.height = S;
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D indisponível para gerar texturas');
  ctx.fillStyle = '#0d2244';
  ctx.fillRect(0, 0, S, S);
  ctx.strokeStyle = '#4f8fd6';
  ctx.lineWidth = 2;
  for (let i = 0; i <= 8; i++) {
    ctx.beginPath();
    ctx.moveTo((i * S) / 8, 0);
    ctx.lineTo((i * S) / 8, S);
    ctx.moveTo(0, (i * S) / 8);
    ctx.lineTo(S, (i * S) / 8);
    ctx.stroke();
  }
  const g = ctx.createLinearGradient(0, 0, S, S);
  g.addColorStop(0, 'rgba(255,255,255,0.18)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function createStation(): Station {
  const group = new THREE.Group();
  group.name = 'station';
  const hull = new THREE.MeshStandardMaterial({ color: 0x9aa4b0, metalness: 0.85, roughness: 0.38 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x2b323c, metalness: 0.8, roughness: 0.45 });
  const winTex = windowTexture(5);
  winTex.repeat.set(6, 1);
  const windows = new THREE.MeshStandardMaterial({ color: 0xffffff, map: winTex, emissive: 0xffffff, emissiveMap: winTex, emissiveIntensity: 1.6, metalness: 0.3, roughness: 0.5 });

  // Eixo central.
  const spine = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 2.4, 34, 24), hull);
  group.add(spine);
  for (const y of [-12, -6, 0, 6, 12]) {
    const band = new THREE.Mesh(new THREE.CylinderGeometry(2.9, 2.9, 0.7, 24), dark);
    band.position.y = y;
    group.add(band);
  }
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(5, 5, 7, 28), hull);
  group.add(hub);
  const hubWin = new THREE.Mesh(new THREE.CylinderGeometry(5.05, 5.05, 2, 28, 1, true), windows);
  group.add(hubWin);

  // Anel habitado: gira em torno do eixo, preso ao eixo por quatro raios.
  const ring = new THREE.Group();
  const ringBody = new THREE.Mesh(new THREE.TorusGeometry(15, 1.9, 12, 72), hull);
  ringBody.rotation.x = Math.PI / 2;
  ring.add(ringBody);
  const ringWin = new THREE.Mesh(new THREE.CylinderGeometry(16.5, 16.5, 1.3, 72, 1, true), windows);
  ringWin.material = windows;
  ring.add(ringWin);
  const inner = new THREE.Mesh(new THREE.CylinderGeometry(13.15, 13.15, 1.3, 72, 1, true), windows);
  inner.material = new THREE.MeshStandardMaterial({ color: 0xffffff, map: winTex, emissive: 0xffffff, emissiveMap: winTex, emissiveIntensity: 1.2, side: THREE.BackSide });
  ring.add(inner);
  for (let i = 0; i < 4; i++) {
    const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.9, 10.5), dark);
    const a = (i * Math.PI) / 2;
    spoke.position.set(Math.cos(a) * 8.6, 0, Math.sin(a) * 8.6);
    spoke.rotation.y = -a + Math.PI / 2;
    ring.add(spoke);
  }
  for (let i = 0; i < 12; i++) {
    const a = (i * Math.PI * 2) / 12;
    const pod = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.4, 2.2), dark);
    pod.position.set(Math.cos(a) * 15, 0, Math.sin(a) * 15);
    pod.rotation.y = -a;
    ring.add(pod);
  }
  group.add(ring);

  // Painéis solares e antenas.
  const panelMat = new THREE.MeshStandardMaterial({ map: panelTexture(), metalness: 0.6, roughness: 0.3, emissive: 0x0a1c3a, emissiveIntensity: 0.6, side: THREE.DoubleSide });
  for (const side of [-1, 1]) {
    const arm = new THREE.Mesh(new THREE.BoxGeometry(14, 0.35, 0.35), dark);
    arm.position.set(side * 8, 15, 0);
    group.add(arm);
    for (const k of [0, 1]) {
      const panel = new THREE.Mesh(new THREE.BoxGeometry(6.2, 0.12, 9), panelMat);
      panel.position.set(side * (11 + k * 6.6), 15, 0);
      group.add(panel);
    }
  }
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 12, 8), dark);
  mast.position.y = 23;
  group.add(mast);
  const dish = new THREE.Mesh(new THREE.SphereGeometry(2, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2.6), hull);
  dish.position.set(0, 28, 0);
  dish.rotation.x = Math.PI;
  group.add(dish);

  // Módulo do hangar, com a boca azulada.
  const hangar = new THREE.Mesh(new THREE.BoxGeometry(7, 4, 9), hull);
  hangar.position.set(0, -21, 5);
  group.add(hangar);
  const mouth = new THREE.Mesh(new THREE.PlaneGeometry(5, 2.4), new THREE.MeshBasicMaterial({ color: 0x6fd8ff, toneMapped: false }));
  mouth.position.set(0, -21, 9.55);
  group.add(mouth);

  // Luzes de posição: vermelha e verde nas pontas, piscando fora de fase.
  const beacons: THREE.Mesh[] = [];
  for (const [x, y, z, color] of [[0, 29.5, 0, 0xff3030], [0, -19, -4, 0x30ff70], [24, 15, 0, 0xff3030], [-24, 15, 0, 0x30ff70]] as const) {
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.45, 10, 8), new THREE.MeshBasicMaterial({ color, toneMapped: false }));
    b.position.set(x, y, z);
    beacons.push(b);
    group.add(b);
  }
  group.rotation.z = 0.32;
  group.rotation.x = 0.2;

  return {
    group,
    update(dt: number, time: number) {
      group.rotation.y += dt * 0.12;
      ring.rotation.y -= dt * 0.35;
      // Luzes de posição piscando fora de fase.
      beacons.forEach((b, i) => {
        b.visible = Math.sin(time * 3 + i * 1.7) > 0.2;
      });
    },
  };
}
