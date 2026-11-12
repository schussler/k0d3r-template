import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

const MAX_PIXEL_RATIO = 1.5;
/** Quadros acima deste tempo médio (ms) por alguns segundos derrubam a qualidade um degrau. */
const SLOW_FRAME_MS = 21;
const QUALITY_WINDOW_S = 3;
const MSAA_SAMPLES = 4;

export class WebGLUnavailableError extends Error {}

/**
 * Renderizador com duas cenas: o mundo e a arma em primeira pessoa (desenhada por cima, com o depth
 * limpo, para a arma não entrar na parede), mais bloom e saída com tone mapping.
 */
export class Renderer {
  readonly gl: THREE.WebGLRenderer;
  readonly composer: EffectComposer;
  private readonly worldPass: RenderPass;
  private readonly viewPass: RenderPass;
  private readonly bloom: UnrealBloomPass;
  private quality = 2;
  private slowTime = 0;
  private frameAvg = 16;
  /** Média móvel de FPS, exibida no medidor do `?debug`. */
  fps = 60;

  constructor(canvas: HTMLCanvasElement) {
    // Um só contexto, já com os atributos: pedir de novo com outros atributos devolveria o mesmo, ignorando-os.
    const context = canvas.getContext('webgl2', { antialias: false, powerPreference: 'high-performance', alpha: false, stencil: false });
    if (!context) throw new WebGLUnavailableError('WebGL 2 indisponível');
    this.gl = new THREE.WebGLRenderer({ canvas, context });
    this.gl.setPixelRatio(Math.min(window.devicePixelRatio, MAX_PIXEL_RATIO));
    this.gl.setSize(window.innerWidth, window.innerHeight);
    this.gl.toneMapping = THREE.ACESFilmicToneMapping;
    this.gl.toneMappingExposure = 1.05;
    this.gl.info.autoReset = false;
    this.gl.shadowMap.enabled = true;
    this.gl.shadowMap.type = THREE.PCFShadowMap;
    // Sombras estáticas: recalculadas só quando o setor é montado (custo zero por quadro).
    this.gl.shadowMap.autoUpdate = false;

    const size = new THREE.Vector2(window.innerWidth, window.innerHeight);
    // MSAA no alvo do pós-processamento (o antialias do canvas não vale quando se desenha num render target).
    const target = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: MSAA_SAMPLES });
    this.composer = new EffectComposer(this.gl, target);
    this.worldPass = new RenderPass(new THREE.Scene(), new THREE.PerspectiveCamera());
    this.viewPass = new RenderPass(new THREE.Scene(), new THREE.PerspectiveCamera());
    this.viewPass.clear = false;
    this.viewPass.clearDepth = true;
    this.bloom = new UnrealBloomPass(size, 0.55, 0.5, 0.82);
    this.composer.addPass(this.worldPass);
    this.composer.addPass(this.viewPass);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    window.addEventListener('resize', () => this.resize());
  }

  setScenes(world: THREE.Scene, camera: THREE.Camera, view: THREE.Scene | null, viewCamera: THREE.Camera | null): void {
    // A janela pode ter mudado de tamanho enquanto esta câmera não estava em uso.
    for (const cam of [camera, viewCamera]) {
      if (cam instanceof THREE.PerspectiveCamera) {
        cam.aspect = window.innerWidth / window.innerHeight;
        cam.updateProjectionMatrix();
      }
    }
    this.worldPass.scene = world;
    this.worldPass.camera = camera;
    this.viewPass.enabled = view !== null;
    if (view && viewCamera) {
      this.viewPass.scene = view;
      this.viewPass.camera = viewCamera;
    }
  }

  setBloom(strength: number, threshold: number): void {
    this.bloom.strength = strength;
    this.bloom.threshold = threshold;
  }

  refreshShadows(): void {
    this.gl.shadowMap.needsUpdate = true;
  }

  render(dtMs: number): void {
    this.trackQuality(dtMs);
    // Contadores do quadro inteiro (todas as passadas), lidos pelo medidor do `?debug`.
    this.gl.info.reset();
    this.composer.render();
  }

  private trackQuality(dtMs: number): void {
    const clamped = Math.min(dtMs, 100);
    this.frameAvg += (clamped - this.frameAvg) * 0.05;
    this.fps = 1000 / this.frameAvg;
    if (this.quality === 0) return;
    this.slowTime = this.frameAvg > SLOW_FRAME_MS ? this.slowTime + clamped / 1000 : 0;
    if (this.slowTime < QUALITY_WINDOW_S) return;
    this.slowTime = 0;
    this.quality -= 1;
    if (this.quality === 1) {
      this.bloom.enabled = false;
      for (const rt of [this.composer.renderTarget1, this.composer.renderTarget2]) {
        rt.samples = 0;
        rt.dispose();
      }
    }
    if (this.quality === 0) this.gl.setPixelRatio(1);
    this.resize();
    console.info(`[kepler] qualidade reduzida para o nível ${this.quality} (média ${this.frameAvg.toFixed(1)} ms)`);
  }

  get qualityLevel(): number {
    return this.quality;
  }

  resize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.gl.setSize(w, h);
    this.composer.setPixelRatio(this.gl.getPixelRatio());
    this.composer.setSize(w, h);
    for (const cam of [this.worldPass.camera, this.viewPass.camera]) {
      if (cam instanceof THREE.PerspectiveCamera) {
        cam.aspect = w / h;
        cam.updateProjectionMatrix();
      }
    }
  }
}
