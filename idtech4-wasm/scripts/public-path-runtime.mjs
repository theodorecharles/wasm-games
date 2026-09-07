import assert from 'node:assert/strict';

// Apply after native/candidate staging. Historical SABot input/output pins stay
// intact; this explicit, checked launcher overlay never rewrites engine bytes.
// The ordinary family builder and replacement-image builder use the same code.
export function publicPathRuntime(name, input) {
  let source = input;
  function replace(before, after) {
    assert.equal(source.split(before).length - 1, 1, `${name}: unexpected integration input: ${before}`);
    source = source.replace(before, after);
  }
  if (name === 'game-adapter.js') {
    for (const endpoint of ['/wasm-game-data.json', '/api/doom3/wake']) {
      replace(`fetch('${endpoint}',`, `fetch(ctx.framework.publicUrl('${endpoint}'),`);
    }
    replace('new Worker(descriptor.worker)', 'new Worker(ctx.framework.publicUrl(descriptor.worker))');
    replace("frameworkScript: '/shared-shell/wasm-game-framework.js'",
      "frameworkScript: ctx.framework.publicUrl('/shared-shell/wasm-game-framework.js')");
  } else if (name === 'd3-managed-network.js') {
    replace("new URL('/api/doom3/socket', base)", "new URL('api/doom3/socket', new URL('./', base))");
  } else if (['d3-worker.js', 'q4-worker.js', 'prey-worker.js'].includes(name)) {
    // Derive the allowed framework location from the worker's own URL, not
    // arbitrary launch-message origins, query parameters or filesystem roots.
    replace("persistence.frameworkScript !== '/shared-shell/wasm-game-framework.js'",
      "new URL(persistence.frameworkScript, self.location.href).href !== new URL('./shared-shell/wasm-game-framework.js', self.location.href).href");
    if (name === 'd3-worker.js') {
      replace("importScripts('/d3-managed-network.js')", "importScripts(new URL('./d3-managed-network.js', self.location.href).href)");
      replace("importScripts(`/dhewm3-${roe ? 'roe' : 'base'}.js`)", "importScripts(new URL(`./dhewm3-${roe ? 'roe' : 'base'}.js`, self.location.href).href)");
      if (source.includes("fetch('/bots/d3_sabot_a7.pk4')")) {
        replace("fetch('/bots/d3_sabot_a7.pk4')", "fetch(new URL('./bots/d3_sabot_a7.pk4', self.location.href).href)");
      }
    } else if (name === 'q4-worker.js') {
      for (const file of ['pak0.pk4', 'pak1.pk4', 'mod.json']) {
        replace(`fetch('/baseoq4/${file}')`, `fetch(new URL('./baseoq4/${file}', self.location.href).href)`);
      }
      replace('fetch(`/baseoq4/${moduleName}`)', 'fetch(new URL(`./baseoq4/${moduleName}`, self.location.href).href)');
      replace('new URL(path, self.location.href).href', "new URL(path.replace(/^\\/+/, ''), self.location.href).href");
      replace("importScripts('/openQ4-client_wasm32.js')", "importScripts(new URL('./openQ4-client_wasm32.js', self.location.href).href)");
    } else {
      replace("importScripts('/prey06.js')", "importScripts(new URL('./prey06.js', self.location.href).href)");
    }
  } else {
    throw new Error(`No id Tech 4 public-path transformation for ${name}`);
  }
  return source;
}
