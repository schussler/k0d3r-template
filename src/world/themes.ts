import type { SectorId } from '../logic/flow';
import type { PanelStyle } from './textures';

export interface Theme {
  readonly wall: PanelStyle;
  readonly floor: { readonly base: string; readonly line: string };
  readonly crate: { readonly base: string; readonly edge: string; readonly mark: string };
  readonly hemiSky: number;
  readonly hemiGround: number;
  readonly hemiIntensity: number;
  readonly keyColor: number;
  readonly keyIntensity: number;
  readonly pointColor: number;
  readonly pointIntensity: number;
  readonly stripColor: number;
  readonly fogColor: number;
  readonly fogDensity: number;
  readonly envIntensity: number;
  readonly bloom: { readonly strength: number; readonly threshold: number };
  readonly background: number;
}

export const THEMES: Readonly<Record<SectorId, Theme>> = {
  hangar: {
    wall: { base: '#5d6874', seam: '#2a3038', light: '#9aa8b6', stripe: '#3d8fd8' },
    floor: { base: '#3b424a', line: '#1d2228' },
    crate: { base: '#4c6b85', edge: '#26394a', mark: '#e7eef5' },
    hemiSky: 0xbfd8ff,
    hemiGround: 0x1b2430,
    hemiIntensity: 0.9,
    keyColor: 0xd8e8ff,
    keyIntensity: 2.2,
    pointColor: 0x9cc8ff,
    pointIntensity: 60,
    stripColor: 0x6fc3ff,
    fogColor: 0x0b1420,
    fogDensity: 0.006,
    envIntensity: 0.45,
    bloom: { strength: 0.55, threshold: 0.82 },
    background: 0x02040a,
  },
  labs: {
    wall: { base: '#a9adb3', seam: '#5a5f66', light: '#d9dde2', stripe: '#c0392b' },
    floor: { base: '#55595f', line: '#2d3035' },
    crate: { base: '#8a8f96', edge: '#45494f', mark: '#b3261e' },
    hemiSky: 0xffe4e0,
    hemiGround: 0x2a1a1a,
    hemiIntensity: 0.45,
    keyColor: 0xffeeee,
    keyIntensity: 0.6,
    pointColor: 0xff2a1a,
    pointIntensity: 40,
    stripColor: 0xff2a1a,
    fogColor: 0x120606,
    fogDensity: 0.02,
    envIntensity: 0.3,
    bloom: { strength: 0.7, threshold: 0.78 },
    background: 0x050202,
  },
  greenhouse: {
    wall: { base: '#6f7d6c', seam: '#33402f', light: '#b8c9a8', stripe: '#a54fd6' },
    floor: { base: '#3e4a3b', line: '#1f281d' },
    crate: { base: '#6e7d5a', edge: '#39432b', mark: '#e9f2d8' },
    hemiSky: 0xcfe9ff,
    hemiGround: 0x283a22,
    hemiIntensity: 0.9,
    keyColor: 0xdff0ff,
    keyIntensity: 1.6,
    pointColor: 0xd27bff,
    pointIntensity: 45,
    stripColor: 0xd27bff,
    fogColor: 0x7d97a8,
    fogDensity: 0.028,
    envIntensity: 0.5,
    bloom: { strength: 0.5, threshold: 0.85 },
    background: 0x02040a,
  },
  core: {
    wall: { base: '#2d3140', seam: '#11131a', light: '#5b6380', stripe: '#7b5cff' },
    floor: { base: '#20232d', line: '#0c0d12' },
    crate: { base: '#3a3f55', edge: '#1a1d28', mark: '#9fe8ff' },
    hemiSky: 0x9a8cff,
    hemiGround: 0x0b0a14,
    hemiIntensity: 0.5,
    keyColor: 0xb8b0ff,
    keyIntensity: 1.2,
    pointColor: 0x6a4cff,
    pointIntensity: 70,
    stripColor: 0x44e0ff,
    fogColor: 0x0a0716,
    fogDensity: 0.012,
    envIntensity: 0.35,
    bloom: { strength: 0.8, threshold: 0.75 },
    background: 0x030208,
  },
};
