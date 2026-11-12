import { expect, test, type Page } from '@playwright/test';
import { watchConsole } from './console';

type Info = {
  state: string;
  sector: string;
  enemies: number;
  enemyKinds: Record<string, number>;
  boss: number | null;
  bossPhase: number | null;
  maxStuck: number;
  elapsed: number;
  health: number;
  shield: number;
  weapon: string;
  mag: number;
  doorsOpen: boolean;
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
  await page.evaluate(() => console.warn('aviso injetado pelo teste'));
  await page.evaluate(() => setTimeout(() => { throw new Error('exceção injetada'); }, 0));
  await page.waitForTimeout(300);
  expect(problems.some((p) => p.includes('erro injetado pelo teste'))).toBe(true);
  expect(problems.some((p) => p.includes('aviso injetado pelo teste'))).toBe(true);
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
    expect((await info(page)).doorsOpen).toBe(false);
    await page.evaluate(() => window.__kepler!.activateSwitches());
    // O interruptor abre as portas de verdade (a saída fica passável), não só o atalho de teleporte.
    await waitFor(page, (s) => s.doorsOpen, 5000);
    await page.evaluate(() => window.__kepler!.teleportToExit());
  }

  i = await waitFor(page, (s) => s.sector === 'core' && s.state === 'playing');
  expect(i.boss).toBe(1);
  const coreElapsed = i.elapsed;
  // Três fases: derruba um terço por vez, confere a fase e deixa cada uma atacar um pouco.
  expect(i.bossPhase).toBe(1);
  await page.waitForTimeout(5000);
  await page.evaluate(() => window.__kepler!.damageBoss(0.34));
  expect((await info(page)).bossPhase).toBe(2);
  await page.waitForTimeout(5000);
  await page.evaluate(() => window.__kepler!.damageBoss(0.34));
  expect((await info(page)).bossPhase).toBe(3);
  await page.waitForTimeout(5000);
  await page.evaluate(() => window.__kepler!.damageBoss(0.34));
  i = await waitFor(page, (s) => s.state === 'victory', 10_000);
  // O tempo total segue somando na troca de setor (não zera). Valor absoluto não serve: com GPU por
  // software o passo por quadro é limitado e o cronômetro anda mais devagar que o relógio.
  expect(coreElapsed).toBeGreaterThan(5);
  expect(i.elapsed).toBeGreaterThan(coreElapsed + 3);
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
  // Entra nos laboratórios ferida (vida não regenera) e com o rifle na mão: esse é o retrato do setor.
  await page.evaluate(() => {
    window.__kepler!.hurt(80);
    window.__kepler!.giveAll();
    window.__kepler!.equip('rifle');
    window.__kepler!.activateSwitches();
  });
  await waitFor(page, (s) => s.doorsOpen && s.weapon === 'rifle', 5000);
  await page.evaluate(() => window.__kepler!.teleportToExit());
  const entry = await waitFor(page, (s) => s.sector === 'labs' && s.state === 'playing');
  expect(entry.health).toBe(70);

  // Muda o estado dentro do setor e morre.
  await page.evaluate(() => {
    window.__kepler!.equip('shotgun');
    window.__kepler!.hurt(60);
  });
  await waitFor(page, (s) => s.weapon === 'shotgun' && s.health < 70);
  await page.evaluate(() => window.__kepler!.hurt(400));
  await waitFor(page, (s) => s.state === 'dead');
  await expect(page.locator('.screen-dead')).toBeVisible();
  await page.getByRole('button', { name: 'Tentar de novo' }).click();
  const after = await waitFor(page, (s) => s.state === 'playing');
  expect(after.sector).toBe('labs');
  expect(after.health).toBe(entry.health);
  expect(after.weapon).toBe('rifle');
  expect(after.doorsOpen).toBe(false);

  // Aba oculta: o navegador dispara visibilitychange com document.hidden verdadeiro.
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await waitFor(page, (s) => s.state === 'paused');
  await expect(page.locator('.screen-pause')).toBeVisible();
  expect(problems, problems.join('\n')).toEqual([]);
});
