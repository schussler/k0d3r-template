import type { WeaponId } from '../logic/weapons';

/** Ícones em SVG desenhados à mão (sem biblioteca de ícones e sem emoji). `currentColor` herda a cor. */

export const ICON_HEALTH = `
<svg viewBox="0 0 24 24" aria-hidden="true">
  <path d="M9 3h6v6h6v6h-6v6H9v-6H3V9h6z" fill="currentColor" opacity="0.92"/>
  <path d="M9 3h6v6h6v6h-6v6H9v-6H3V9h6z" fill="none" stroke="rgba(0,0,0,.45)" stroke-width="1"/>
</svg>`;

export const ICON_SHIELD = `
<svg viewBox="0 0 24 24" aria-hidden="true">
  <path d="M12 2l8 3.2v6.1c0 5-3.4 8.6-8 10.7-4.6-2.1-8-5.7-8-10.7V5.2z" fill="currentColor" opacity="0.9"/>
  <path d="M12 5.4l5 2v4c0 3.2-2 5.6-5 7.1" fill="none" stroke="rgba(255,255,255,.55)" stroke-width="1.4" stroke-linecap="round"/>
</svg>`;

export const ICON_AMMO = `
<svg viewBox="0 0 24 24" aria-hidden="true">
  <g fill="currentColor">
    <path d="M5 9c0-3 1.2-5 2-6 .8 1 2 3 2 6v11H5z"/>
    <path d="M10 9c0-3 1.2-5 2-6 .8 1 2 3 2 6v11h-4z"/>
    <path d="M15 9c0-3 1.2-5 2-6 .8 1 2 3 2 6v11h-4z"/>
  </g>
</svg>`;

export const WEAPON_ICONS: Readonly<Record<WeaponId, string>> = {
  pistol: `
<svg viewBox="0 0 64 32" aria-hidden="true">
  <path d="M6 8h40l4 2v5H28l-2 3h-4l-3 10h-9l3-12-5-1V9z" fill="currentColor"/>
  <path d="M10 11h34" stroke="rgba(0,0,0,.35)" stroke-width="1.5"/>
  <rect x="44" y="6" width="3" height="2" fill="currentColor"/>
</svg>`,
  rifle: `
<svg viewBox="0 0 96 32" aria-hidden="true">
  <path d="M4 12h10l4-3h44l2-2h6v2h18v4H70v4H52l-4 9h-7l2-9h-6l-5 4h-6l3-6H18l-6 9H3l4-9z" fill="currentColor"/>
  <path d="M38 17l-3 10h6l3-10z" fill="currentColor" opacity="0.75"/>
  <path d="M22 12h40" stroke="rgba(0,0,0,.35)" stroke-width="1.5"/>
</svg>`,
  shotgun: `
<svg viewBox="0 0 96 32" aria-hidden="true">
  <path d="M3 15l12-4h18l3-2h56v4H40v3h40v3H40l-4 1H22l-8 9H5l6-8z" fill="currentColor"/>
  <rect x="44" y="16" width="20" height="5" rx="2" fill="currentColor" opacity="0.7"/>
  <path d="M36 11h56" stroke="rgba(0,0,0,.35)" stroke-width="1.2"/>
</svg>`,
};

/**
 * Logotipo: anel da estação com a órbita do planeta. O id do gradiente é por instância: com dois logos na
 * página, um url(#id) repetido apontaria para o primeiro, que pode estar oculto (e então nada é pintado).
 */
export const logo = (id: string): string => `
<svg viewBox="0 0 120 120" aria-hidden="true">
  <defs>
    <radialGradient id="${id}" cx="40%" cy="35%" r="70%">
      <stop offset="0" stop-color="#eaf6ff"/>
      <stop offset="0.6" stop-color="#7fb2d6"/>
      <stop offset="1" stop-color="#1d3550"/>
    </radialGradient>
  </defs>
  <circle cx="60" cy="60" r="26" fill="url(#${id})"/>
  <ellipse cx="60" cy="60" rx="52" ry="16" fill="none" stroke="#5ff2ff" stroke-width="3" transform="rotate(-18 60 60)"/>
  <path d="M14 70a52 16 -18 0 0 92 -28" fill="none" stroke="#5ff2ff" stroke-width="3" opacity="0.35" transform="rotate(0 60 60)"/>
  <g transform="rotate(-18 60 60)">
    <rect x="102" y="54" width="10" height="12" rx="2" fill="#f2a33a"/>
    <rect x="98" y="58" width="4" height="4" fill="#f2a33a"/>
  </g>
</svg>`;

/** Mira: cada traço parte da origem e o CSS o afasta pela variável --gap (1 unidade = 1 px). */
export const CROSSHAIR = `
<svg viewBox="-50 -50 100 100" aria-hidden="true">
  <g stroke="currentColor" stroke-width="2.4" stroke-linecap="round">
    <line class="ch-top" x1="0" y1="0" x2="0" y2="-10"/>
    <line class="ch-bottom" x1="0" y1="0" x2="0" y2="10"/>
    <line class="ch-left" x1="0" y1="0" x2="-10" y2="0"/>
    <line class="ch-right" x1="0" y1="0" x2="10" y2="0"/>
  </g>
  <circle r="1.6" fill="currentColor"/>
</svg>`;

export const HITMARKER = `
<svg viewBox="-50 -50 100 100" aria-hidden="true">
  <g stroke="currentColor" stroke-width="3.4" stroke-linecap="round">
    <line x1="-7" y1="-7" x2="-17" y2="-17"/>
    <line x1="7" y1="-7" x2="17" y2="-17"/>
    <line x1="-7" y1="7" x2="-17" y2="17"/>
    <line x1="7" y1="7" x2="17" y2="17"/>
  </g>
</svg>`;

/** Arco do indicador de direção do dano (girado em volta da mira). */
export const DAMAGE_ARC = `
<svg viewBox="-100 -100 200 200" aria-hidden="true">
  <path d="M-34 -84 A92 92 0 0 1 34 -84" fill="none" stroke="#ff3b30" stroke-width="9" stroke-linecap="round"/>
</svg>`;

/** Mão apertando botão, para o aviso de interação. */
export const ICON_HAND = `
<svg viewBox="0 0 24 24" aria-hidden="true">
  <path d="M9 11V4.5a1.5 1.5 0 013 0V10h.5V6.5a1.5 1.5 0 013 0V10h.5V8a1.5 1.5 0 013 0v6c0 4-2.5 7-6.5 7S8 19 6.5 16L4 12.5a1.4 1.4 0 012.2-1.7z" fill="currentColor"/>
</svg>`;
