import { expect, test, type Page } from '@playwright/test';
import { watchConsole } from './console';

type Info = {
  state: string;
  sector: string;
  enemies: number;
  enemyKinds: Record<string, number>;
  boss: number | null;
  maxStuck: number;
  elapsed: number;
  health: number;
};

const info = (page: Page): Promise<Info> => page.evaluate(() => window.__kepler!.info() as Info);

async function waitFor(page: Page, check: (i: Info) => boolean, timeout = 20_000): Promise<Info> {
  const start = Date.now();
  for (;;) {
    const i = await info(page);
    if (check(i)) return i;
    if (Date.now() - start > timeout) throw new Error(`tempo esgotado esperando estado; último: ${JSON.stringify(i)}`);
    await page.waitForTimeout(250);
  }
}

test('o detector de console pega um erro de verdade (controle)', async ({ page }) => {
  const problems = watchConsole(page);
  await page.goto('/?debug');
  await page.evaluate(() => console.error('erro injetado pelo teste'));
  await page.evaluate(() => setTimeout(() => { throw new Error('exceção injetada'); }, 0));
  await page.waitForTimeout(300);
  expect(problems.some((p) => p.includes('erro injetado pelo teste'))).toBe(true);
  expect(problems.some((p) => p.includes('exceção injetada'))).toBe(true);
});

test('partida completa: hangar → laboratórios → estufa → núcleo → vitória, sem erro no console', async ({ page }) => {
  const problems = watchConsole(page);
  await page.goto('/?debug');
  await expect(page.locator('.screen-title')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Jogar' })).toBeVisible();
  await page.waitForTimeout(1500);

  await page.evaluate(() => {
    window.__kepler!.start();
    window.__kepler!.setGodMode(true);
  });
  let i = await waitFor(page, (s) => s.state === 'playing' && s.sector === 'hangar');
  expect(i.enemyKinds).toMatchObject({ drone: 3, sentinel: 2 });

  // Combate de verdade por alguns segundos em cada setor: robôs patrulham, ouvem o tiro e atacam.
  for (const sector of ['hangar', 'labs', 'greenhouse']) {
    await waitFor(page, (s) => s.sector === sector && s.state === 'playing');
    for (let n = 0; n < 10; n++) {
      await page.evaluate(() => window.__kepler!.shootNearest());
      await page.waitForTimeout(300);
    }
    await page.waitForTimeout(3000);
    i = await info(page);
    // Nenhum robô preso em parede por mais de 2 s (critério 12).
    expect(i.maxStuck, `robô preso em ${sector}`).toBeLessThanOrEqual(2);
    await page.evaluate(() => window.__kepler!.activateSwitches());
    await page.waitForTimeout(1200);
    await page.evaluate(() => window.__kepler!.teleportToExit());
  }

  i = await waitFor(page, (s) => s.sector === 'core' && s.state === 'playing');
  expect(i.boss).toBe(1);
  // Três fases: derruba um terço por vez e deixa cada fase atacar um pouco.
  for (let phase = 0; phase < 3; phase++) {
    await page.waitForTimeout(5000);
    await page.evaluate(() => window.__kepler!.damageBoss(0.34));
  }
  i = await waitFor(page, (s) => s.state === 'victory', 10_000);
  // O tempo total inclui todos os setores (não zera na troca).
  expect(i.elapsed).toBeGreaterThan(20);
  await expect(page.locator('.screen-victory')).toBeVisible();
  await expect(page.locator('.screen-victory [data-field="time"]')).toHaveText(/^\d{2}:\d{2}\.\d$/);

  expect(problems, problems.join('\n')).toEqual([]);
});

test('morrer e tentar de novo volta ao retrato da entrada do setor; aba oculta pausa', async ({ page }) => {
  const problems = watchConsole(page);
  await page.goto('/?debug');
  await page.waitForTimeout(800);
  await page.evaluate(() => window.__kepler!.start());
  await waitFor(page, (s) => s.state === 'playing');
  await page.evaluate(() => window.__kepler!.hurt(400));
  await waitFor(page, (s) => s.state === 'dead');
  await expect(page.locator('.screen-dead')).toBeVisible();
  await page.getByRole('button', { name: 'Tentar de novo' }).click();
  const after = await waitFor(page, (s) => s.state === 'playing');
  expect(after.health).toBe(100);
  expect(after.sector).toBe('hangar');

  // Aba oculta: o navegador dispara visibilitychange com document.hidden verdadeiro.
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await waitFor(page, (s) => s.state === 'paused');
  await expect(page.locator('.screen-pause')).toBeVisible();
  expect(problems, problems.join('\n')).toEqual([]);
});
