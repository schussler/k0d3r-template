import * as THREE from 'three';
import type { Input } from '../engine/input';
import { moveBody } from '../logic/collision';
import type { LevelGrid } from '../logic/level';
import { clamp, damp } from '../logic/math';

export const PLAYER_RADIUS = 0.35;
const STAND_HEIGHT = 1.8;
const CROUCH_HEIGHT = 1.15;
const EYE_STAND = 1.62;
const EYE_CROUCH = 0.98;
const WALK_SPEED = 5.4;
const SPRINT_SPEED = 8.6;
const CROUCH_SPEED = 2.7;
const GROUND_ACCEL = 70;
const AIR_ACCEL = 14;
const FRICTION = 11;
const JUMP_SPEED = 5.8;
const GRAVITY = 16;
const STEP_DISTANCE = 2.3;
const MAX_PITCH = Math.PI / 2 - 0.05;
/** Retorno do coice (1/s): quanto maior, mais rápido a mira volta ao ponto original. */
const RECOIL_RETURN = 8;

export interface PlayerEvents {
  step: boolean;
  jumped: boolean;
  landed: number;
}

/**
 * Corpo e câmera da jogadora. A mira final soma o ângulo do mouse e o desvio do coice, que uma mola
 * devolve a zero: compensar o coice puxando o mouse não deixa a mira "sobrar" para baixo.
 */
export class Player {
  readonly position = new THREE.Vector3();
  readonly velocity = new THREE.Vector3();
  yaw = 0;
  pitch = 0;
  recoilPitch = 0;
  recoilYaw = 0;
  crouch = 0;
  onGround = true;
  sprinting = false;
  /** Velocidade horizontal normalizada (0 parada, 1 correndo): balanço da arma e abertura da mira. */
  moveFactor = 0;
  bobPhase = 0;
  private trauma = 0;
  private landDip = 0;
  private stepAccum = 0;
  private lastSafe = new THREE.Vector3();
  private belowFloorTime = 0;
  sensitivity = 0.0022;

  spawn(x: number, z: number, yaw: number): void {
    this.position.set(x, 0, z);
    this.lastSafe.copy(this.position);
    this.velocity.set(0, 0, 0);
    this.yaw = yaw;
    this.pitch = 0;
    this.recoilPitch = 0;
    this.recoilYaw = 0;
    this.crouch = 0;
    this.trauma = 0;
  }

  get height(): number {
    return STAND_HEIGHT + (CROUCH_HEIGHT - STAND_HEIGHT) * this.crouch;
  }

  get eyeHeight(): number {
    return EYE_STAND + (EYE_CROUCH - EYE_STAND) * this.crouch;
  }

  get eye(): THREE.Vector3 {
    return new THREE.Vector3(this.position.x, this.position.y + this.eyeHeight, this.position.z);
  }

  addRecoil(pitch: number, yaw: number): void {
    this.recoilPitch += pitch;
    this.recoilYaw += yaw;
  }

  shake(amount: number): void {
    this.trauma = Math.min(1, this.trauma + amount);
  }

  update(dt: number, input: Input, mouse: { dx: number; dy: number }, grid: LevelGrid, ceiling: number, controls: boolean): PlayerEvents {
    const events: PlayerEvents = { step: false, jumped: false, landed: 0 };
    if (controls) {
      this.yaw -= mouse.dx * this.sensitivity;
      this.pitch = clamp(this.pitch - mouse.dy * this.sensitivity, -MAX_PITCH, MAX_PITCH);
    }
    this.recoilPitch = damp(this.recoilPitch, 0, RECOIL_RETURN, dt);
    this.recoilYaw = damp(this.recoilYaw, 0, RECOIL_RETURN, dt);

    const crouching = controls && input.isDown('KeyC');
    this.crouch = damp(this.crouch, crouching ? 1 : 0, 14, dt);

    let fx = 0;
    let fz = 0;
    if (controls) {
      if (input.isDown('KeyW')) fz -= 1;
      if (input.isDown('KeyS')) fz += 1;
      if (input.isDown('KeyA')) fx -= 1;
      if (input.isDown('KeyD')) fx += 1;
    }
    const len = Math.hypot(fx, fz);
    this.sprinting = controls && input.isDown('ShiftLeft') && fz < 0 && !crouching && this.onGround;
    if (len > 0) {
      fx /= len;
      fz /= len;
    }
    const speed = crouching ? CROUCH_SPEED : this.sprinting ? SPRINT_SPEED : WALK_SPEED;
    const sin = Math.sin(this.yaw);
    const cos = Math.cos(this.yaw);
    const wishX = (fx * cos + fz * sin) * speed;
    const wishZ = (-fx * sin + fz * cos) * speed;
    const accel = this.onGround ? GROUND_ACCEL : AIR_ACCEL;
    this.velocity.x = approach(this.velocity.x, wishX, accel * dt);
    this.velocity.z = approach(this.velocity.z, wishZ, accel * dt);
    if (this.onGround && len === 0) {
      const f = Math.exp(-FRICTION * dt);
      this.velocity.x *= f;
      this.velocity.z *= f;
    }

    if (controls && input.wasPressed('Space') && this.onGround) {
      this.velocity.y = JUMP_SPEED;
      this.onGround = false;
      events.jumped = true;
    }
    this.velocity.y -= GRAVITY * dt;

    const fallSpeed = -this.velocity.y;
    const result = moveBody(
      grid,
      this.position,
      { x: this.velocity.x * dt, y: this.velocity.y * dt, z: this.velocity.z * dt },
      PLAYER_RADIUS,
      this.height,
      ceiling,
    );
    const wasGround = this.onGround;
    this.position.set(result.x, result.y, result.z);
    if (result.onGround && this.velocity.y <= 0) {
      if (!wasGround && fallSpeed > 3) {
        events.landed = fallSpeed;
        this.landDip = Math.min(0.25, fallSpeed * 0.025);
      }
      this.velocity.y = 0;
      this.onGround = true;
    } else this.onGround = false;
    if (result.hitCeiling && this.velocity.y > 0) this.velocity.y = 0;

    const horizontal = Math.hypot(this.velocity.x, this.velocity.z);
    this.moveFactor = this.onGround ? clamp(horizontal / SPRINT_SPEED, 0, 1) : this.moveFactor * 0.95;
    if (this.onGround && horizontal > 0.5) {
      this.bobPhase += horizontal * dt * 1.35;
      this.stepAccum += horizontal * dt;
      if (this.stepAccum > STEP_DISTANCE) {
        this.stepAccum = 0;
        events.step = true;
      }
    }
    this.trackSafety(dt);
    this.trauma = Math.max(0, this.trauma - dt * 1.8);
    this.landDip = damp(this.landDip, 0, 10, dt);
    return events;
  }

  /** Rede de segurança: se um bug de colisão a jogar abaixo do chão, volta ao último ponto seguro. */
  private trackSafety(dt: number): void {
    if (this.position.y < -0.5) {
      this.belowFloorTime += dt;
      if (this.belowFloorTime > 1) {
        console.warn('[kepler] jogadora abaixo do chão; voltando ao último ponto seguro');
        this.position.copy(this.lastSafe);
        this.velocity.set(0, 0, 0);
        this.belowFloorTime = 0;
      }
      return;
    }
    this.belowFloorTime = 0;
    if (this.onGround) this.lastSafe.copy(this.position);
  }

  applyCamera(camera: THREE.PerspectiveCamera, time: number): void {
    const shake = this.trauma * this.trauma;
    const bobAmp = this.onGround ? this.moveFactor : 0;
    const bobY = Math.abs(Math.sin(this.bobPhase * Math.PI)) * 0.06 * bobAmp;
    camera.position.set(
      this.position.x,
      this.position.y + this.eyeHeight + bobY - this.landDip + (noise(time * 23) * shake * 0.12),
      this.position.z,
    );
    camera.rotation.order = 'YXZ';
    camera.rotation.y = this.yaw + this.recoilYaw + noise(time * 19 + 3) * shake * 0.05;
    camera.rotation.x = this.pitch + this.recoilPitch + noise(time * 21 + 7) * shake * 0.05;
    camera.rotation.z = Math.sin(this.bobPhase * Math.PI) * 0.006 * bobAmp + noise(time * 17 + 11) * shake * 0.04;
  }

  /** Direção da mira (com o coice), normalizada. */
  aimDirection(out = new THREE.Vector3()): THREE.Vector3 {
    const p = this.pitch + this.recoilPitch;
    const y = this.yaw + this.recoilYaw;
    return out.set(-Math.sin(y) * Math.cos(p), Math.sin(p), -Math.cos(y) * Math.cos(p));
  }
}

function approach(v: number, target: number, step: number): number {
  return v < target ? Math.min(target, v + step) : Math.max(target, v - step);
}

/** Ruído suave determinístico em [-1, 1] (soma de senos), para o tremor da câmera. */
function noise(t: number): number {
  return (Math.sin(t) * 0.6 + Math.sin(t * 2.17 + 1.3) * 0.3 + Math.sin(t * 4.31 + 2.1) * 0.1);
}
