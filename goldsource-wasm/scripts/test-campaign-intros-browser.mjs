#!/usr/bin/env node
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const cdpBase = process.env.GOLDSOURCE_CDP || 'http://127.0.0.1:9225';
const gameBase = process.env.GOLDSOURCE_TEST_URL || 'http://127.0.0.1:4300';
const timeoutMs = Number(process.env.GOLDSOURCE_TEST_TIMEOUT || 180000);
const frameTime = String(process.env.GOLDSOURCE_INTRO_FRAME_TIME || '0.1');
const outputIndex = process.argv.indexOf('--output');
const outputPath = outputIndex < 0 ? '' : String(process.argv[outputIndex + 1] || '').trim();
if (outputIndex >= 0) assert(outputPath, '--output requires a report path.');

const campaigns = Object.freeze([
  Object.freeze({
    variant: 'half-life', initial: 'c0a0', terminal: 'c0a0e',
    expected: Object.freeze(['c0a0', 'c0a0a', 'c0a0b', 'c0a0c', 'c0a0d', 'c0a0e'])
  }),
  Object.freeze({
    variant: 'blue-shift', initial: 'ba_tram1', terminal: 'ba_tram3',
    expected: Object.freeze(['ba_tram1', 'ba_tram2', 'ba_tram3'])
  }),
  Object.freeze({
    variant: 'opposing-force', initial: 'of0a0', terminal: 'of1a1',
    expected: Object.freeze(['of0a0', 'of1a1'])
  })
]);

const delay = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

async function json(url, options) {
  const response = await fetch(url, options);
  if (!response.ok) throw new Error(`${options?.method || 'GET'} ${url}: ${response.status} ${await response.text()}`);
  return response.json();
}

class CdpPage {
  constructor(target) {
    this.target = target;
    this.sequence = 0;
    this.pending = new Map();
    this.logs = [];
  }

  async connect() {
    this.socket = new WebSocket(this.target.webSocketDebuggerUrl);
    this.socket.addEventListener('message', event => {
      const message = JSON.parse(event.data);
      if (message.method === 'Runtime.consoleAPICalled') {
        this.logs.push(message.params.args.map(argument => argument.value ?? argument.description ?? '').join(' '));
        this.logs = this.logs.slice(-100);
        return;
      }
      if (message.method === 'Runtime.exceptionThrown') {
        this.logs.push(message.params.exceptionDetails.exception?.description || message.params.exceptionDetails.text);
        this.logs = this.logs.slice(-100);
        return;
      }
      if (!message.id || !this.pending.has(message.id)) return;
      const pending = this.pending.get(message.id);
      this.pending.delete(message.id);
      if (message.error) pending.reject(new Error(message.error.message || JSON.stringify(message.error)));
      else pending.resolve(message.result);
    });
    await new Promise((resolve, reject) => {
      this.socket.addEventListener('open', resolve, { once: true });
      this.socket.addEventListener('error', reject, { once: true });
    });
    await this.call('Runtime.enable');
    await this.call('Page.enable');
    await this.call('Page.bringToFront');
    return this;
  }

  call(method, params = {}) {
    const id = ++this.sequence;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  async evaluate(expression) {
    const result = await this.call('Runtime.evaluate', {
      expression, awaitPromise: true, returnByValue: true
    });
    if (result.exceptionDetails) {
      throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text || 'Browser evaluation failed.');
    }
    return result.result.value;
  }

  async waitFor(description, predicate, limit = timeoutMs) {
    const deadline = Date.now() + limit;
    let last;
    while (Date.now() < deadline) {
      last = await this.evaluate(`(() => ({
        ready: !document.getElementById('play')?.disabled,
        state: document.documentElement.dataset.goldsourceState || '',
        shell: document.documentElement.dataset.shellEngineState || '',
        running: Boolean(globalThis.__csXash?.running),
        error: document.getElementById('error')?.textContent || '',
        last: globalThis.__goldsourceLastEngineLine || ''
      }))()`).catch(() => null);
      if (last?.error) throw new Error(last.error);
      if (last && predicate(last)) return last;
      await delay(100);
    }
    throw new Error(`Timed out waiting for ${description}; last=${JSON.stringify(last)} console=${JSON.stringify(this.logs)}`);
  }

  async close() {
    try { this.socket?.close(); } catch (_) { /* already closed */ }
    await fetch(`${cdpBase}/json/close/${this.target.id}`).catch(() => undefined);
  }
}

async function newPage(url) {
  const target = await json(`${cdpBase}/json/new?${encodeURIComponent(url)}`, { method: 'PUT' });
  return new CdpPage(target).connect();
}

async function closeStalePages() {
  for (const target of await json(`${cdpBase}/json/list`)) {
    if (target.type === 'page' && target.url.startsWith(`${gameBase}/?`) &&
        (target.url.includes('campaignproof=') || target.url.includes('introproof='))) {
      await fetch(`${cdpBase}/json/close/${target.id}`).catch(() => undefined);
    }
  }
}

function uniqueInOrder(values) {
  return values.filter((value, index) => index === 0 || value !== values[index - 1]);
}

async function proveCampaign(campaign) {
  const page = await newPage(`${gameBase}/?game=${campaign.variant}&campaignproof=1`);
  const startedAt = Date.now();
  try {
    await page.waitFor(`${campaign.variant} owner data validation`, value => value.ready);
    await page.evaluate(`document.getElementById('play').click()`);
    await page.waitFor(`${campaign.variant} native menu`, value => value.running && value.state === 'menu');
    await page.evaluate(`(() => {
      globalThis.__goldsourceEngineHistory = [];
      globalThis.__csXash.Cmd_ExecuteString(${JSON.stringify(`map ${campaign.initial}`)});
    })()`);
    await page.waitFor(`${campaign.variant} intro map`, value => value.state === 'gameplay');
    await page.evaluate(`globalThis.__csXash.Cmd_ExecuteString(${JSON.stringify(`host_framerate ${frameTime}`)})`);

    const transitions = [];
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      await page.evaluate(`globalThis.__csXash.Cmd_ExecuteString('status')`);
      await delay(700);
      const telemetry = await page.evaluate(`(() => {
        const history = globalThis.__goldsourceEngineHistory || [];
        const maps = history.map(line => line.match(/map: (\\S+)/)?.[1]).filter(Boolean);
        return {
          state: document.documentElement.dataset.goldsourceState || '',
          map: maps.at(-1) || '',
          fatal: history.filter(line => /Host_Error|Sys_Error|FATAL/i.test(line))
        };
      })()`);
      assert.deepEqual(telemetry.fatal, [], `${campaign.variant} emitted a fatal engine error`);
      if (telemetry.map && transitions.at(-1)?.map !== telemetry.map) {
        transitions.push({ map: telemetry.map, elapsedMs: Date.now() - startedAt });
        process.stdout.write(`${campaign.variant}: ${telemetry.map} (${transitions.at(-1).elapsedMs} ms)\n`);
      }
      if (telemetry.map === campaign.terminal) {
        assert.equal(telemetry.state, 'gameplay', `${campaign.variant} terminal map is not playable`);
        break;
      }
      await delay(300);
    }

    const maps = uniqueInOrder(transitions.map(transition => transition.map));
    assert.deepEqual(maps, campaign.expected, `${campaign.variant} intro map sequence regressed or looped`);
    return Object.freeze({
      variant: campaign.variant,
      initialMap: campaign.initial,
      terminalMap: campaign.terminal,
      state: 'gameplay',
      transitions,
      fatalErrors: []
    });
  } finally {
    await page.close();
  }
}

await closeStalePages();
const browser = await json(`${cdpBase}/json/version`);
const results = [];
for (const campaign of campaigns) results.push(await proveCampaign(campaign));
const report = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  browser: { product: browser.Browser, debuggerUrl: browser.webSocketDebuggerUrl },
  gameBase,
  acceleratedFrameTime: Number(frameTime),
  passed: results.length,
  failed: 0,
  results
};
if (outputPath) {
  await mkdir(path.dirname(path.resolve(outputPath)), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`);
}
process.stdout.write(`GoldSrc campaign intro proof passed ${results.length}/${campaigns.length}.\n`);
