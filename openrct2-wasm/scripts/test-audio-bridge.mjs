#!/usr/bin/env node

import assert from 'node:assert/strict';
import { createMainAudioSink, installWorkerAudioBridge } from '../web/openrct2-audio-bridge.mjs';

let timerCallback = null;
const transferred = [];
const target = {
  setInterval(callback) { timerCallback = callback; return 1; },
  clearInterval() { timerCallback = null; }
};
const worker = installWorkerAudioBridge({
  target,
  sampleRate: 48000,
  setTimer: target.setInterval,
  clearTimer: target.clearInterval,
  send(message, transfer) { transferred.push({ message, transfer }); }
});
const workerContext = new target.AudioContext();
const processor = workerContext.createScriptProcessor(256, 0, 2);
processor.onaudioprocess = event => {
  event.outputBuffer.getChannelData(0).fill(0.25);
  event.outputBuffer.getChannelData(1).fill(-0.25);
};
processor.connect(workerContext.destination);
assert.equal(worker.activeNodes(), 1);
timerCallback();
assert.equal(transferred.length, 3, 'worker must establish a bounded startup queue');
assert.equal(transferred[0].message.type, 'audio');
assert.equal(transferred[0].message.channels.length, 2);
assert.equal(transferred[0].message.channels[0][0], 0.25);
assert.equal(transferred[0].transfer.length, 2);
timerCallback();
assert.equal(transferred.length, 4, 'steady-state callback must generate exactly one buffer');
processor.disconnect();
assert.equal(worker.activeNodes(), 0);

class FakeAudioContext {
  constructor() {
    this.state = 'suspended';
    this.sampleRate = 48000;
    this.currentTime = 1;
    this.destination = {};
    this.starts = [];
  }
  addEventListener() {}
  createBuffer(channels, length, sampleRate) {
    const values = Array.from({ length: channels }, () => new Float32Array(length));
    return { copyToChannel(source, index) { values[index].set(source); }, values, sampleRate };
  }
  createBufferSource() {
    const context = this;
    return { connect() {}, start(time) { context.starts.push(time); } };
  }
  async resume() { this.state = 'running'; }
  async suspend() { this.state = 'suspended'; }
  async close() { this.state = 'closed'; }
}

const states = [];
const sink = createMainAudioSink({ AudioContextCtor: FakeAudioContext, onState: state => states.push(state) });
assert.equal(sink.enqueue(transferred[0].message), false, 'suspended contexts must drop rather than queue indefinitely');
await sink.resume();
for (const item of transferred.slice(0, 3)) assert.equal(sink.enqueue(item.message), true);
assert.equal(sink.context.starts.length, 3);
assert(sink.context.starts[0] > sink.context.currentTime);
assert(sink.context.starts[1] > sink.context.starts[0]);
assert(sink.context.starts[2] > sink.context.starts[1]);
assert.equal(sink.snapshot().buffers, 3);
assert.equal(sink.snapshot().frames, 768);
assert(sink.snapshot().highWaterQueuedSeconds > 0.08);

sink.context.currentTime = 2;
assert.equal(sink.enqueue(transferred[3].message), true);
assert.equal(sink.snapshot().underruns, 1, 'late producer delivery must be measured');
assert(sink.snapshot().underrunSeconds > 0);

const bounded = createMainAudioSink({
  AudioContextCtor: FakeAudioContext,
  leadSeconds: 0.01,
  maxQueuedSeconds: 0.02
});
await bounded.resume();
assert.equal(bounded.enqueue(transferred[0].message), true);
const firstStart = bounded.context.starts[0];
assert.equal(bounded.enqueue(transferred[1].message), true);
assert.equal(bounded.enqueue(transferred[2].message), false, 'excess queue input must be dropped');
assert.equal(bounded.context.starts.length, 2, 'a dropped buffer must not overlap the existing schedule');
assert.equal(bounded.context.starts[0], firstStart);
assert.equal(bounded.snapshot().dropped, 1);
await bounded.close();
await sink.suspend();
assert.equal(sink.enqueue(transferred[0].message), false);
await sink.close();
assert.equal(sink.snapshot().state, 'closed');
assert(states.some(state => state.state === 'running' && state.buffers === 3));

console.log('OpenRCT2 bounded worker-to-main audio bridge passed');
