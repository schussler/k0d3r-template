import { expect, test } from '@playwright/test';
import { boot, hook, trackErrors } from './helpers';

interface Robot { kind: string; mode: string; health: number }
interface State { mode: string; enemies: number; health: number }

test('hangar: robôs patrulham, ouvem o tiro, entram em combate e morrem sem erro no console', async ({ page }) => {
  const errors = trackErrors(page);
  await boot(page);
  await hook(page, 'start');
  await expect.poll(async () => (await hook<State>(page, 'state')).mode, { timeout: 20_000 }).toBe('playing');
  await hook(page, 'god', true);

  const robots = await hook<Robot[]>(page, 'robots');
  expect(robots.map((r) => r.kind).sort()).toEqual(['drone', 'drone', 'drone', 'sentinel', 'sentinel']);
  expect(robots.every((r) => r.mode === 'patrol')).toBe(true);

  // Um tiro é ouvido: ninguém fica em patrulha por muito tempo.
  await hook(page, 'teleport', 33, 24);
  await hook(page, 'mouse', true);
  await page.waitForTimeout(150);
  await hook(page, 'mouse', false);
  await expect
    .poll(async () => (await hook<Robot[]>(page, 'robots')).some((r) => r.mode === 'alert' || r.mode === 'combat'), { timeout: 20_000 })
    .toBe(true);

  await hook(page, 'killAll');
  await expect.poll(async () => (await hook<State>(page, 'state')).enemies, { timeout: 10_000 }).toBe(0);
  await page.waitForTimeout(1500);
  expect(errors).toEqual([]);
});
