import type { Box, CollisionWorld } from '../world/collision';

/**
 * Movimento em primeira pessoa: aceleração curta no chão, pouco controle no ar, pulo, agachar e correr.
 * O corpo é uma caixa de colisão (largura `RADIUS * 2`) resolvida eixo a eixo contra o mundo. Estado mutável de
 * propósito: roda a 60 Hz (exceção de mutação registrada na spec de arquitetura).
 */
export const RADIUS = 0.36;
export const STAND_HEIGHT = 1.75;
export const CROUCH_HEIGHT = 1.1;
const EYE_OFFSET = 0.12;
const WALK = 5.2;
const SPRINT = 7.8;
const CROUCH = 2.5;
const GROUND_ACCEL = 13;
const AIR_ACCEL = 2.2;
const GROUND_FRICTION = 11;
const JUMP_SPEED = 6.6;
const GRAVITY = 18;
const STEP_UP = 0.42;
const LOOK_LIMIT = 1.52;

export interface MoveInput {
  forward: number;
  right: number;
  jump: boolean;
  crouch: boolean;
  sprint: boolean;
}

export type MoveEvent = { type: 'step'; sprint: boolean } | { type: 'jump' } | { type: 'land'; strength: number };

export class PlayerController {
  x = 0;
  y = 0;
  z = 0;
  vx = 0;
  vy = 0;
  vz = 0;
  yaw = 0;
  pitch = 0;
  height = STAND_HEIGHT;
  grounded = false;
  crouched = false;
  sprinting = false;
  /** Fase do passo, usada pelo balanço da arma e da câmera. */
  stepPhase = 0;
  /** Afundada da câmera ao aterrissar, que volta sozinha. */
  landDip = 0;
  private readonly scratch: Box[] = [];

  constructor(private world: CollisionWorld) {}

  setWorld(world: CollisionWorld): void {
    this.world = world;
  }

  place(x: number, z: number, yaw: number): void {
    this.x = x;
    this.z = z;
    this.y = 0;
    this.vx = this.vy = this.vz = 0;
    this.yaw = yaw;
    this.pitch = 0;
    this.height = STAND_HEIGHT;
    this.crouched = false;
    this.landDip = 0;
  }

  look(dx: number, dy: number, sensitivity: number): void {
    this.yaw -= dx * sensitivity;
    this.pitch = Math.max(-LOOK_LIMIT, Math.min(LOOK_LIMIT, this.pitch - dy * sensitivity));
  }

  get eyeY(): number {
    return this.y + this.height - EYE_OFFSET;
  }

  get horizontalSpeed(): number {
    return Math.hypot(this.vx, this.vz);
  }

  /** 0 parado, 1 andando, perto de 1,5 correndo. */
  get speedFactor(): number {
    return this.horizontalSpeed / WALK;
  }

  update(dt: number, input: MoveInput, events: MoveEvent[]): void {
    this.updateCrouch(dt, input.crouch);
    const len = Math.hypot(input.forward, input.right);
    const fx = len > 0 ? input.forward / len : 0;
    const rx = len > 0 ? input.right / len : 0;
    const sin = Math.sin(this.yaw);
    const cos = Math.cos(this.yaw);
    const wishX = -sin * fx + cos * rx;
    const wishZ = -cos * fx - sin * rx;
    this.sprinting = input.sprint && input.forward > 0 && !this.crouched && this.grounded;
    const speed = this.crouched ? CROUCH : this.sprinting ? SPRINT : WALK;
    if (this.grounded) {
      const k = Math.min(1, (len > 0 ? GROUND_ACCEL : GROUND_FRICTION) * dt);
      this.vx += (wishX * speed - this.vx) * k;
      this.vz += (wishZ * speed - this.vz) * k;
    } else if (len > 0) {
      this.vx += wishX * speed * AIR_ACCEL * dt;
      this.vz += wishZ * speed * AIR_ACCEL * dt;
      const h = Math.hypot(this.vx, this.vz);
      const cap = Math.max(speed, WALK);
      if (h > cap) {
        this.vx *= cap / h;
        this.vz *= cap / h;
      }
    }
    if (input.jump && this.grounded) {
      this.vy = JUMP_SPEED;
      this.grounded = false;
      events.push({ type: 'jump' });
    }
    this.vy -= GRAVITY * dt;
    const fallSpeed = -this.vy;
    this.moveAxis(this.vx * dt, 0);
    this.moveAxis(this.vz * dt, 2);
    const wasGrounded = this.grounded;
    this.moveVertical(this.vy * dt);
    if (this.grounded && !wasGrounded && fallSpeed > 3) {
      const strength = Math.min(1, (fallSpeed - 3) / 9);
      this.landDip = Math.min(0.22, this.landDip + 0.05 + strength * 0.17);
      events.push({ type: 'land', strength });
    }
    this.landDip = Math.max(0, this.landDip - dt * 0.9);
    if (this.grounded) {
      const before = Math.floor(this.stepPhase / Math.PI);
      this.stepPhase += this.horizontalSpeed * dt * 1.85;
      if (Math.floor(this.stepPhase / Math.PI) !== before && this.horizontalSpeed > 1) events.push({ type: 'step', sprint: this.sprinting });
    }
  }

  private updateCrouch(dt: number, want: boolean): void {
    if (!want && this.crouched && this.blockedAbove(STAND_HEIGHT)) want = true;
    this.crouched = want;
    const target = want ? CROUCH_HEIGHT : STAND_HEIGHT;
    this.height += (target - this.height) * Math.min(1, dt * 12);
  }

  private blockedAbove(h: number): boolean {
    for (const b of this.overlapping(this.x, this.z)) if (b.minY < this.y + h && b.maxY > this.y + this.height) return true;
    return this.y + h > this.world.ceilingY;
  }

  private overlapping(x: number, z: number): Box[] {
    return this.world.query(x - RADIUS, z - RADIUS, x + RADIUS, z + RADIUS, this.scratch).filter(
      (b) => x + RADIUS > b.minX && x - RADIUS < b.maxX && z + RADIUS > b.minZ && z - RADIUS < b.maxZ,
    );
  }

  private moveAxis(delta: number, axis: 0 | 2): void {
    if (delta === 0) return;
    const nx = axis === 0 ? this.x + delta : this.x;
    const nz = axis === 2 ? this.z + delta : this.z;
    let blocked = false;
    let stepTo = this.y;
    for (const b of this.overlapping(nx, nz)) {
      if (b.maxY <= this.y + 0.001 || b.minY >= this.y + this.height) continue;
      // Degrau baixo: sobe em vez de parar, se houver espaço para a cabeça.
      if (this.grounded && b.maxY - this.y <= STEP_UP) {
        stepTo = Math.max(stepTo, b.maxY);
        continue;
      }
      blocked = true;
      break;
    }
    if (blocked) {
      if (axis === 0) this.vx = 0;
      else this.vz = 0;
      return;
    }
    this.x = nx;
    this.z = nz;
    this.y = stepTo;
  }

  private moveVertical(delta: number): void {
    const ny = this.y + delta;
    this.grounded = false;
    if (delta <= 0) {
      let ground = this.world.floorY;
      for (const b of this.overlapping(this.x, this.z)) if (b.maxY <= this.y + 0.001 && b.maxY > ground) ground = b.maxY;
      if (ny <= ground) {
        this.y = ground;
        this.vy = 0;
        this.grounded = true;
        return;
      }
    } else {
      let ceiling = this.world.ceilingY;
      for (const b of this.overlapping(this.x, this.z)) if (b.minY >= this.y + this.height - 0.001 && b.minY < ceiling) ceiling = b.minY;
      if (ny + this.height >= ceiling) {
        this.y = ceiling - this.height;
        this.vy = 0;
        return;
      }
    }
    this.y = ny;
  }
}
