import type { SectorId } from './sectors';

/** Clima visual e sonoro de cada setor: luz, neblina, cores e altura do pé-direito. */
export interface Theme {
  readonly wallHeight: number;
  readonly wallBase: string;
  readonly wallSeam: string;
  readonly wallGlow: string;
  readonly floorBase: string;
  readonly floorLine: string;
  readonly hazardFloor: boolean;
  readonly fogColor: number;
  readonly fogDensity: number;
  readonly hemiSky: number;
  readonly hemiGround: number;
  readonly hemiIntensity: number;
  readonly keyColor: number;
  readonly keyIntensity: number;
  readonly lampColor: number;
  readonly lampIntensity: number;
  readonly envIntensity: number;
  readonly exposure: number;
  readonly alarm: boolean;
  readonly reverb: readonly [seconds: number, decay: number, send: number];
}

export const THEMES: Readonly<Record<SectorId, Theme>> = {
  hangar: {
    wallHeight: 11, wallBase: '#3b4553', wallSeam: '#1c222a', wallGlow: '#86dcff',
    floorBase: '#2b3139', floorLine: '#171b20', hazardFloor: true,
    fogColor: 0x0b1220, fogDensity: 0.012,
    hemiSky: 0x9cc4ff, hemiGround: 0x141a24, hemiIntensity: 0.9,
    keyColor: 0xcfe2ff, keyIntensity: 1.6, lampColor: 0xd6ecff, lampIntensity: 260,
    envIntensity: 0.55, exposure: 1.05, alarm: false, reverb: [2.8, 2.2, 0.45],
  },
  labs: {
    wallHeight: 3.6, wallBase: '#4a4f57', wallSeam: '#202328', wallGlow: '#ff4a3a',
    floorBase: '#30333a', floorLine: '#16181c', hazardFloor: false,
    fogColor: 0x120707, fogDensity: 0.03,
    hemiSky: 0xffb0a0, hemiGround: 0x1a0c0c, hemiIntensity: 0.45,
    keyColor: 0xffd6c8, keyIntensity: 0.5, lampColor: 0xff3020, lampIntensity: 45,
    envIntensity: 0.4, exposure: 1.1, alarm: true, reverb: [1.1, 3, 0.32],
  },
  greenhouse: {
    wallHeight: 7, wallBase: '#56615a', wallSeam: '#232b26', wallGlow: '#b6ff9a',
    floorBase: '#2f3a30', floorLine: '#161d17', hazardFloor: false,
    fogColor: 0x9fb7c4, fogDensity: 0.035,
    hemiSky: 0xd8f0ff, hemiGround: 0x2a3a22, hemiIntensity: 1.2,
    keyColor: 0xeaf6ff, keyIntensity: 1.8, lampColor: 0xc8ffb8, lampIntensity: 90,
    envIntensity: 0.6, exposure: 1, alarm: false, reverb: [1.8, 2.4, 0.3],
  },
  core: {
    wallHeight: 14, wallBase: '#2c2f3a', wallSeam: '#121319', wallGlow: '#ff6a1a',
    floorBase: '#23252c', floorLine: '#101115', hazardFloor: true,
    fogColor: 0x07060a, fogDensity: 0.014,
    hemiSky: 0xff9a70, hemiGround: 0x0b0a10, hemiIntensity: 0.55,
    keyColor: 0xffc49a, keyIntensity: 1.1, lampColor: 0xff7a30, lampIntensity: 320,
    envIntensity: 0.5, exposure: 1.1, alarm: false, reverb: [3.4, 2, 0.5],
  },
};
