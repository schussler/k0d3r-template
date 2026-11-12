/** Tremor de câmera por "trauma": cresce com o evento, decai sozinho e o deslocamento cresce com o quadrado. */
const DECAY = 1.8;
const MAX_ANGLE = 0.035;

export class Shake {
  private trauma = 0;
  private t = 0;
  pitch = 0;
  yaw = 0;
  roll = 0;

  add(amount: number): void {
    this.trauma = Math.min(1, this.trauma + amount);
  }

  update(dt: number): void {
    this.t += dt;
    this.trauma = Math.max(0, this.trauma - DECAY * dt);
    const k = this.trauma * this.trauma * MAX_ANGLE;
    const t = this.t * 38;
    this.pitch = k * (Math.sin(t * 1.1) + Math.sin(t * 2.7 + 1.3) * 0.5);
    this.yaw = k * (Math.sin(t * 1.37 + 2.1) + Math.sin(t * 3.1) * 0.5);
    this.roll = k * 0.6 * Math.sin(t * 0.9 + 4);
  }

  reset(): void {
    this.trauma = 0;
  }
}
