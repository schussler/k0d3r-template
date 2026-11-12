import { expect, test } from '@playwright/test';
import { boot, hook, tap, trackErrors } from './helpers';

interface State { mode: string; enemies: number; health: number; shield: number; owned: string[] }
interface Flow { sector: number; exitOpen: boolean; elapsed: number; deaths: number; switches: boolean[]; bossPhase: number }
interface Sw { index: number; x: number; z: number; pressed: boolean; stand: { x: number; z: number } }
interface Pt { x: number; z: number }

const flow = (page: Parameters<typeof hook>[0]) => hook<Flow>(page, 'flow');

async function start(page: Parameters<typeof hook>[0]): Promise<void> {
  await boot(page);
  await hook(page, 'start');
  await expect.poll(async () => (await hook<State>(page, 'state')).mode).toBe('playing');
}

/** Leva o jogador à saída e espera a transição para o setor seguinte. */
async function takeExit(page: Parameters<typeof hook>[0], next: number): Promise<void> {
  const exit = await hook<Pt | null>(page, 'exit');
  expect(exit).not.toBeNull();
  await hook(page, 'teleport', exit?.x ?? 0, exit?.z ?? 0);
  await expect.poll(async () => (await flow(page)).sector, { timeout: 15_000 }).toBe(next);
  await expect.poll(async () => (await hook<State>(page, 'state')).mode).toBe('playing');
}

test('partida completa: hangar → laboratórios → estufa → núcleo → vitória, sem erro no console', async ({ page }) => {
  const errors = trackErrors(page);
  await start(page);
  await hook(page, 'god', true);

  // Setor 1: a saída só abre com o setor limpo.
  expect((await flow(page)).exitOpen).toBe(false);
  await hook(page, 'killAll');
  await expect.poll(async () => (await flow(page)).exitOpen).toBe(true);
  await takeExit(page, 1);

  // Setor 2: três interruptores abrem as portas e, o último, a saída.
  expect((await flow(page)).exitOpen).toBe(false);
  for (const sw of await hook<Sw[]>(page, 'switches')) {
    await hook(page, 'teleport', sw.stand.x, sw.stand.z);
    await page.waitForTimeout(150);
    await tap(page, 'KeyE');
    await expect.poll(async () => (await flow(page)).switches[sw.index]).toBe(true);
  }
  await expect.poll(async () => (await flow(page)).exitOpen).toBe(true);
  await takeExit(page, 2);

  // Setor 3: limpar o setor.
  await hook(page, 'killAll');
  await expect.poll(async () => (await flow(page)).exitOpen).toBe(true);
  await takeExit(page, 3);

  // Núcleo: o chefe tem fases; derrotá-lo leva à tela de vitória com o tempo total.
  await expect.poll(async () => (await flow(page)).bossPhase).toBe(1);
  await hook(page, 'killAll');
  await expect(page.getByRole('heading', { name: 'VITÓRIA' })).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('.screen .body')).toContainText('Tempo total: 00:');
  expect(errors).toEqual([]);
});

test('pausa para o tempo e continua; morrer oferece tentar de novo do começo do setor', async ({ page }) => {
  const errors = trackErrors(page);
  await start(page);

  await hook(page, 'pause');
  await expect(page.getByRole('heading', { name: 'PAUSADO' })).toBeVisible();
  const paused = (await flow(page)).elapsed;
  await page.waitForTimeout(800);
  expect((await flow(page)).elapsed).toBe(paused);
  await page.getByRole('button', { name: 'CONTINUAR' }).click();
  await expect.poll(async () => (await hook<State>(page, 'state')).mode).toBe('playing');

  await hook(page, 'jump', 1);
  await hook(page, 'hurt', 400);
  await expect(page.getByRole('heading', { name: 'VOCÊ MORREU' })).toBeVisible();
  expect((await flow(page)).deaths).toBe(1);
  await page.getByRole('button', { name: 'TENTAR DE NOVO' }).click();
  await expect.poll(async () => (await hook<State>(page, 'state')).mode).toBe('playing');
  const after = await flow(page);
  expect(after.sector).toBe(1);
  expect(after.deaths).toBe(1);
  expect((await hook<State>(page, 'state')).health).toBeGreaterThanOrEqual(30);
  expect(errors).toEqual([]);
});
