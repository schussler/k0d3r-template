import type { Page } from '@playwright/test';

/**
 * Coleta tudo que o critério "console sem erro" proíbe: console.error, console.warn e exceções da página.
 * Avisos de ambiente do navegador de teste (GPU por software) não são do jogo e ficam de fora pela origem.
 */
export function watchConsole(page: Page): string[] {
  const problems: string[] = [];
  const ignored = [/GPU stall due to ReadPixels/, /Automatic fallback to software WebGL/, /GroupMarkerNotSet/];
  page.on('console', (msg) => {
    if (msg.type() !== 'error' && msg.type() !== 'warning') return;
    const text = msg.text();
    if (ignored.some((r) => r.test(text))) return;
    problems.push(`[${msg.type()}] ${text}`);
  });
  page.on('pageerror', (err) => problems.push(`[pageerror] ${err.message}`));
  return problems;
}
