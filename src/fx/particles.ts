import * as THREE from 'three';

/**
 * Partículas em pool: um único `Points` por sistema (uma chamada de desenho), sem alocar no disparo. Faíscas usam
 * mistura aditiva; fumaça e poeira, normal.
 */
const VERT = /* glsl */ `
attribute float aSize;
attribute float aAlpha;
attribute vec3 aColor;
varying float vAlpha;
varying vec3 vColor;
uniform float uScale;
void main() {
  vAlpha = aAlpha;
  vColor = aColor;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = aSize * uScale / max(0.1, -mv.z);
  gl_Position = projectionMatrix * mv;
}`;

const FRAG = /* glsl */ `
varying float vAlpha;
varying vec3 vColor;
uniform float uSoft;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float d = length(c) * 2.0;
  float a = smoothstep(1.0, uSoft, d) * vAlpha;
  if (a < 0.01) discard;
  gl_FragColor = vec4(vColor, a);
}`;

export interface EmitOpts {
  count: number;
  x: number;
  y: number;
  z: number;
  /** Direção preferida (normal da superfície). */
  nx: number;
  ny: number;
  nz: number;
  speed: number;
  spread: number;
  color: THREE.Color;
  size: number;
  life: number;
  gravity: number;
  drag: number;
  grow?: number;
}

export class ParticleSystem {
  readonly points: THREE.Points;
  private readonly pos: Float32Array;
  private readonly vel: Float32Array;
  private readonly col: Float32Array;
  private readonly size: Float32Array;
  private readonly baseSize: Float32Array;
  private readonly alpha: Float32Array;
  private readonly life: Float32Array;
  private readonly maxLife: Float32Array;
  private readonly gravity: Float32Array;
  private readonly drag: Float32Array;
  private readonly grow: Float32Array;
  private next = 0;
  private readonly geo: THREE.BufferGeometry;

  constructor(private readonly max: number, additive: boolean, soft: number) {
    this.pos = new Float32Array(max * 3);
    this.vel = new Float32Array(max * 3);
    this.col = new Float32Array(max * 3);
    this.size = new Float32Array(max);
    this.baseSize = new Float32Array(max);
    this.alpha = new Float32Array(max);
    this.life = new Float32Array(max);
    this.maxLife = new Float32Array(max);
    this.gravity = new Float32Array(max);
    this.drag = new Float32Array(max);
    this.grow = new Float32Array(max);
    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('aColor', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    const mat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: { uScale: { value: 600 }, uSoft: { value: soft } },
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(this.geo, mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = additive ? 5 : 4;
  }

  setScale(viewportHeight: number): void {
    const u = (this.points.material as THREE.ShaderMaterial).uniforms.uScale;
    if (u) u.value = viewportHeight * 0.9;
  }

  emit(o: EmitOpts): void {
    for (let n = 0; n < o.count; n++) {
      const i = this.next;
      this.next = (this.next + 1) % this.max;
      // Direção: normal + ruído esférico, para formar um cone de faíscas.
      let dx = o.nx + (Math.random() * 2 - 1) * o.spread;
      let dy = o.ny + (Math.random() * 2 - 1) * o.spread;
      let dz = o.nz + (Math.random() * 2 - 1) * o.spread;
      const l = Math.hypot(dx, dy, dz) || 1;
      const s = o.speed * (0.4 + Math.random() * 0.8);
      dx = (dx / l) * s;
      dy = (dy / l) * s;
      dz = (dz / l) * s;
      this.pos[i * 3] = o.x;
      this.pos[i * 3 + 1] = o.y;
      this.pos[i * 3 + 2] = o.z;
      this.vel[i * 3] = dx;
      this.vel[i * 3 + 1] = dy;
      this.vel[i * 3 + 2] = dz;
      this.col[i * 3] = o.color.r;
      this.col[i * 3 + 1] = o.color.g;
      this.col[i * 3 + 2] = o.color.b;
      this.baseSize[i] = o.size * (0.6 + Math.random() * 0.8);
      this.size[i] = this.baseSize[i] ?? 0;
      this.alpha[i] = 1;
      this.life[i] = 0;
      this.maxLife[i] = o.life * (0.6 + Math.random() * 0.8);
      this.gravity[i] = o.gravity;
      this.drag[i] = o.drag;
      this.grow[i] = o.grow ?? 0;
    }
  }

  update(dt: number, floorY: number): void {
    for (let i = 0; i < this.max; i++) {
      const ml = this.maxLife[i] ?? 0;
      if (ml <= 0) continue;
      const life = (this.life[i] ?? 0) + dt;
      this.life[i] = life;
      if (life >= ml) {
        this.maxLife[i] = 0;
        this.alpha[i] = 0;
        this.size[i] = 0;
        continue;
      }
      const drag = Math.max(0, 1 - (this.drag[i] ?? 0) * dt);
      let vx = (this.vel[i * 3] ?? 0) * drag;
      let vy = (this.vel[i * 3 + 1] ?? 0) * drag - (this.gravity[i] ?? 0) * dt;
      let vz = (this.vel[i * 3 + 2] ?? 0) * drag;
      let y = (this.pos[i * 3 + 1] ?? 0) + vy * dt;
      if (y < floorY && vy < 0) {
        y = floorY;
        vy = -vy * 0.35;
        vx *= 0.6;
        vz *= 0.6;
      }
      this.vel[i * 3] = vx;
      this.vel[i * 3 + 1] = vy;
      this.vel[i * 3 + 2] = vz;
      this.pos[i * 3] = (this.pos[i * 3] ?? 0) + vx * dt;
      this.pos[i * 3 + 1] = y;
      this.pos[i * 3 + 2] = (this.pos[i * 3 + 2] ?? 0) + vz * dt;
      const t = life / ml;
      this.alpha[i] = 1 - t * t;
      this.size[i] = (this.baseSize[i] ?? 0) * (1 + (this.grow[i] ?? 0) * t);
    }
    for (const name of ['position', 'aColor', 'aSize', 'aAlpha']) {
      const attr = this.geo.getAttribute(name);
      attr.needsUpdate = true;
    }
  }

  clear(): void {
    this.maxLife.fill(0);
    this.alpha.fill(0);
    this.size.fill(0);
  }
}
