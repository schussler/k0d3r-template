import * as THREE from 'three';
import { createRng } from '../logic/math';
import { planetTexture } from './textures';

export const SUN_DIR = new THREE.Vector3(-0.6, 0.35, -0.7).normalize();

/** Campo de estrelas numa casca distante; não sofre neblina. */
export function createStars(radius = 3000, count = 2400): THREE.Points {
  const rng = createRng(99);
  const pos = new Float32Array(count * 3);
  const col = new Float32Array(count * 3);
  for (let n = 0; n < count; n++) {
    const u = rng() * 2 - 1;
    const a = rng() * Math.PI * 2;
    const r = Math.sqrt(1 - u * u);
    pos.set([Math.cos(a) * r * radius, u * radius, Math.sin(a) * r * radius], n * 3);
    const tint = 0.7 + rng() * 0.3;
    const warm = rng();
    col.set([tint, tint * (0.9 + warm * 0.1), tint * (1.05 - warm * 0.2)], n * 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const m = new THREE.PointsMaterial({ size: 2.2, sizeAttenuation: false, vertexColors: true, fog: false, depthWrite: false });
  const stars = new THREE.Points(g, m);
  stars.frustumCulled = false;
  stars.renderOrder = -10;
  return stars;
}

const PLANET_VERT = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vView;
  void main() {
    vUv = uv;
    vNormal = normalize(mat3(modelMatrix) * normal);
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vView = normalize(cameraPosition - wp.xyz);
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

const PLANET_FRAG = /* glsl */ `
  uniform sampler2D map;
  uniform vec3 sunDir;
  uniform float time;
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vView;
  void main() {
    vec2 uv = vUv + vec2(time * 0.002, 0.0);
    vec3 albedo = texture2D(map, uv).rgb;
    float lambert = max(dot(vNormal, sunDir), 0.0);
    float rim = pow(1.0 - max(dot(vNormal, vView), 0.0), 3.0);
    vec3 night = albedo * 0.03 + vec3(0.02, 0.05, 0.09);
    vec3 color = mix(night, albedo * (0.25 + lambert * 1.1), smoothstep(-0.05, 0.25, lambert));
    color += vec3(0.45, 0.75, 1.0) * rim * (0.25 + lambert);
    gl_FragColor = vec4(color, 1.0);
    #include <colorspace_fragment>
  }
`;

const ATMO_FRAG = /* glsl */ `
  uniform vec3 sunDir;
  varying vec3 vNormal;
  varying vec3 vView;
  void main() {
    float rim = pow(1.0 - abs(dot(vNormal, vView)), 2.5);
    float lit = 0.25 + max(dot(vNormal, sunDir), 0.0);
    gl_FragColor = vec4(vec3(0.45, 0.78, 1.0) * rim * lit, rim * lit);
  }
`;

export interface Planet {
  readonly group: THREE.Group;
  update(time: number): void;
}

/** Planeta gelado com atmosfera em fresnel; não usa luzes da cena (iluminação própria pelo SUN_DIR). */
export function createPlanet(radius: number): Planet {
  const uniforms = { map: { value: planetTexture() }, sunDir: { value: SUN_DIR.clone() }, time: { value: 0 } };
  const surface = new THREE.Mesh(
    new THREE.SphereGeometry(radius, 96, 48),
    new THREE.ShaderMaterial({ uniforms, vertexShader: PLANET_VERT, fragmentShader: PLANET_FRAG, fog: false }),
  );
  const atmo = new THREE.Mesh(
    new THREE.SphereGeometry(radius * 1.06, 64, 32),
    new THREE.ShaderMaterial({
      uniforms: { sunDir: uniforms.sunDir },
      vertexShader: PLANET_VERT,
      fragmentShader: ATMO_FRAG,
      transparent: true,
      blending: THREE.AdditiveBlending,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
    }),
  );
  const group = new THREE.Group();
  group.add(surface, atmo);
  surface.rotation.z = 0.35;
  return {
    group,
    update(time: number) {
      uniforms.time.value = time;
      surface.rotation.y = time * 0.004;
    },
  };
}
