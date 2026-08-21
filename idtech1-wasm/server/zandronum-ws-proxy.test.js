'use strict';

const assert = require('node:assert/strict');
const { attachZandronumWebSocketProxy } = require('./zandronum-ws-proxy');

assert.equal(typeof attachZandronumWebSocketProxy, 'function');
console.log('Verified Zandronum raw-datagram WebSocket proxy module.');
