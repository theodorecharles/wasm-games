(function () {
  'use strict';

  var sources = [
    '/js/player-name.js?v=2',
    '/js/etjs-input.js?v=3',
    '/js/bind-store.js?v=2',
    '/js/pk3-cache.js?v=3',
    '/js/pk3-download.js?v=1',
    '/js/client.js?v=26'
  ];

  function load(source) {
    return new Promise(function (resolve, reject) {
      var script = document.createElement('script');
      script.src = source;
      script.onload = resolve;
      script.onerror = function () { reject(new Error('Could not load ' + source)); };
      document.head.appendChild(script);
    });
  }

  var ready = sources.reduce(function (pending, source) {
    return pending.then(function () { return load(source); });
  }, Promise.resolve());

  function inner() {
    if (!window.ETJSGameAdapter) {
      throw new Error('The Enemy Territory engine adapter did not initialize.');
    }
    return window.ETJSGameAdapter;
  }

  window.WasmGameAdapter = {
    init: function (context) {
      return ready.then(function () { return inner().init(context); });
    },
    start: function (context) {
      return ready.then(function () { return inner().start(context); });
    },
    readEngineState: function () {
      return window.ETJSGameAdapter ? inner().readEngineState() : 'launcher';
    },
    readCaptureIntent: function () {
      return window.ETJSGameAdapter ? inner().readCaptureIntent() : false;
    },
    resize: function (detail, context) {
      if (window.ETJSGameAdapter) { return inner().resize(detail, context); }
    },
    captureLost: function (detail, context) {
      if (window.ETJSGameAdapter) { return inner().captureLost(detail, context); }
    },
    pointerMove: function (detail, event, context) {
      if (window.ETJSGameAdapter) { return inner().pointerMove(detail, event, context); }
    },
    pointerButton: function (detail, event, context) {
      if (window.ETJSGameAdapter) { return inner().pointerButton(detail, event, context); }
    },
    inputCaptureChanged: function (captured, context) {
      if (window.ETJSGameAdapter) { return inner().inputCaptureChanged(captured, context); }
    },
    preferencesChanged: function (values, context) {
      if (window.ETJSGameAdapter) { return inner().preferencesChanged(values, context); }
    },
    controllerFrame: function (detail, context) {
      if (window.ETJSGameAdapter) { return inner().controllerFrame(detail, context); }
    },
    controllerChanged: function (detail, context) {
      if (window.ETJSGameAdapter) { return inner().controllerChanged(detail, context); }
    },
    contextLost: function (event, context) {
      if (window.ETJSGameAdapter) { return inner().contextLost(event, context); }
    },
    contextRestored: function (event, context) {
      if (window.ETJSGameAdapter) { return inner().contextRestored(event, context); }
    }
  };
})();
