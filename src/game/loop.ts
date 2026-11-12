/**
 * Laço de quadro com proteção: qualquer exceção para o laço, vai para o console com contexto e chega à tela de
 * erro, em vez de travar em silêncio.
 */
const MAX_DT = 0.05;

export function startLoop(frame: (dt: number, now: number) => void, onError: (err: unknown) => void): () => void {
  let last = performance.now();
  let running = true;
  let id = 0;
  const tick = (now: number) => {
    if (!running) return;
    const dt = Math.min(MAX_DT, Math.max(0, (now - last) / 1000));
    last = now;
    try {
      frame(dt, now / 1000);
    } catch (err) {
      running = false;
      console.error('Erro no laço do jogo; o jogo foi parado.', err);
      onError(err);
      return;
    }
    id = requestAnimationFrame(tick);
  };
  id = requestAnimationFrame(tick);
  return () => {
    running = false;
    cancelAnimationFrame(id);
  };
}
