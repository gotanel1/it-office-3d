// Optional browser verification; uses an existing Playwright installation, adds no dependency.
// PLAYWRIGHT_MODULE_PATH can point to an absolute playwright/index.mjs on a developer's machine.
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { mkdir } from 'node:fs/promises';
import { startServer } from '../packages/core/src/server.js';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE_PATH
  ? pathToFileURL(process.env.PLAYWRIGHT_MODULE_PATH).href : 'playwright');
const browser = await chromium.launch({ channel: process.env.OFFICE_BROWSER || 'chrome', headless: true });
const server = await startServer();
const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
page.setDefaultTimeout(15000);
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
const post = async (event, extra = {}) => {
  const response = await fetch(`${server.url}event`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ event, session_id: 'visual-test', cwd: 'C:/workspace/office', ...extra }),
  });
  assert.equal(response.status, 202);
};
async function waitForState(role, state) {
  await page.waitForFunction(({ role, state }) => {
    const row = [...document.querySelectorAll('.teammate')].find((el) => el.querySelector('strong').textContent === role);
    return row?.dataset.state === state;
  }, { role, state });
}
try {
  await mkdir(new URL('../docs/images/', import.meta.url), { recursive: true });
  await page.goto(`${server.url}?lang=th`);
  await page.waitForSelector('.connection[data-state="live"]');
  await page.waitForFunction(() => document.querySelector('.room-art')?.naturalWidth > 0);
  assert.equal(await page.locator('.teammate').count(), 10);
  assert.equal(await page.locator('canvas').count(), 0, 'new renderer must not require WebGL');
  assert.equal(await page.locator('.worker').count(), 11);
  await post('UserPromptSubmit');
  await post('PreToolUse', { tool: 'Edit', path: 'src/office.js', note: 'Build the cozy office scene' });
  await waitForState('Dev', 'working');
  await page.waitForFunction(() => document.querySelector('.mission-title').textContent.includes('Dev'));
  await page.locator('.teammate').filter({ hasText: /^Devกำลังทำงาน$/ }).click();
  await page.waitForSelector('.activity-list li:not(.empty)');
  assert.match(await page.locator('.office-inspector').innerText(), /office\.js/);
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('.office-inspector').isVisible(), false);
  await page.waitForSelector('.manager[data-mode="talking"]', { timeout: 15000 });
  assert.equal(await page.locator('.pm-bubble').isVisible(), true);
  await page.screenshot({ path: new URL('../docs/images/office25d-preview.png', import.meta.url).pathname.replace(/^\/(.:)/, '$1') });
  await post('PostToolUse', { tool: 'Edit', path: 'src/office.js' });
  await waitForState('Dev', 'waiting');
  await post('SubagentStop', { role: 'Dev' });
  await waitForState('Dev', 'done');
  await post('PreToolUse', { tool: 'Bash', command: 'npm audit' });
  await post('PostToolUse', { tool: 'Bash', command: 'npm audit', failed: true });
  await waitForState('Security', 'failed');
  await post('PermissionRequest', { tool: 'Bash', command: 'git status' });
  await page.waitForSelector('#hud.needs-you');
  assert.match(await page.locator('.mission-detail').innerText(), /Claude Code/);
  await post('Stop');
  await waitForState('Writer', 'done');
  await page.waitForFunction(() => document.querySelector('[role="progressbar"]').getAttribute('aria-valuenow') === '100');

  // The extension's iframe view keeps the roster and HUD, while its own reset action stays outside.
  await page.setViewportSize({ width: 960, height: 450 });
  await page.goto(`${server.url}?embed&lang=th`);
  await page.waitForSelector('.connection[data-state="live"]');
  assert.equal(await page.locator('#pipeline').isVisible(), true);
  assert.equal(await page.locator('#hud').isVisible(), true);
  assert.equal(await page.locator('#reset').isVisible(), false);
  await page.screenshot({ path: new URL('../docs/images/office25d-compact.png', import.meta.url).pathname.replace(/^\/(.:)/, '$1') });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${server.url}?lang=en`);
  await page.waitForSelector('.connection[data-state="live"]');
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.locator('.teammate').first().click();
  const panel = await page.locator('.office-inspector').boundingBox();
  assert.ok(panel.x >= 0 && panel.x + panel.width <= 390);
  await page.keyboard.press('Escape');
  await page.screenshot({ path: new URL('../docs/images/office25d-mobile.png', import.meta.url).pathname.replace(/^\/(.:)/, '$1') });
  await page.locator('#reset').click();
  await page.waitForFunction(() => [...document.querySelectorAll('.teammate')].every((row) => row.dataset.state === 'waiting'));
  assert.equal(await page.locator('#elapsed').innerText(), '00:00');

  // The unchanged session picker still reloads into a pinned session.
  await post('UserPromptSubmit', { session_id: 'session-one' });
  await post('PreToolUse', { session_id: 'session-one', tool: 'Read', path: 'README.md' });
  await post('UserPromptSubmit', { session_id: 'session-two' });
  await page.waitForSelector('.session-picker select option[value="session-one"]', { state: 'attached' });
  await page.locator('.session-picker select').selectOption('session-one');
  await page.waitForURL(/session=session-one/);
  await waitForState('SA', 'working');
  // A reduced-motion user should not receive bobbing sprites.
  await page.emulateMedia({ reducedMotion: 'reduce' });
  assert.equal(await page.locator('.worker[data-state="working"] .sprite').evaluate((el) => getComputedStyle(el).animationName), 'none');
  assert.deepEqual(errors, []);
  console.log('Browser smoke passed: assets, 10 roles, PM briefing, activity, failures, approval, completion, reset, session selection, embed, mobile and reduced motion.');
} finally {
  await browser.close();
  await server.close();
}
