import * as THREE from 'three';
import { createPlanet, createStars, SUN_DIR, type Planet } from '../world/sky';
import { glowTexture, panelTexture } from '../world/textures';

/** Painel solar com grade azul (canvas), emissivo para brilhar no bloom. */
function solarTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 64;
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('canvas 2D indisponível para o painel solar');
  ctx.fillStyle = '#0b1f3a';
  ctx.fillRect(0, 0, 128, 64);
  ctx.strokeStyle = '#3d7fd6';
  ctx.lineWidth = 2;
  for (let x = 0; x <= 128; x += 16) ctx.strokeRect(x, 0, 16, 64);
  ctx.beginPath();
  ctx.moveTo(0, 32);
  ctx.lineTo(128, 32);
  ctx.stroke();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** A estação: anel habitado, raios, eixo central, painéis solares e luzes de navegação piscando. */
function buildStation(): { group: THREE.Group; blinkers: THREE.Sprite[]; ring: THREE.Group } {
  const group = new THREE.Group();
  const hull = new THREE.MeshStandardMaterial({ map: panelTexture('station', { base: '#a8b2bd', seam: '#56606b', light: '#e6edf3' }), roughness: 0.45, metalness: 0.65 });
  const darkHull = new THREE.MeshStandardMaterial({ color: 0x3a424c, roughness: 0.5, metalness: 0.8 });
  const windowMat = new THREE.MeshBasicMaterial({ color: 0xffd9a0 });
  const solar = new THREE.MeshStandardMaterial({ map: solarTexture(), emissive: 0x0d2b55, roughness: 0.3, metalness: 0.6, side: THREE.DoubleSide });

  const ring = new THREE.Group();
  ring.add(new THREE.Mesh(new THREE.TorusGeometry(14, 1.6, 20, 96), hull));
  const windows = new THREE.InstancedMesh(new THREE.BoxGeometry(0.5, 0.35, 0.1), windowMat, 96);
  const m = new THREE.Matrix4();
  for (let n = 0; n < 96; n++) {
    const a = (n / 96) * Math.PI * 2;
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), a);
    m.compose(new THREE.Vector3(Math.cos(a) * 15.62, Math.sin(a) * 15.62, n % 3 === 0 ? 0.6 : -0.6), q, new THREE.Vector3(1, 1, 1));
    windows.setMatrixAt(n, m);
  }
  ring.add(windows);
  for (let n = 0; n < 6; n++) {
    const spoke = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 12.4, 10), darkHull);
    spoke.rotation.z = (n / 6) * Math.PI * 2;
    spoke.position.set(Math.cos((n / 6) * Math.PI * 2 + Math.PI / 2) * 7.6, Math.sin((n / 6) * Math.PI * 2 + Math.PI / 2) * 7.6, 0);
    ring.add(spoke);
  }
  group.add(ring);

  const hub = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 2.6, 9, 24), hull);
  hub.rotation.x = Math.PI / 2;
  group.add(hub);
  for (const z of [-6.5, 6.5]) {
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(1.8, 2.6, 4, 24), darkHull);
    cap.rotation.x = z < 0 ? -Math.PI / 2 : Math.PI / 2;
    cap.position.z = z;
    group.add(cap);
  }
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 36, 8), darkHull);
  mast.rotation.x = Math.PI / 2;
  group.add(mast);
  for (const z of [-15, -11, 11, 15]) {
    for (const side of [-1, 1]) {
      const panel = new THREE.Mesh(new THREE.BoxGeometry(14, 0.12, 3.4), solar);
      panel.position.set(side * 8, 0, z);
      group.add(panel);
    }
  }
  const blinkers: THREE.Sprite[] = [];
  for (const [x, y, z, color] of [
    [15, 0, 0, 0xff3030],
    [-15, 0, 0, 0x30ff60],
    [0, 0, 18, 0xffffff],
    [0, 0, -18, 0xffffff],
  ] as const) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    s.position.set(x, y, z);
    s.scale.setScalar(2.5);
    group.add(s);
    blinkers.push(s);
  }
  return { group, blinkers, ring };
}

/** Cena da tela de título: a estação girando sobre o planeta gelado, câmera em deriva lenta. */
export class TitleScene {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.5, 6000);
  private readonly station: ReturnType<typeof buildStation>;
  private readonly planet: Planet;

  constructor() {
    this.scene.background = new THREE.Color(0x01030a);
    this.scene.add(createStars());
    this.planet = createPlanet(320);
    this.planet.group.position.set(-60, -330, -260);
    this.scene.add(this.planet.group);
    this.station = buildStation();
    this.station.group.rotation.set(0.5, 0.3, 0.15);
    this.scene.add(this.station.group);
    const sun = new THREE.DirectionalLight(0xfff2e0, 3.2);
    sun.position.copy(SUN_DIR).multiplyScalar(100);
    this.scene.add(sun, new THREE.HemisphereLight(0x6a8cff, 0x0b1020, 0.5));
    const sunGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: 0xfff0d0, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    sunGlow.position.copy(SUN_DIR).multiplyScalar(2500);
    sunGlow.scale.setScalar(500);
    this.scene.add(sunGlow);
  }

  update(time: number): void {
    this.station.ring.rotation.z = time * 0.12;
    this.station.group.rotation.y = 0.3 + time * 0.05;
    this.station.blinkers.forEach((b, n) => (b.visible = Math.sin(time * 3 + n * 1.7) > 0.3));
    this.planet.update(time);
    const a = time * 0.03;
    this.camera.position.set(Math.sin(a) * 18 + 30, 9 + Math.sin(time * 0.2) * 2, Math.cos(a) * 12 + 46);
    this.camera.lookAt(0, -2, 0);
  }
}
