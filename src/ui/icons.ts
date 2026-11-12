import type { WeaponId } from '../rules/arsenal';

/** Ícones SVG desenhados à mão (caminhos no código, sem biblioteca e sem emoji). viewBox 0 0 64 24 nas armas. */
export const WEAPON_ICON: Readonly<Record<WeaponId, string>> = {
  pistol: 'M14 6h30l2 2v4H30l-2 2v2h-3l-1 6h-7l2-9-4-1V8z M44 9h4v2h-4z',
  rifle: 'M2 9h8l2-2h26l2-2h8v2h12v3H48l-2 2h-6l-2 6h-5l1-6h-7l-3 7h-6l2-7h-8l-4 4H2z',
  shotgun: 'M2 8h10l3 2h44v3H38l-1 2H18l-4 4H6l3-5H2z M38 15h14v2H38z',
};

export const ICON = {
  health: 'M9 2h6v7h7v6h-7v7H9v-7H2V9h7z',
  shield: 'M12 2l9 3v6c0 6-4 10-9 11C7 21 3 17 3 11V5z',
  infinity: 'M6 12c0-3 2-5 4.5-5 4 0 6 10 11 10 2.5 0 4.5-2 4.5-5s-2-5-4.5-5c-5 0-7 10-11 10C8 17 6 15 6 12z',
  sector: 'M4 4h16v16H4z M8 8h8v8H8z',
  ammo: 'M8 3h4l2 4v14H6V7z M6 9h8',
  arrow: 'M12 2l7 10h-4v10H9V12H5z',
};

export function svg(viewBox: string, inner: string, cls = ''): string {
  return `<svg class="${cls}" viewBox="${viewBox}" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${inner}</svg>`;
}

export function path(d: string, cls = ''): string {
  return `<path class="${cls}" d="${d}"/>`;
}
