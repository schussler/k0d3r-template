import * as THREE from 'three';
import { type ArsenalInput, type ArsenalState, WEAPONS, type WeaponId, createArsenal, updateArsenal } from '../rules/arsenal';
import { REST, type Spring, kick, updateSpring } from '../rules/spring';
import { addShotSpread, spreadTarget, updateSpread } from '../rules/spread';
import type { Input } from '../game/input';
import type { Sfx } from '../audio/sfx';
import type { AudioEngine } from '../audio/engine';
import type { Hittable } from '../enemies/hittable';
import type { CollisionWorld } from '../world/collision';
import { Shake } from '../render/shake';
import type { Shells } from '../fx/shells';
import { type MoveEvent, PlayerController } from './controller';
import type { Gunplay, ShotResult } from './gunplay';
import type { Viewmodel } from './viewmodel';

/**
 * O jogador por inteiro num quadro: lê a entrada, move, atira, aplica coice e tremor e posiciona a câmera.
 * Devolve o que aconteceu (tiros, acertos) para o jogo repassar ao HUD e aos robôs.
 */
const SENSITIVITY = 0.0021;
const AIM_STIFFNESS = 120;
const AIM_DAMPING = 22;
const SELECT: Readonly<Record<string, WeaponId>> = { Digit1: 'pistol', Digit2: 'rifle', Digit3: 'shotgun' };

export interface FrameReport {
  shots: { weapon: WeaponId; result: ShotResult }[];
}

export class PlayerRig {
  readonly controller: PlayerController;
  arsenal: ArsenalState = createArsenal();
  spread = 0;
  readonly shake = new Shake();
  private aimPitch: Spring = REST;
  private aimYaw: Spring = REST;
  private readonly moveEvents: MoveEvent[] = [];
  private readonly muzzle = new THREE.Vector3();
  private readonly eject = new THREE.Vector3();
  private readonly vel = new THREE.Vector3();
  private readonly fwd = new THREE.Vector3();

  constructor(
    world: CollisionWorld,
    readonly camera: THREE.PerspectiveCamera,
    private readonly vm: Viewmodel,
    private readonly gunplay: Gunplay,
    private readonly shells: Shells,
    private readonly sfx: Sfx,
    private readonly audio: AudioEngine,
  ) {
    this.controller = new PlayerController(world);
  }

  reset(arsenal: ArsenalState): void {
    this.arsenal = arsenal;
    this.spread = spreadTarget(WEAPONS[arsenal.current], { speedFactor: 0, airborne: false, crouched: false });
    this.aimPitch = REST;
    this.aimYaw = REST;
    this.shake.reset();
  }

  update(dt: number, input: Input, world: CollisionWorld, targets: readonly Hittable[]): FrameReport {
    const c = this.controller;
    const look = input.look;
    c.look(look.dx, look.dy, SENSITIVITY);
    this.moveEvents.length = 0;
    c.update(dt, {
      forward: (input.isDown('KeyW') ? 1 : 0) - (input.isDown('KeyS') ? 1 : 0),
      right: (input.isDown('KeyD') ? 1 : 0) - (input.isDown('KeyA') ? 1 : 0),
      jump: input.pressed('Space'),
      crouch: input.isDown('ControlLeft') || input.isDown('KeyC') || input.isDown('ControlRight'),
      sprint: input.isDown('ShiftLeft') || input.isDown('ShiftRight'),
    }, this.moveEvents);
    for (const e of this.moveEvents) {
      if (e.type === 'step') this.sfx.step(e.sprint);
      else if (e.type === 'jump') this.sfx.jump();
      else {
        this.sfx.land(e.strength);
        this.shake.add(0.1 + e.strength * 0.25);
      }
    }

    const selectKey = Object.keys(SELECT).find((k) => input.pressed(k));
    const wheel = input.wheelSteps;
    const arsenalInput: ArsenalInput = {
      trigger: input.mouseLeft,
      reload: input.pressed('KeyR'),
      select: selectKey ? (SELECT[selectKey] ?? null) : null,
      cycle: wheel > 0 ? 1 : wheel < 0 ? -1 : 0,
      sprinting: c.sprinting,
    };
    const { state, events } = updateArsenal(this.arsenal, arsenalInput, dt);
    this.arsenal = state;
    const def = WEAPONS[state.current];
    this.spread = updateSpread(this.spread, def, { speedFactor: c.speedFactor, airborne: !c.grounded, crouched: c.crouched }, dt);

    this.aimPitch = updateSpring(this.aimPitch, AIM_STIFFNESS, AIM_DAMPING, dt);
    this.aimYaw = updateSpring(this.aimYaw, AIM_STIFFNESS, AIM_DAMPING, dt);
    this.shake.update(dt);
    this.placeCamera();

    const report: FrameReport = { shots: [] };
    for (const e of events) {
      switch (e.type) {
        case 'fire':
          report.shots.push({ weapon: e.weapon, result: this.fire(e.weapon, world, targets) });
          break;
        case 'dry':
          this.sfx.dry();
          break;
        case 'reload-start':
          this.sfx.reloadStart(e.weapon, WEAPONS[e.weapon].reloadTime);
          break;
        case 'reload-shell':
          this.sfx.shell();
          break;
        case 'draw':
          this.sfx.draw();
          break;
        case 'switch-start':
        case 'switch-end':
        case 'reload-end':
          break;
      }
    }

    const vmState = this.vm.update(dt, {
      arsenal: state, speedFactor: c.speedFactor, stepPhase: c.stepPhase, grounded: c.grounded, crouched: c.crouched,
      sprinting: c.sprinting, lookDX: look.dx, lookDY: look.dy, landDip: c.landDip,
    });
    if (vmState.pumpEject) this.shells.eject(this.vm.ejectLocal(this.eject), true);
    this.vel.set(c.vx, c.vy, c.vz);
    this.shells.update(dt, this.camera, this.vel, world);
    this.camera.getWorldDirection(this.fwd);
    this.audio.setListener(this.camera.position.x, this.camera.position.y, this.camera.position.z, this.fwd.x, this.fwd.y, this.fwd.z);
    return report;
  }

  private placeCamera(): void {
    const c = this.controller;
    const bob = c.grounded ? Math.abs(Math.sin(c.stepPhase)) * 0.035 * Math.min(1.5, c.speedFactor) : 0;
    this.camera.position.set(c.x, c.eyeY + bob - c.landDip, c.z);
    this.camera.rotation.set(
      c.pitch + this.aimPitch.offset + this.shake.pitch,
      c.yaw + this.aimYaw.offset + this.shake.yaw,
      this.shake.roll + Math.sin(c.stepPhase) * 0.004 * Math.min(1.5, c.speedFactor),
      'YXZ',
    );
    this.camera.updateMatrixWorld();
  }

  private fire(id: WeaponId, world: CollisionWorld, targets: readonly Hittable[]): ShotResult {
    const def = WEAPONS[id];
    this.vm.onFire(id);
    this.vm.muzzleLocal(this.muzzle);
    this.muzzle.applyMatrix4(this.camera.matrixWorld);
    const result = this.gunplay.fire(id, this.camera, this.muzzle, this.spread, world, targets);
    // O coice entra depois do raio: este tiro sai onde a mira estava, o próximo sai mais alto.
    this.aimPitch = kick(this.aimPitch, def.recoilKick);
    this.aimYaw = kick(this.aimYaw, (Math.random() * 2 - 1) * def.recoilKick * 0.35);
    this.spread = addShotSpread(this.spread, def);
    this.shake.add(id === 'shotgun' ? 0.32 : id === 'pistol' ? 0.1 : 0.06);
    this.sfx.fire(id);
    if (id !== 'shotgun') this.shells.eject(this.vm.ejectLocal(this.eject), false);
    if (result.hits > 0) {
      this.sfx.hit(result.head);
      this.shake.add(result.head ? 0.2 : 0.12);
    }
    if (result.blockPoint) this.sfx.blocked(result.blockPoint.x, result.blockPoint.y, result.blockPoint.z);
    for (const w of result.worldImpacts) this.sfx.impact(w.x, w.y, w.z, w.surface);
    return result;
  }

  /** Raio da mira em pixels de tela. */
  spreadPx(viewportHeight: number): number {
    return (Math.tan(this.spread) / Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2))) * (viewportHeight / 2);
  }
}
