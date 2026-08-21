(() => {
  'use strict';

  const delegates = Object.freeze({
    blood: '/adapters/blood.js',
    duke3d: '/adapters/duke3d.js'
  });
  let delegate = null;
  let delegatePromise = null;

  function loadScript(source) {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = source;
      script.onload = resolve;
      script.onerror = () => reject(new Error(`Could not load Build-family adapter ${source}.`));
      document.head.appendChild(script);
    });
  }

  async function loadDelegate(context) {
    if (delegate) return delegate;
    if (delegatePromise) return delegatePromise;
    const source = delegates[context.variant];
    if (!source) throw new Error(`Unsupported Build-engine variant: ${context.variant}.`);
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
    async init(context) { return (await loadDelegate(context)).init?.(context); },
    async start(context) { return (await loadDelegate(context)).start(context); },
    readEngineState(context) { return delegate?.readEngineState?.(context) || 'launcher'; },
    readCaptureIntent(context) { return delegate?.readCaptureIntent?.(context) === true; },
    resize(detail, context) { return delegate?.resize?.(detail, context); },
    captureLost(detail, context) { return delegate?.captureLost?.(detail, context); },
    inputCaptureChanged(captured, context) { return delegate?.inputCaptureChanged?.(captured, context); },
    pointerMove(detail, event, context) { return delegate?.pointerMove?.(detail, event, context); },
    pointerButton(detail, event, context) { return delegate?.pointerButton?.(detail, event, context); },
    controllerFrame(detail, context) { return delegate?.controllerFrame?.(detail, context); },
    controllerChanged(detail, context) { return delegate?.controllerChanged?.(detail, context); },
    preferencesChanged(values, context) { return delegate?.preferencesChanged?.(values, context); },
    contextLost(event, context) { return delegate?.contextLost?.(event, context); },
    contextRestored(event, context) { return delegate?.contextRestored?.(event, context); }
  });

  globalThis.WasmGameAdapter = familyAdapter;
})();
