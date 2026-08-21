(() => {
  'use strict';

  const delegates = Object.freeze({
    quake: '/adapters/quake.js',
    quake2: '/adapters/quake2.js?v=20260821-expansions5',
    'quake2-xatrix': '/adapters/quake2.js?v=20260821-expansions5',
    'quake2-rogue': '/adapters/quake2.js?v=20260821-expansions5'
  });
  let delegate = null;
  let delegatePromise = null;

  function loadScript(source) {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = source;
      script.onload = resolve;
      script.onerror = () => reject(new Error(`Could not load id Tech 2 adapter ${source}.`));
      document.head.appendChild(script);
    });
  }

  async function loadDelegate(context) {
    if (delegate) return delegate;
    if (delegatePromise) return delegatePromise;
    const source = delegates[context.variant];
    if (!source) throw new Error(`Unsupported id Tech 2 variant: ${context.variant}.`);
    delegatePromise = (async () => {
      await loadScript(source);
      const selected = globalThis.WasmGameAdapter;
      if (!selected || selected === familyAdapter || typeof selected.start !== 'function') {
        throw new Error(`${source} did not register a native engine adapter.`);
      }
      delegate = selected;
      globalThis.WasmGameAdapter = familyAdapter;
      return delegate;
    })();
    return delegatePromise;
  }

  const familyAdapter = Object.freeze({
    async init(context) {
      const selected = await loadDelegate(context);
      return selected.init?.(context);
    },
    async start(context) {
      const selected = await loadDelegate(context);
      return selected.start(context);
    },
    readEngineState(context) {
      return delegate?.readEngineState?.(context) || 'launcher';
    },
    readCaptureIntent(context) {
      return delegate?.readCaptureIntent?.(context) === true;
    },
    resize(detail, context) { return delegate?.resize?.(detail, context); },
    captureLost(detail, context) { return delegate?.captureLost?.(detail, context); },
    inputCaptureChanged(captured, context) {
      return delegate?.inputCaptureChanged?.(captured, context);
    },
    controllerFrame(detail, context) {
      return delegate?.controllerFrame?.(detail, context);
    },
    controllerChanged(detail, context) {
      return delegate?.controllerChanged?.(detail, context);
    },
    pointerMove(detail, event, context) {
      return delegate?.pointerMove?.(detail, event, context);
    },
    pointerButton(detail, event, context) {
      return delegate?.pointerButton?.(detail, event, context);
    },
    preferencesChanged(values, context) {
      return delegate?.preferencesChanged?.(values, context);
    },
    contextLost(event, context) { return delegate?.contextLost?.(event, context); },
    contextRestored(event, context) { return delegate?.contextRestored?.(event, context); }
  });

  globalThis.WasmGameAdapter = familyAdapter;
})();
