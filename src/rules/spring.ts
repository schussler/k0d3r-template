/** Mola amortecida usada no coice da mira e na animação da arma: sobe com um impulso e volta ao repouso. */
export interface Spring {
  readonly offset: number;
  readonly velocity: number;
}

export const REST: Spring = { offset: 0, velocity: 0 };

// Passo máximo da integração: acima disso a mola rígida explode num quadro lento.
const MAX_SUBSTEP = 1 / 240;

export function kick(s: Spring, impulse: number): Spring {
  return { offset: s.offset, velocity: s.velocity + impulse };
}

export function updateSpring(s: Spring, stiffness: number, damping: number, dt: number): Spring {
  let { offset, velocity } = s;
  let left = dt;
  while (left > 0) {
    const h = Math.min(MAX_SUBSTEP, left);
    velocity += (-stiffness * offset - damping * velocity) * h;
    offset += velocity * h;
    left -= h;
  }
  return { offset, velocity };
}
