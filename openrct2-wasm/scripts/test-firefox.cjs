'use strict';

const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { firefox } = require('playwright');

const url = process.argv[2];
if (!url) throw new Error('usage: node scripts/test-firefox.cjs URL');
const profile = path.resolve(process.argv[3] || 'build-framework/firefox-profile');
const runtimeTimeoutMs = Math.max(30000, Number(process.env.OPENRCT2_FIREFOX_TIMEOUT_MS) || 360000);
fs.mkdirSync(profile, { recursive: true });
let browserContext;
let activePage;
const recentConsole = [];

(async () => {
  const context = browserContext = await firefox.launchPersistentContext(profile, {
    headless: true,
    viewport: { width: 1280, height: 800 }
  });
  const page = activePage = context.pages()[0] || await context.newPage();
  const pageErrors = [];
  const failedRequests = [];
  page.on('pageerror', error => pageErrors.push(String(error?.stack || error)));
  page.on('requestfailed', request => failedRequests.push(`${request.url()}: ${request.failure()?.errorText || 'failed'}`));
  page.on('console', message => {
    recentConsole.push(`[${message.type()}] ${message.text()}`);
    if (recentConsole.length > 200) recentConsole.shift();
    if (message.type() === 'error') process.stderr.write(`[firefox console] ${message.text()}\n`);
  });

  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.locator('#play').waitFor({ state: 'visible', timeout: 30000 });
  assert.equal(await page.locator('#play').isEnabled(), true, 'Play must be enabled for the provisioned volume.');
  assert.equal(await page.locator('#media-library').isVisible(), false, 'Ready media controls must be absent from the launch card.');
  assert.equal(await page.locator('#controller-row').isVisible(), false, 'Controller UI must stay hidden for non-emulator projects.');
  assert.equal(await page.title(), 'OpenRCT2');
  const manifest = await page.locator('link[rel="manifest"]').getAttribute('href');
  assert.match(manifest, /^\/app\.webmanifest(?:\?variant=openrct2)?$/);

  await page.locator('#play').click();
  await page.waitForFunction(() => {
    const draws = Number(document.documentElement.dataset.openrct2DrawCount || 0);
    const error = document.querySelector('#error');
    return draws > 0 || Boolean(error?.textContent?.trim());
  }, null, { timeout: runtimeTimeoutMs });
  assert.equal(await page.locator('#error').textContent(), '', 'Runtime reported an error before its first draw.');
  await page.waitForFunction(() => document.documentElement.dataset.openrct2State === 'menu', null, { timeout: 45000 });
  assert.equal(await page.locator('#game-canvas').isVisible(), true, 'Native canvas must be visible after the first draw.');
  assert.equal(await page.locator('html').getAttribute('data-shell-menu-cursor'), 'browser');
  assert.equal(await page.locator('html').getAttribute('data-shell-host-cursor'), 'visible');
  assert.equal(await page.locator('html').getAttribute('data-shell-input-captured'), 'false');

  async function dimensions() {
    return page.evaluate(() => {
      const canvas = document.querySelector('#game-canvas');
      const rect = canvas.getBoundingClientRect();
      return {
        width: Number(document.documentElement.dataset.openrct2CanvasWidth || 0),
        height: Number(document.documentElement.dataset.openrct2CanvasHeight || 0),
        cssWidth: Math.round(rect.width), cssHeight: Math.round(rect.height),
        state: document.documentElement.dataset.openrct2State,
        drawCount: Number(document.documentElement.dataset.openrct2DrawCount || 0),
        framebufferVariation: Number(document.documentElement.dataset.openrct2FramebufferVariation || 0),
        configBytes: Number(document.documentElement.dataset.openrct2ConfigBytes || 0),
        indexBytes: Number(document.documentElement.dataset.openrct2IndexBytes || 0),
        pointerEvents: Number(document.documentElement.dataset.openrct2PointerEvents || 0),
        keyEvents: Number(document.documentElement.dataset.openrct2KeyEvents || 0),
        audioState: document.documentElement.dataset.openrct2AudioState || '',
        audioBuffers: Number(document.documentElement.dataset.openrct2AudioBuffers || 0),
        audioFrames: Number(document.documentElement.dataset.openrct2AudioFrames || 0)
      };
    });
  }

  const initial = await dimensions();
  assert(initial.width > 0 && initial.height > 0 && initial.drawCount > 0);
  assert(initial.framebufferVariation > 128, 'The native indexed framebuffer must contain a real scene.');
  await page.waitForFunction(() =>
    document.documentElement.dataset.openrct2AudioState === 'running' &&
    Number(document.documentElement.dataset.openrct2AudioBuffers || 0) >= 5 &&
    Number(document.documentElement.dataset.openrct2AudioFrames || 0) > 0,
  null, { timeout: 30000 });
  const canvasPng = await page.locator('#game-canvas').screenshot();
  const visual = execFileSync('identify', ['-format', '%[standard-deviation] %[colors]', 'png:-'], { input: canvasPng })
    .toString().trim().split(/\s+/).map(Number);
  assert(visual[0] > 100 && visual[1] > 16,
    `The composited canvas must contain visible game pixels, got stddev=${visual[0]} colors=${visual[1]}.`);
  await page.setViewportSize({ width: 960, height: 640 });
  await page.waitForFunction(previous => {
    const width = Number(document.documentElement.dataset.openrct2CanvasWidth || 0);
    const height = Number(document.documentElement.dataset.openrct2CanvasHeight || 0);
    return width !== previous.width || height !== previous.height;
  }, initial, { timeout: 10000 });
  const resized = await dimensions();
  assert(resized.width > 0 && resized.height > 0);
  assert(Math.abs(resized.width - resized.cssWidth) <= 2, 'Native width must follow the CSS viewport.');
  assert(Math.abs(resized.height - resized.cssHeight) <= 2, 'Native height must follow the CSS viewport.');

  const canvasBox = await page.locator('#game-canvas').boundingBox();
  assert(canvasBox, 'Native canvas must have a browser layout box.');
  await page.mouse.move(canvasBox.x + canvasBox.width * 0.75, canvasBox.y + canvasBox.height * 0.25);
  await page.mouse.down({ button: 'middle' });
  await page.mouse.up({ button: 'middle' });
  await page.keyboard.down('Shift');
  await page.keyboard.up('Shift');
  await page.waitForFunction(previous => {
    const html = document.documentElement.dataset;
    return Number(html.openrct2PointerEvents || 0) >= previous.pointerEvents + 3 &&
      Number(html.openrct2KeyEvents || 0) >= previous.keyEvents + 2;
  }, resized, { timeout: 10000 });
  await page.waitForFunction(() => {
    const status = JSON.parse(document.documentElement.dataset.openrct2Persistence || '{}');
    return status.initialized === true && status.supported === true &&
      Number(document.documentElement.dataset.openrct2ConfigBytes || 0) > 0 &&
      Number(document.documentElement.dataset.openrct2IndexBytes || 0) > 0;
  }, null, { timeout: 30000 });
  await page.waitForFunction(() => {
    const status = JSON.parse(document.documentElement.dataset.openrct2Persistence || '{}');
    return status.dirty === false && Number(status.lastSavedAt || 0) > 0;
  }, null, { timeout: 30000 });
  const persistence = await page.evaluate(() => JSON.parse(document.documentElement.dataset.openrct2Persistence || '{}'));
  assert.equal(persistence.root, '/save/openrct2');
  const accepted = await dimensions();

  const databases = await page.evaluate(async () => {
    if (typeof indexedDB.databases !== 'function') return [];
    return (await indexedDB.databases()).map(database => database.name).filter(Boolean);
  });
  assert(databases.length > 0, 'Browser cache and persistence databases must be initialized.');

  await page.reload({ waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.locator('#play').waitFor({ state: 'visible', timeout: 30000 });
  assert.equal(await page.locator('#controller-row').isVisible(), false, 'Controller UI must remain hidden after reload.');
  await page.locator('#play').click();
  await page.waitForFunction(() => document.documentElement.dataset.openrct2State === 'menu', null, { timeout: runtimeTimeoutMs });
  await page.waitForFunction(() => Number(document.documentElement.dataset.openrct2ConfigBytes || 0) > 0, null, { timeout: 30000 });
  await page.waitForFunction(() =>
    document.documentElement.dataset.openrct2AudioState === 'running' &&
    Number(document.documentElement.dataset.openrct2AudioFrames || 0) > 0,
  null, { timeout: 30000 });
  const restored = await dimensions();
  assert(restored.configBytes > 0, 'Persisted OpenRCT2 config must be restored after a page reload.');
  assert(restored.indexBytes > 0, 'Persisted OpenRCT2 indexes must be restored after a page reload.');
  assert.equal(pageErrors.length, 0, `Page errors:\n${pageErrors.join('\n')}`);
  assert.equal(failedRequests.length, 0, `Failed requests:\n${failedRequests.join('\n')}`);

  console.log(JSON.stringify({ initial, resized, accepted, restored, persistence, databases, pageErrors, failedRequests }, null, 2));
})().catch(async error => {
  console.error(error && error.stack || error);
  if (activePage) {
    await activePage.evaluate(() => ({
      title: document.title,
      state: document.documentElement.dataset.openrct2State || '',
      drawCount: document.documentElement.dataset.openrct2DrawCount || '',
      loadingTitle: document.querySelector('#loading-title')?.textContent || '',
      loadingStatus: document.querySelector('#loading-status')?.textContent || '',
      loadingDetail: document.querySelector('#loading-detail')?.textContent || '',
      error: document.querySelector('#error')?.textContent || '',
      console: document.querySelector('#loading-console')?.textContent || ''
    })).then(value => console.error(JSON.stringify({ diagnostic: value, recentConsole }, null, 2))).catch(() => undefined);
  }
  process.exitCode = 1;
}).finally(async () => {
  await browserContext?.close().catch(() => undefined);
});
