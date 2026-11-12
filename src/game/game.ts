import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { AudioEngine } from '../audio/audio';
import { Boss } from '../enemies/boss';
import type { Enemy } from '../enemies/enemy';
import { Input } from '../engine/input';
import { Renderer } from '../engine/renderer';
import { Effects } from '../fx/effects';
import { MAX_HEALTH, applyDamage, heal, rollDrop, tickVitals, type HitResult, type Vitals } from '../logic/combat';
import { formatTime, initialSnapshot, nextSector, takeSnapshot, type SectorId, type SectorSnapshot } from '../logic/flow';
import { CELL } from '../logic/level';
import { SECTORS } from '../logic/maps';
import { createRng } from '../logic/math';
import {
  AMMO_BOX,
  WEAPONS,
  addAmmo,
  ammoBoxUseful,
  cycleWeapon,
  giveWeapon,
  stepArsenal,
  type Arsenal,
  type WeaponId,
} from '../logic/weapons';
import { Player } from '../player/player';
import { ViewModel } from '../player/viewmodel';
import { Hud } from '../ui/hud';
import { Screens } from '../ui/screens';
import { TitleScene } from '../ui/title-scene';
import { THEMES } from '../world/themes';
import type { GameContext } from './context';
import { Sector, type Pickup } from './sector';
import { traceShot } from './shooting';
import { loadSettings, saveSettings, type Settings } from './settings';

/** 'error' é terminal: só o botão "Recarregar" sai dele. */
export type GameState = 'title' | 'playing' | 'paused' | 'dead' | 'transition' | 'victory' | 'error';

const MAX_DT = 0.05;
const TRANSITION_TIME = 1.2;
const VICTORY_DELAY = 3;
const HEALTH_PICKUP = 35;
const BASE_SENSITIVITY = 0.0022;
/** Quadros seguidos com erro antes de parar o jogo e mostrar a tela de erro. */
const FATAL_ERROR_FRAMES = 30;

/** Orquestra estados (título, jogo, pausa, morte, transição, vitória), o loop e os sistemas. */
export class Game {
  readonly renderer: Renderer;
  readonly input: Input;
  readonly audio = new AudioEngine();
  readonly player = new Player();
  readonly viewmodel = new ViewModel();
  readonly fx = new Effects();
  readonly worldScene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.05, 6000);
  readonly hud: Hud;
  readonly screens: Screens;
  readonly title = new TitleScene();
  state: GameState = 'title';
  sector: Sector | null = null;
  sectorId: SectorId = 'hangar';
  vitals: Vitals = initialSnapshot().vitals;
  arsenal: Arsenal = initialSnapshot().arsenal;
  elapsed = 0;
  deaths = 0;
  /** Sem travar o mouse (gancho de teste do `?debug`): a pausa por perda de trava não dispara. */
  lockFree = false;
  private snapshot: SectorSnapshot = initialSnapshot();
  private ctx: GameContext | null = null;
  private time = 0;
  private last = performance.now();
  private spreadBloom = 0;
  private transitionTime = 0;
  private victoryTimer = -1;
  private readonly rng = createRng(20261112);
  private readonly muzzleLight = new THREE.PointLight(0xffb060, 0, 9, 2);
  private settings: Settings;
  private readonly reportedErrors = new Map<string, number>();
  private errorFrames = 0;
  private readonly errorStrip: HTMLElement;
  debug = false;
  /** Invulnerável (só pelo gancho do `?debug`, para o E2E atravessar a partida). */
  godMode = false;

  constructor(canvas: HTMLCanvasElement, overlay: HTMLElement) {
    this.renderer = new Renderer(canvas);
    this.input = new Input(canvas);
    this.settings = loadSettings();
    this.player.sensitivity = BASE_SENSITIVITY * this.settings.sensitivity;
    this.hud = new Hud(overlay);
    this.screens = new Screens(
      overlay,
      {
        play: () => this.startGame(),
        resume: () => this.resume(),
        restartSector: () => this.retrySector(),
        retry: () => this.retrySector(),
        backToTitle: () => this.backToTitle(),
        setSensitivity: (v) => {
          this.settings = { ...this.settings, sensitivity: v };
          this.player.sensitivity = BASE_SENSITIVITY * v;
          saveSettings(this.settings);
        },
        setVolume: (v) => {
          this.settings = { ...this.settings, volume: v };
          this.audio.setVolume(v);
          saveSettings(this.settings);
        },
        onError: (err, where) => this.reportError(err, where),
      },
      this.settings,
    );
    this.errorStrip = document.createElement('div');
    this.errorStrip.className = 'error-strip hidden';
    overlay.append(this.errorStrip);

    const pmrem = new THREE.PMREMGenerator(this.renderer.gl);
    const room = new RoomEnvironment();
    this.worldScene.environment = pmrem.fromScene(room, 0.04).texture;
    room.dispose();
    pmrem.dispose();
    this.viewmodel.setEnvironment(this.worldScene.environment);
    this.worldScene.add(this.camera, this.fx.group);
    this.camera.add(this.muzzleLight);
    this.muzzleLight.position.set(0.3, -0.2, -0.8);

    this.input.onLockChange((locked) => this.onLockChange(locked));
    this.input.onLockError(() => {
      // Mouse recusado: o jogo fica parado atrás do aviso, sem robô atacando nem cronômetro correndo.
      if (this.state === 'playing') this.state = 'paused';
      if (this.state === 'paused') this.screens.show('resume');
    });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.state === 'playing') this.pause();
    });
    canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      this.fatal('A placa de vídeo reiniciou', 'O navegador perdeu o contexto WebGL. Recarregue a página para continuar.');
    });
    canvas.addEventListener('click', () => {
      if (this.state === 'playing' && !this.input.isLocked && !this.lockFree) this.input.requestLock();
    });

    this.screens.show('title');
    this.renderer.setScenes(this.title.scene, this.title.camera, null, null);
    this.renderer.gl.setAnimationLoop(() => this.frame());
  }

  // ---------- Estados ----------

  startGame(skipLock = false): void {
    this.audio.unlock();
    this.audio.setVolume(this.settings.volume);
    this.audio.ui();
    this.lockFree = skipLock;
    this.elapsed = 0;
    this.deaths = 0;
    this.snapshot = initialSnapshot();
    this.loadSector('hangar', this.snapshot);
    this.audio.music?.start();
    this.state = 'playing';
    this.screens.show('none');
    this.hud.show(true);
    if (this.audio.unavailable) this.hud.toast('Sem som: o navegador recusou o áudio');
    if (!skipLock) this.input.requestLock();
  }

  private resume(): void {
    this.audio.unlock();
    if (this.lockFree) {
      this.state = 'playing';
      this.screens.show('none');
      return;
    }
    this.input.requestLock();
  }

  private onLockChange(locked: boolean): void {
    if (locked) {
      if (this.state === 'paused' || this.state === 'playing') {
        this.state = 'playing';
        this.screens.show('none');
      }
      return;
    }
    // O navegador solta o mouse no Esc: é assim que a pausa acontece.
    if (this.state === 'playing') this.pause();
  }

  pause(): void {
    if (this.state !== 'playing') return;
    this.state = 'paused';
    this.screens.show('pause');
    this.input.releaseLock();
  }

  retrySector(): void {
    this.audio.unlock();
    this.loadSector(this.snapshot.sector, this.snapshot);
    this.state = 'playing';
    this.screens.show('none');
    if (!this.lockFree) this.input.requestLock();
  }

  private backToTitle(): void {
    this.input.releaseLock();
    this.sector?.dispose();
    this.sector = null;
    this.fx.clear();
    this.state = 'title';
    this.hud.show(false);
    this.screens.show('title');
    this.audio.music?.stop();
    this.audio.setAmbience('title');
    this.renderer.setScenes(this.title.scene, this.title.camera, null, null);
    this.renderer.setBloom(0.8, 0.7);
  }

  private die(): void {
    this.state = 'dead';
    this.deaths += 1;
    this.hud.setPrompt(null);
    this.screens.show('dead');
    this.input.releaseLock();
  }

  private win(): void {
    this.state = 'victory';
    this.hud.show(false);
    this.screens.setVictory(formatTime(this.elapsed), this.deaths);
    this.screens.show('victory');
    this.input.releaseLock();
    this.audio.music?.stop();
  }

  // ---------- Setor ----------

  loadSector(id: SectorId, snapshot: SectorSnapshot): void {
    // Monta o setor novo antes de descartar o atual: se a montagem falhar, nada fica pela metade.
    const def = SECTORS[id];
    const sector = new Sector(def);
    const ctx = this.makeContext(sector);
    sector.populate(ctx);
    this.sector?.dispose();
    this.fx.clear();
    this.sector = sector;
    this.sectorId = id;
    this.ctx = ctx;
    this.worldScene.add(sector.group);

    const theme = THEMES[id];
    this.worldScene.background = new THREE.Color(theme.background);
    this.worldScene.fog = new THREE.FogExp2(theme.fogColor, theme.fogDensity);
    this.worldScene.environmentIntensity = theme.envIntensity;
    this.renderer.setBloom(theme.bloom.strength, theme.bloom.threshold);
    this.viewmodel.setTint(theme.hemiSky);
    this.renderer.setScenes(this.worldScene, this.camera, this.viewmodel.scene, this.viewmodel.camera);
    this.renderer.refreshShadows();

    const start = sector.grid.cellCenter(sector.level.playerStart);
    this.player.spawn(start.x, start.z, this.openYaw(sector));
    this.vitals = snapshot.vitals;
    this.arsenal = snapshot.arsenal;
    this.snapshot = takeSnapshot(id, snapshot.vitals, snapshot.arsenal);
    this.spreadBloom = 0;
    this.victoryTimer = -1;
    this.audio.setAmbience(id);
    this.hud.setSector(def.label, def.name);
    this.hud.setBoss(null, 1);
    this.screens.sectorCard(def.label, def.name);
  }

  /** Direção inicial da câmera: para o chefe, se houver; senão, para onde há mais espaço livre. */
  private openYaw(sector: Sector): number {
    const s = sector.level.playerStart;
    const boss = sector.level.enemies.find((e) => e.kind === 'boss');
    if (boss) return Math.atan2(-(boss.cell.i - s.i), -(boss.cell.j - s.j));
    let best = 0;
    let bestRun = -1;
    for (const [yaw, di, dj] of [
      [0, 0, -1],
      [Math.PI, 0, 1],
      [Math.PI / 2, -1, 0],
      [-Math.PI / 2, 1, 0],
    ] as const) {
      let run = 0;
      while (run < 40 && sector.grid.isWalkable(s.i + di * (run + 1), s.j + dj * (run + 1))) run++;
      if (run > bestRun) {
        bestRun = run;
        best = yaw;
      }
    }
    return best;
  }

  private makeContext(sector: Sector): GameContext {
    const clock = (): number => this.time;
    const ctx: GameContext = {
      scene: sector.group,
      grid: sector.grid,
      ceiling: sector.ceiling,
      audio: this.audio,
      fx: this.fx,
      player: this.player,
      get time() {
        return clock();
      },
      rng: this.rng,
      damagePlayer: (amount, from) => this.damagePlayer(amount, from),
      pushPlayer: (impulse) => {
        this.player.velocity.add(impulse);
        if (impulse.y > 0) this.player.onGround = false;
      },
      spawnProjectile: (spec) => sector.projectiles.spawn(spec),
      spawnEnemy: (kind, x, z) => {
        sector.spawnEnemy(kind, x, z, ctx);
      },
      countAlive: (kind) => sector.countAlive(kind),
    };
    return ctx;
  }

  // ---------- Loop ----------

  private frame(): void {
    const now = performance.now();
    const dtMs = now - this.last;
    this.last = now;
    const dt = Math.min(MAX_DT, dtMs / 1000);
    // Atualização e desenho em blocos separados: um erro de lógica não congela a imagem.
    let failed = false;
    try {
      this.time += dt;
      if (this.state === 'title') this.title.update(this.time);
      else this.updateWorld(dt);
      this.hud.setFps(this.debug ? this.renderer.fps : null, this.renderer.qualityLevel);
    } catch (err: unknown) {
      this.reportError(err);
      failed = true;
    } finally {
      this.input.endFrame();
    }
    try {
      if (this.state !== 'error') this.renderer.render(dtMs);
    } catch (err: unknown) {
      this.reportError(err, 'desenho');
      failed = true;
    }
    this.errorFrames = failed ? this.errorFrames + 1 : 0;
    if (this.errorFrames >= FATAL_ERROR_FRAMES) this.fatal('Erro interno', 'O jogo encontrou um erro que se repete a cada quadro. Recarregue a página.');
  }

  /**
   * Erro inesperado (no quadro ou num botão): registrado com contexto e mostrado numa faixa. A mesma origem
   * é registrada uma vez e contada; erro em todo quadro por muito tempo vira tela de erro.
   */
  reportError(err: unknown, where = 'quadro'): void {
    const message = err instanceof Error ? err.message : String(err);
    const origin = err instanceof Error ? (err.stack?.split('\n')[1]?.trim() ?? '') : '';
    const key = `${message} @ ${origin}`;
    const count = (this.reportedErrors.get(key) ?? 0) + 1;
    this.reportedErrors.set(key, count);
    if (count === 1) console.error(`[kepler] erro no ${where} (estado ${this.state}, setor ${this.sectorId})`, err);
    this.errorStrip.textContent = `Erro interno: ${message}${count > 1 ? ` (×${count})` : ''}`;
    this.errorStrip.classList.remove('hidden');
  }

  /** Para o jogo e mostra a tela de erro (só "Recarregar" sai dela). */
  private fatal(title: string, message: string): void {
    this.state = 'error';
    this.input.releaseLock();
    this.hud.show(false);
    this.renderer.gl.setAnimationLoop(null);
    this.screens.showError(title, message);
  }

  private updateWorld(dt: number): void {
    const sector = this.sector;
    const ctx = this.ctx;
    if (!sector || !ctx) return;
    const playing = this.state === 'playing';
    // O mouse é lido uma vez por quadro; fora do jogo o movimento acumulado é descartado.
    const mouse = this.input.consumeMouse();
    if (playing) {
      this.elapsed += dt;
      const events = this.player.update(dt, this.input, mouse, sector.grid, sector.ceiling, true);
      if (events.step) this.audio.footstep();
      if (events.jumped) this.audio.jump();
      if (events.landed > 0) {
        this.audio.land();
        this.player.shake(Math.min(0.25, events.landed * 0.02));
      }
      this.handleWeapons(dt, mouse.wheel);
      this.handleInteraction();
      this.vitals = tickVitals(this.vitals, dt);
      const touched = sector.update(dt, this.time, ctx);
      // Morreu neste quadro: nada de pegar item nem atravessar a saída depois da morte.
      if (this.state === 'playing') {
        touched.forEach((p) => this.collect(p));
        this.updateBossAndExit(dt);
      }
    } else if (this.state === 'transition') {
      this.updateTransition(dt);
    }
    this.fx.update(dt, sector.grid);
    if (sector.doorsMoving) this.renderer.refreshShadows();
    this.audio.update(dt, sector.boss ? 1 : sector.combatIntensity());
    this.player.applyCamera(this.camera, this.time);
    const look = this.player.aimDirection();
    this.audio.setListener(this.camera.position.x, this.camera.position.y, this.camera.position.z, look.x, look.y, look.z);
    this.viewmodel.update(dt, this.time, this.arsenal, this.player.moveFactor, this.player.bobPhase, this.player.sprinting, this.player.crouch, mouse.dx, mouse.dy);
    this.muzzleLight.intensity = Math.max(0, this.muzzleLight.intensity - dt * 400);
    this.spreadBloom = Math.max(0, this.spreadBloom - dt * 0.25 - this.spreadBloom * dt * 4);
    this.hud.update(dt, this.vitals, this.arsenal, this.currentSpread(), this.elapsed);
  }

  private updateBossAndExit(dt: number): void {
    const sector = this.sector!;
    const boss = sector.boss;
    if (boss) {
      this.hud.setBoss(boss.alive ? boss.health / boss.maxHealth : 0, boss.phase);
      if (!boss.alive && this.victoryTimer < 0) this.victoryTimer = VICTORY_DELAY;
    }
    if (this.victoryTimer >= 0) {
      this.victoryTimer -= dt;
      if (this.victoryTimer < 0) this.win();
      return;
    }
    if (sector.isOnExit(this.player.position)) {
      this.state = 'transition';
      this.transitionTime = 0;
      this.hud.setPrompt(null);
    }
  }

  private updateTransition(dt: number): void {
    this.transitionTime += dt;
    const half = TRANSITION_TIME / 2;
    this.screens.setFade(this.transitionTime < half ? this.transitionTime / half : Math.max(0, 1 - (this.transitionTime - half) / half));
    if (this.transitionTime >= half && this.sectorId !== 'core' && this.transitionTime - dt < half) {
      const next = nextSector(this.sectorId);
      if (next) this.loadSector(next, takeSnapshot(next, this.vitals, this.arsenal));
    }
    if (this.transitionTime >= TRANSITION_TIME) {
      this.screens.setFade(0);
      this.state = 'playing';
      // O mouse pode ter sido solto durante o escurecimento (Esc ou troca de aba).
      if (!this.input.isLocked && !this.lockFree) this.pause();
    }
  }

  // ---------- Armas e tiro ----------

  currentSpread(): number {
    const def = WEAPONS[this.arsenal.current];
    const move = this.player.moveFactor * 0.035;
    const air = this.player.onGround ? 0 : 0.04;
    const crouch = 1 - this.player.crouch * 0.4;
    return (def.spread + this.spreadBloom + move + air) * crouch;
  }

  private handleWeapons(dt: number, wheel: number): void {
    let switchTo: WeaponId | null = null;
    if (this.input.wasPressed('Digit1')) switchTo = 'pistol';
    if (this.input.wasPressed('Digit2')) switchTo = 'rifle';
    if (this.input.wasPressed('Digit3')) switchTo = 'shotgun';
    if (wheel !== 0) switchTo = cycleWeapon(this.arsenal, wheel > 0 ? 1 : -1);
    const { arsenal, events } = stepArsenal(
      this.arsenal,
      {
        triggerHeld: this.input.isDown('Mouse0'),
        triggerPressed: this.input.wasPressed('Mouse0'),
        reload: this.input.wasPressed('KeyR'),
        switchTo,
        canFire: !this.player.sprinting,
      },
      dt,
    );
    this.arsenal = arsenal;
    for (const e of events) {
      if (e.type === 'fire') this.fire(e.weapon);
      else if (e.type === 'dry') this.audio.dry();
      else if (e.type === 'reloadStart') this.audio.reload(e.weapon);
      else if (e.type === 'switchStart') this.audio.switchWeapon();
    }
  }

  /** Dispara a arma atual (também usado pelo gancho de teste). */
  fire(weapon: WeaponId): void {
    const sector = this.sector;
    const ctx = this.ctx;
    if (!sector || !ctx) return;
    const def = WEAPONS[weapon];
    const eye = this.player.eye;
    const aim = this.player.aimDirection();
    const outcome = traceShot(sector, weapon, eye, aim, this.currentSpread(), this.rng);

    this.player.addRecoil(def.recoilPitch * (1 - this.player.crouch * 0.3), (this.rng() - 0.5) * 2 * def.recoilYaw);
    if (weapon === 'shotgun') this.player.shake(0.12);
    this.spreadBloom = Math.min(0.12, this.spreadBloom + def.bloomPerShot);
    this.viewmodel.fire(weapon);
    this.audio.shot(weapon);
    this.muzzleLight.intensity = weapon === 'shotgun' ? 30 : 16;
    sector.emitNoise(eye, def.noiseRadius, ctx);

    const muzzle = this.camera.localToWorld(this.viewmodel.muzzleOffset());
    const ejector = this.camera.localToWorld(this.viewmodel.ejectorOffset());
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(this.camera.quaternion);
    this.fx.casing(ejector, right.multiplyScalar(2 + this.rng()).add(new THREE.Vector3(0, 2.2 + this.rng(), 0)));
    outcome.endpoints.forEach((end, n) => {
      if (weapon !== 'shotgun' || n % 3 === 0) this.fx.tracer(muzzle, end, weapon === 'rifle' ? 0xffc070 : 0xffe0a0);
    });
    for (const w of outcome.worldHits) {
      this.fx.sparkBurst(w.point, w.normal, weapon === 'shotgun' ? 3 : 7, new THREE.Color(0xffc070), 5, 0.7);
      this.fx.decal(w.point, w.normal);
    }
    for (const [enemy, hit] of outcome.enemyHits) this.applyEnemyHit(enemy, hit.result, hit.point, aim, weapon, ctx);
  }

  private applyEnemyHit(enemy: Enemy, result: HitResult, point: THREE.Vector3, dir: THREE.Vector3, weapon: WeaponId, ctx: GameContext): void {
    const killed = enemy.takeHit({ result, point, dir, weapon }, ctx);
    if (result.blocked) {
      this.fx.sparkBurst(point, dir.clone().negate(), 14, new THREE.Color(0x6fc8ff), 6, 1);
      this.fx.glow(point, new THREE.Color(0x4fb8ff), 0.9, 0.12);
      this.hud.hit('blocked');
      this.audio.hit('blocked');
      return;
    }
    this.fx.sparkBurst(point, dir.clone().negate(), result.headshot ? 22 : 12, new THREE.Color(result.headshot ? 0xfff0a0 : 0xffa040), 7, 0.9);
    this.fx.glow(point, new THREE.Color(0xffa040), result.headshot ? 0.9 : 0.5, 0.08);
    this.player.shake(result.headshot ? 0.09 : 0.05);
    this.audio.enemyHurt(point);
    if (killed) {
      this.hud.hit('kill');
      this.audio.hit(result.headshot ? 'head' : 'kill');
      this.killEnemy(enemy, dir, ctx);
    } else {
      this.hud.hit(result.headshot ? 'head' : 'body');
      this.audio.hit(result.headshot ? 'head' : 'body');
    }
  }

  private killEnemy(enemy: Enemy, dir: THREE.Vector3, ctx: GameContext): void {
    const sector = this.sector!;
    const big = enemy.kind === 'boss';
    const center = enemy.position.clone().setY(enemy.position.y + (big ? 4 : 1));
    this.audio.enemyDie(center, big || enemy.kind === 'brute');
    this.fx.sparkBurst(center, new THREE.Vector3(0, 1, 0), big ? 160 : 40, new THREE.Color(0xffb050), big ? 14 : 8, 1.2);
    this.fx.glow(center, new THREE.Color(0xffc080), big ? 9 : 3, big ? 0.6 : 0.3);
    enemy.explode(ctx, dir, big ? 2 : 1);
    if (big) {
      this.player.shake(0.8);
      for (const e of sector.enemies) if (e !== enemy && e.alive) e.explode(ctx, new THREE.Vector3(0, 1, 0), 0.6);
      sector.enemies.forEach((e) => (e.alive = false));
      return;
    }
    const drop = rollDrop(this.rng());
    if (drop) sector.addPickup(drop, new THREE.Vector3(enemy.position.x, 0.7, enemy.position.z));
  }

  // ---------- Jogadora ----------

  damagePlayer(amount: number, from: THREE.Vector3): void {
    if (this.state !== 'playing' || this.victoryTimer >= 0 || this.godMode) return;
    const before = this.vitals;
    this.vitals = applyDamage(this.vitals, amount);
    const shieldOnly = this.vitals.health === before.health;
    this.audio.playerHurt(shieldOnly);
    if (before.shield > 0 && this.vitals.shield === 0) this.audio.shieldBreak();
    const to = new THREE.Vector3(from.x - this.player.position.x, 0, from.z - this.player.position.z);
    const angle = to.lengthSq() > 0.01 ? Math.atan2(-to.x, -to.z) - this.player.yaw : null;
    this.hud.damage(amount, angle);
    this.player.shake(Math.min(0.4, amount / 60));
    this.player.addRecoil(0.02, 0);
    if (this.vitals.health <= 0) this.die();
  }

  private collect(item: Pickup): void {
    const sector = this.sector!;
    if (item.kind === 'health') {
      if (this.vitals.health >= MAX_HEALTH) return;
      this.vitals = heal(this.vitals, HEALTH_PICKUP);
      this.hud.toast(`+${HEALTH_PICKUP} vida`);
      this.audio.pickup('health');
    } else if (item.kind === 'ammo') {
      if (!ammoBoxUseful(this.arsenal)) return;
      this.arsenal = addAmmo(addAmmo(this.arsenal, 'rifle', AMMO_BOX.rifle), 'shotgun', AMMO_BOX.shotgun);
      this.hud.toast('+ munição');
      this.audio.pickup('ammo');
    } else {
      const weapon: WeaponId = item.kind;
      const had = this.arsenal.slots[weapon].owned;
      this.arsenal = giveWeapon(this.arsenal, weapon, weapon === 'rifle' ? 60 : 12);
      if (!had) {
        const switched = stepArsenal(this.arsenal, { triggerHeld: false, triggerPressed: false, reload: false, switchTo: weapon, canFire: false }, 0);
        this.arsenal = switched.arsenal;
        this.audio.switchWeapon();
      }
      this.hud.toast(`${WEAPONS[weapon].name} ${had ? '+ munição' : 'coletado'}`);
      this.audio.pickup('weapon');
    }
    sector.takePickup(item);
  }

  private handleInteraction(): void {
    const sector = this.sector!;
    const target = sector.interactable(this.player.eye, this.player.aimDirection());
    this.hud.setPrompt(target ? 'Ativar interruptor' : null);
    if (target && this.input.wasPressed('KeyE')) sector.activate(target, this.ctx!);
  }

  // ---------- Atalhos do gancho de teste ----------

  teleport(x: number, z: number): void {
    this.player.spawn(x, z, this.player.yaw);
  }

  /** Centro de uma célula em metros. */
  static cellToWorld(i: number, j: number): { x: number; z: number } {
    return { x: i * CELL + CELL / 2, z: j * CELL + CELL / 2 };
  }

  killAll(): void {
    const sector = this.sector;
    const ctx = this.ctx;
    if (!sector || !ctx) return;
    for (const e of [...sector.enemies]) {
      if (!e.alive) continue;
      e.health = 0;
      e.alive = false;
      this.killEnemy(e, new THREE.Vector3(0, 0, 1), ctx);
    }
  }

  damageBoss(fraction: number): void {
    const boss = this.sector?.boss;
    if (!boss || !boss.alive || !this.ctx) return;
    const amount = boss.maxHealth * fraction;
    const killed = boss.takeHit({ result: { damage: amount, blocked: false, headshot: false, back: false }, point: boss.position.clone(), dir: new THREE.Vector3(0, 0, 1), weapon: 'pistol' }, this.ctx);
    if (killed) this.killEnemy(boss, new THREE.Vector3(0, 0, 1), this.ctx);
  }

  activateSwitches(): void {
    if (this.sector && this.ctx) this.sector.activateAll(this.ctx);
  }

  get bossAlive(): boolean {
    return this.sector?.boss instanceof Boss ? this.sector.boss.alive : false;
  }
}
