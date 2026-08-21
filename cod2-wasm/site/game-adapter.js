(function () {
  'use strict';

  let engineState = 'launcher';
  let diagnosticData;
  let manifest;
  let diagnosticFactoryPromise;
  let diagnosticLines = [];
  let completed = false;

  function filePolicy(file) {
    return {
      ...file,
      mountName: file.path
    };
  }

  function drawStatus(context) {
    const canvas = context.elements.canvas;
    const drawing = canvas.getContext('2d');
    drawing.fillStyle = '#11120f';
    drawing.fillRect(0, 0, canvas.width, canvas.height);
    drawing.fillStyle = '#d7c59a';
    drawing.font = '700 42px system-ui, sans-serif';
    drawing.fillText('Call of Duty 2 WASM diagnostic', 72, 110);
    drawing.fillStyle = '#f0eee6';
    drawing.font = '26px system-ui, sans-serif';
    drawing.fillText('The reconstructed native checksum module completed.', 72, 175);
    drawing.fillText('The multiplayer engine cannot link for WebAssembly yet.', 72, 222);
    drawing.fillStyle = '#aaa89f';
    drawing.font = '22px ui-monospace, monospace';
    drawing.fillText('Status: Still in development', 72, 300);
    diagnosticLines.slice(-2).forEach((line, index) => drawing.fillText(line, 72, 350 + index * 38));
  }

  function loadDiagnosticFactory() {
    if (typeof globalThis.createCod2Diagnostic === 'function') {
      return Promise.resolve(globalThis.createCod2Diagnostic);
    }
    if (diagnosticFactoryPromise) return diagnosticFactoryPromise;
    diagnosticFactoryPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = '/cod2_core_probe.js';
      script.async = true;
      script.onload = () => {
        if (typeof globalThis.createCod2Diagnostic !== 'function') {
          reject(new Error('The Call of Duty 2 diagnostic factory did not register.'));
          return;
        }
        resolve(globalThis.createCod2Diagnostic);
      };
      script.onerror = () => reject(new Error('The Call of Duty 2 diagnostic module could not be loaded.'));
      document.head.appendChild(script);
    });
    return diagnosticFactoryPromise;
  }

  globalThis.WasmGameAdapter = Object.freeze({
    async init(context) {
      const root = await fetch('/wasm-game-data.json', { cache: 'no-store' }).then(response => {
        if (!response.ok) throw new Error(`Runtime policy failed with HTTP ${response.status}.`);
        return response.json();
      });
      manifest = root.variants[context.variant];
      if (!manifest) throw new Error(`No runtime policy exists for ${context.variant}.`);
      const cacheFiles = manifest.files.filter(file => file.diagnosticCache === true);
      if (cacheFiles.length !== 1) throw new Error('The diagnostic cache policy must select exactly one archive.');
      diagnosticData = context.framework.createOwnerDataSet({
        namespace: `${manifest.namespace}-diagnostic`,
        version: manifest.version,
        files: cacheFiles.map(filePolicy)
      });
      context.log('[cod2-wasm] The reconstructed multiplayer object graph compiles, but the engine link is blocked.');
    },

    async start(context) {
      if (completed) {
        engineState = 'crashed';
        context.showRuntime('crashed');
        drawStatus(context);
        return;
      }
      engineState = 'loading';
      context.setEngineState('loading');
      try {
        context.setLoading('Preparing the diagnostic boundary…', '', 8);
        await context.dataClient.load(diagnosticData, {
          onProgress(detail) {
            const progress = detail.phase === 'restored' || detail.phase === 'cached' ? 78 : 42;
            context.setLoading('Verifying the runtime prerequisite…', '', progress);
          }
        });
        context.setLoading('Executing the native checksum diagnostic…', '', 90);
        const factory = await loadDiagnosticFactory();
        diagnosticLines = [];
        await factory({
          locateFile(path) { return `/${path}`; },
          print(value) {
            const line = String(value);
            diagnosticLines.push(line);
            context.log(line);
          },
          printErr(value) { context.log(String(value), 'error'); }
        });
        if (!diagnosticLines.some(line => line.includes('probe complete'))) {
          throw new Error('The native checksum diagnostic did not complete.');
        }
        completed = true;
        engineState = 'crashed';
        context.showRuntime('crashed');
        drawStatus(context);
      } catch (error) {
        engineState = 'crashed';
        throw error;
      }
    },

    readEngineState() {
      return engineState;
    }
  });
})();
