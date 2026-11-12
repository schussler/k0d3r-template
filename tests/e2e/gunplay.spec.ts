import { expect, test } from '@playwright/test';
import { boot, hook, tap, trackErrors } from './helpers';

interface State { mode: string; weapon: string; owned: string[]; mag: number }

test('título → jogo: as três armas atiram, trocam e recarregam sem erro no console', async ({ page }) => {
  const errors = trackErrors(page);
  await boot(page);
  await expect(page.getByRole('button', { name: 'JOGAR' })).toBeVisible();
  await hook(page, 'start');
  await expect.poll(async () => (await hook<State>(page, 'state')).mode, { timeout: 20_000 }).toBe('playing');
  await hook(page, 'giveAll');

  for (const [key, weapon] of [['Digit1', 'pistol'], ['Digit2', 'rifle'], ['Digit3', 'shotgun']] as const) {
    await tap(page, key);
    await expect.poll(async () => (await hook<State>(page, 'state')).weapon).toBe(weapon);
    await page.waitForTimeout(500);
    const before = (await hook<State>(page, 'state')).mag;
    await hook(page, 'mouse', true);
    await page.waitForTimeout(weapon === 'rifle' ? 350 : 60);
    await page.screenshot({ path: `test-results/disparo-${weapon}.png` });
    await hook(page, 'mouse', false);
    await expect.poll(async () => (await hook<State>(page, 'state')).mag).toBeLessThan(before);
    await tap(page, 'KeyR');
    await expect.poll(async () => (await hook<State>(page, 'state')).mag, { timeout: 20_000 }).toBe(before);
  }
  expect(errors).toEqual([]);
});
