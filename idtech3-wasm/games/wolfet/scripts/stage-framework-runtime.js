#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const fsp = require('node:fs/promises');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

const EXPECTED_VERSION = '0.9.4';

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      server.close((error) => error ? reject(error) : resolve(port));
    });
  });
}

async function fetchReady(url, child) {
  let lastError;
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (child.exitCode !== null) {
      throw new Error('Canonical framework server exited before staging completed.');
    }
    try {
      const response = await fetch(url);
      if (response.ok) return response;
      lastError = new Error('HTTP ' + response.status);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw lastError || new Error('Canonical framework server did not become ready.');
}

async function main() {
  const frameworkRoot = path.resolve(process.argv[2] || '');
  const siteRoot = path.resolve(process.argv[3] || 'web');
  const shellRoot = path.resolve(process.argv[4] || '.generated/shared-shell');
  const outputRoot = path.resolve(process.argv[5] || '.generated/framework-runtime');
  const metadata = JSON.parse(fs.readFileSync(path.join(frameworkRoot, 'package.json'), 'utf8'));
  if (metadata.version !== EXPECTED_VERSION) {
    throw new Error('Expected wasm-game-framework ' + EXPECTED_VERSION + ', found ' + metadata.version + '.');
  }

  const temporaryData = await fsp.mkdtemp(path.join(os.tmpdir(), 'wolfet-framework-stage-'));
  const port = await freePort();
  const child = spawn(process.execPath, [path.join(frameworkRoot, 'server', 'static-server.js')], {
    env: Object.assign({}, process.env, {
      WASM_GAME_SITE_ROOT: siteRoot,
      WASM_GAME_SHELL_ROOT: shellRoot,
      WASM_GAME_DATA_ROOT: temporaryData,
      WASM_GAME_HTTP_PORT: String(port),
      WASM_GAME_VARIANT: 'wolfet',
      WASM_GAME_PASSWORD: '',
      WASM_GAME_SESSION_SECRET: ''
    }),
    stdio: ['ignore', 'ignore', 'pipe']
  });
  let stderr = '';
  child.stderr.on('data', (chunk) => { stderr += chunk; });

  try {
    const base = 'http://127.0.0.1:' + port;
    const manifestResponse = await fetchReady(base + '/app.webmanifest', child);
    const workerResponse = await fetchReady(base + '/service-worker.js', child);
    await fsp.rm(outputRoot, { recursive: true, force: true });
    await fsp.mkdir(outputRoot, { recursive: true });
    await Promise.all([
      fsp.writeFile(path.join(outputRoot, 'app.webmanifest'), await manifestResponse.text()),
      fsp.writeFile(path.join(outputRoot, 'service-worker.js'), await workerResponse.text()),
      fsp.copyFile(path.join(frameworkRoot, 'server', 'password-auth.js'),
        path.join(outputRoot, 'password-auth.js')),
      fsp.copyFile(path.join(frameworkRoot, 'server', 'lifecycle.js'),
        path.join(outputRoot, 'lifecycle.js'))
    ]);
  } finally {
    child.kill('SIGTERM');
    await new Promise((resolve) => {
      if (child.exitCode !== null) return resolve();
      child.once('exit', resolve);
      setTimeout(resolve, 1000);
    });
    await fsp.rm(temporaryData, { recursive: true, force: true });
  }
  if (child.exitCode && child.exitCode !== 143 && stderr) {
    throw new Error(stderr.trim());
  }
}

main().catch((error) => {
  console.error(error.message || error);
  process.exitCode = 1;
});
