import * as THREE from 'three';
import { planetTexture, rng } from './textures';

/** Fundo espacial: estrelas, o planeta gelado com atmosfera e o sol. Usado no título, no hangar e na estufa. */
export interface Backdrop {
  readonly group: THREE.Group;
  update(dt: number): void;
}

const ATMOSPHERE_VERT = /* glsl */ `
varying vec3 vNormal;
varying vec3 vView;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vNormal = normalize(normalMatrix * normal);
  vView = normalize(-mv.xyz);
  gl_Position = projectionMatrix * mv;
}`;

const ATMOSPHERE_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uPower;
varying vec3 vNormal;
varying vec3 vView;
void main() {
  float rim = pow(1.0 - max(dot(vNormal, vView), 0.0), uPower);
  gl_FragColor = vec4(uColor * rim * 1.6, rim);
}`;

// O planeta tem iluminação própria (sol fixo): as luzes do interior do setor não podem alcançá-lo.
const PLANET_VERT = /* glsl */ `
varying vec2 vUv;
varying vec3 vWorldNormal;
void main() {
  vUv = uv;
  vWorldNormal = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const PLANET_FRAG = /* glsl */ `
uniform sampler2D uMap;
uniform vec3 uSun;
varying vec2 vUv;
varying vec3 vWorldNormal;
void main() {
  vec3 albedo = texture2D(uMap, vUv).rgb;
  float d = dot(normalize(vWorldNormal), normalize(uSun));
  float light = smoothstep(-0.15, 0.6, d);
  vec3 night = albedo * vec3(0.02, 0.04, 0.08);
  gl_FragColor = vec4(mix(night, albedo * 1.15, light), 1.0);
  #include <colorspace_fragment>
}`;

export function createBackdrop(radius = 260, planetSize = 70): Backdrop {
  const group = new THREE.Group();
  group.name = 'backdrop';
  const r = rng(7);
  const count = 2600;
  const pos = new Float32Array(count * 3);
  const col = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const u = r() * 2 - 1;
    const th = r() * Math.PI * 2;
    const s = Math.sqrt(1 - u * u);
    pos[i * 3] = s * Math.cos(th) * radius;
    pos[i * 3 + 1] = u * radius;
    pos[i * 3 + 2] = s * Math.sin(th) * radius;
    const warm = r();
    const b = 0.4 + r() * 0.6;
    col[i * 3] = b * (warm > 0.8 ? 1 : 0.8);
    col[i * 3 + 1] = b * 0.88;
    col[i * 3 + 2] = b * (warm < 0.3 ? 1 : 0.95);
  }
  const sg = new THREE.BufferGeometry();
  sg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  sg.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const stars = new THREE.Points(sg, new THREE.PointsMaterial({ size: 1.6, sizeAttenuation: false, vertexColors: true, fog: false, depthWrite: false }));
  stars.frustumCulled = false;
  group.add(stars);

  const sunDir = new THREE.Vector3(1, 0.35, 0.25).normalize();
  const planetMat = new THREE.ShaderMaterial({
    vertexShader: PLANET_VERT,
    fragmentShader: PLANET_FRAG,
    uniforms: { uMap: { value: planetTexture(11) }, uSun: { value: sunDir } },
    fog: false,
  });
  const planet = new THREE.Mesh(new THREE.SphereGeometry(planetSize, 64, 48), planetMat);
  planet.position.set(-radius * 0.35, -radius * 0.22, -radius * 0.55);
  planet.rotation.z = 0.35;
  group.add(planet);
  const atmo = new THREE.Mesh(
    new THREE.SphereGeometry(planetSize * 1.08, 48, 32),
    new THREE.ShaderMaterial({
      vertexShader: ATMOSPHERE_VERT,
      fragmentShader: ATMOSPHERE_FRAG,
      uniforms: { uColor: { value: new THREE.Color(0x7fd0ff) }, uPower: { value: 2.6 } },
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.FrontSide,
      fog: false,
    }),
  );
  atmo.position.copy(planet.position);
  group.add(atmo);


  return {
    group,
    update(dt: number) {
      planet.rotation.y += dt * 0.01;
    },
  };
}
