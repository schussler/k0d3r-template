import type { Page } from '@playwright/test';

/** Coleta todo erro de console e de página: o critério de aceite é zero erro durante a partida. */
export function trackErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(e.message));
  return errors;
}

export async function hook<T>(page: Page, fn: string, ...args: unknown[]): Promise<T> {
  return page.evaluate(([name, a]) => {
    const k = (window as unknown as { __kepler: Record<string, (...x: unknown[]) => unknown> }).__kepler;
    const f = k[name];
    if (!f) throw new Error(`gancho ${String(name)} ausente`);
    return f(...(a)) as T;
  }, [fn, args] as const);
}

export async function tap(page: Page, code: string): Promise<void> {
  await hook(page, 'key', code, true);
  await page.waitForTimeout(40);
  await hook(page, 'key', code, false);
}

export async function boot(page: Page): Promise<void> {
  await page.goto('/');
  await page.waitForFunction(() => 'window' in globalThis && (window as unknown as { __kepler?: unknown }).__kepler !== undefined);
}
