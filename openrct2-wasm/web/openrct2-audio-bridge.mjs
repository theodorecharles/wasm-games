const clampSampleRate = value => {
  const rate = Math.round(Number(value) || 48000);
  return Math.min(192000, Math.max(8000, rate));
};

const describe = error => error instanceof Error ? error.stack || error.message : String(error);

export function installWorkerAudioBridge(options = {}) {
  const target = options.target || globalThis;
  const send = typeof options.send === 'function' ? options.send : () => {};
  const setTimer = options.setTimer || target.setInterval.bind(target);
  const clearTimer = options.clearTimer || target.clearInterval.bind(target);
  const sampleRate = clampSampleRate(options.sampleRate);
  const startupBuffers = Math.max(1, Math.min(8, Number(options.startupBuffers) || 3));
  const nodes = new Set();
  let sequence = 0;

  class BridgeAudioBuffer {
    constructor(channels, frames) {
      this.numberOfChannels = Math.max(1, Math.min(8, Number(channels) || 1));
      this.length = Math.max(1, Number(frames) || 1);
      this.sampleRate = sampleRate;
      this.duration = this.length / this.sampleRate;
      this.channels = Array.from({ length: this.numberOfChannels }, () => new Float32Array(this.length));
    }

    getChannelData(index) {
      if (!Number.isInteger(index) || index < 0 || index >= this.channels.length) {
        throw new RangeError(`Audio channel ${index} is unavailable.`);
      }
      return this.channels[index];
    }
  }

  class BridgeScriptProcessor {
    constructor(frames, outputChannels) {
      this.bufferSize = Math.max(128, Math.min(16384, Number(frames) || 2048));
      this.outputChannels = Math.max(1, Math.min(8, Number(outputChannels) || 2));
      this.onaudioprocess = null;
      this.timer = 0;
      this.primed = false;
    }

    connect() {
      if (this.timer) return;
      const interval = Math.max(4, (this.bufferSize / sampleRate) * 1000);
      const produce = () => {
        if (typeof this.onaudioprocess !== 'function') return;
        const outputBuffer = new BridgeAudioBuffer(this.outputChannels, this.bufferSize);
        try {
          this.onaudioprocess({ outputBuffer });
          const channels = outputBuffer.channels;
          send({ type: 'audio', sampleRate, sequence: ++sequence, channels }, channels.map(channel => channel.buffer));
        } catch (error) {
          send({ type: 'audio-error', text: describe(error) });
        }
      };
      this.timer = setTimer(() => {
        // A real audio device asks its callback to stay ahead of the playback
        // cursor. The application worker has no device clock and its timer can
        // be delayed by a native frame, so prime a small bounded queue on the
        // first callback instead of beginning one buffer away from starvation.
        const count = this.primed ? 1 : startupBuffers;
        this.primed = true;
        for (let index = 0; index < count; index += 1) produce();
      }, interval);
      nodes.add(this);
    }

    disconnect() {
      if (this.timer) clearTimer(this.timer);
      this.timer = 0;
      this.primed = false;
      nodes.delete(this);
    }
  }

  class BridgeAudioContext {
    constructor() {
      this.sampleRate = sampleRate;
      this.state = 'running';
      this.destination = Object.freeze({ bridgeDestination: true });
    }

    createScriptProcessor(frames, _inputChannels, outputChannels) {
      return new BridgeScriptProcessor(frames, outputChannels);
    }

    createBuffer(channels, frames) {
      return new BridgeAudioBuffer(channels, frames);
    }

    resume() {
      if (this.state !== 'closed') this.state = 'running';
      return Promise.resolve();
    }

    suspend() {
      if (this.state !== 'closed') this.state = 'suspended';
      return Promise.resolve();
    }

    close() {
      for (const node of Array.from(nodes)) node.disconnect();
      this.state = 'closed';
      return Promise.resolve();
    }
  }

  target.AudioContext = BridgeAudioContext;
  target.webkitAudioContext = BridgeAudioContext;
  return { sampleRate, activeNodes: () => nodes.size };
}

export function createMainAudioSink(options = {}) {
  const AudioContextCtor = options.AudioContextCtor;
  if (typeof AudioContextCtor !== 'function') return null;
  let context;
  try {
    context = new AudioContextCtor({ latencyHint: 'interactive' });
  } catch (_) {
    context = new AudioContextCtor();
  }
  let nextStart = 0;
  let buffers = 0;
  let dropped = 0;
  let frames = 0;
  let underruns = 0;
  let underrunSeconds = 0;
  let highWaterQueuedSeconds = 0;
  let lastSequence = 0;
  let sequenceGaps = 0;
  const leadSeconds = Math.max(0.005, Number(options.leadSeconds) || 0.08);
  const maxQueuedSeconds = Math.max(leadSeconds * 2, Number(options.maxQueuedSeconds) || 0.6);
  const report = () => options.onState?.({
    state: context.state,
    sampleRate: context.sampleRate,
    buffers,
    dropped,
    frames,
    queuedSeconds: Math.max(0, nextStart - context.currentTime),
    underruns,
    underrunSeconds,
    highWaterQueuedSeconds,
    sequenceGaps
  });
  context.addEventListener?.('statechange', report);

  function enqueue(message) {
    const channels = Array.isArray(message?.channels) ? message.channels : [];
    if (!channels.length || channels.length > 8) return false;
    const length = channels[0] instanceof Float32Array ? channels[0].length : 0;
    if (!length || length > 16384 || channels.some(channel => !(channel instanceof Float32Array) || channel.length !== length)) {
      return false;
    }
    if (context.state === 'closed') return false;
    if (context.state !== 'running') {
      dropped++;
      nextStart = 0;
      report();
      return false;
    }
    const sampleRate = clampSampleRate(message.sampleRate || context.sampleRate);
    const now = context.currentTime;
    const sequence = Math.max(0, Number(message.sequence) || 0);
    if (lastSequence && sequence > lastSequence + 1) sequenceGaps += sequence - lastSequence - 1;
    if (sequence) lastSequence = Math.max(lastSequence, sequence);
    if (!nextStart) {
      nextStart = now + leadSeconds;
    } else if (nextStart < now) {
      underruns += 1;
      underrunSeconds += now - nextStart;
      nextStart = now + leadSeconds;
    }
    if (nextStart - now > maxQueuedSeconds) {
      dropped++;
      // Never reset onto buffers that are already scheduled: doing so overlaps
      // two audio timelines and produces the exact crackle/stutter this bound
      // is meant to prevent. Discard only this excess producer buffer.
      report();
      return false;
    }
    const buffer = context.createBuffer(channels.length, length, sampleRate);
    channels.forEach((channel, index) => buffer.copyToChannel(channel, index));
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.connect(context.destination);
    source.start(nextStart);
    nextStart += length / sampleRate;
    highWaterQueuedSeconds = Math.max(highWaterQueuedSeconds, nextStart - now);
    buffers++;
    frames += length;
    report();
    return true;
  }

  async function resume() {
    if (context.state !== 'closed') await context.resume();
    report();
  }

  async function suspend() {
    if (context.state === 'running') await context.suspend();
    nextStart = 0;
    report();
  }

  async function close() {
    nextStart = 0;
    await context.close();
    report();
  }

  report();
  return {
    context, enqueue, resume, suspend, close,
    snapshot: () => ({
      state: context.state, buffers, dropped, frames,
      underruns, underrunSeconds, highWaterQueuedSeconds, sequenceGaps,
      queuedSeconds: Math.max(0, nextStart - context.currentTime)
    })
  };
}
