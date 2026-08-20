#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const [sourcePath, outputPath] = process.argv.slice(2);
if (!sourcePath || !outputPath) throw new Error('usage: rewrite-quakejs-dedicated.js SOURCE OUTPUT');

let source = fs.readFileSync(sourcePath, 'utf8');
const oldMessage = `peer.socket.on('message', function(data, flags) {\n              if (!flags.binary) {`;
const newMessage = `peer.socket.on('message', function(data, isBinary) {\n              if (!isBinary) {`;
if (!source.includes(oldMessage)) throw new Error('QuakeJS dedicated WebSocket message seam changed.');
source = source.replace(oldMessage, newMessage);
source = source.replace("sock.server.on('closed', function() {", "sock.server.on('close', function() {");

const startupStart = source.indexOf('},FS_Startup:function (callback) {');
const startupEnd = source.indexOf('\n  \t\t},FS_Shutdown:function', startupStart);
if (startupStart < 0 || startupEnd < 0) throw new Error('QuakeJS dedicated asset-startup seam changed.');
// The framework has already SHA-256 validated the complete retail PAK set.
// QuakeJS's legacy bootstrap knows only the demo pak0 CRC and would otherwise
// prompt for a demo installer even when the owner's retail pak0 is valid.
source = `${source.slice(0, startupStart)}},FS_Startup:function (callback) { callback(null);${source.slice(startupEnd)}`;
fs.writeFileSync(outputPath, source);
