import createMM1AssetProbe from './mm1-asset-probe.mjs';

const input = document.querySelector('#archive');
const drop = document.querySelector('#drop');
const selfTest = document.querySelector('#self-test');
const status = document.querySelector('#status');
const output = document.querySelector('#output');
const module = await createMM1AssetProbe();

function showResult(name, report) {
  status.dataset.state = report.valid ? 'valid' : 'invalid';
  status.textContent = report.valid
    ? `${name} is a structurally valid ${report.format} archive.`
    : `${name}: ${report.error}`;
  output.textContent = JSON.stringify(report, null, 2);
}

function inspectBytes(name, bytes) {
  status.dataset.state = 'working';
  status.textContent = `Inspecting ${name} locally…`;
  output.textContent = '';

  if (bytes.byteLength > 0xffffffff) {
    showResult(name, { valid: false, error: 'File exceeds the wasm32 address space' });
    return;
  }

  const pointer = module._malloc(Math.max(bytes.byteLength, 1));
  try {
    module.HEAPU8.set(bytes, pointer);
    const reportPointer = module._mm1_probe_archive(pointer, bytes.byteLength);
    showResult(name, JSON.parse(module.UTF8ToString(reportPointer)));
  } finally {
    module._free(pointer);
  }
}

async function inspect(file) {
  if (file) inspectBytes(file.name, new Uint8Array(await file.arrayBuffer()));
}

function syntheticArchive() {
  const names = new TextEncoder().encode('PROBE\0AR\0');
  const payloadOffset = 16 + 12 + names.byteLength;
  const bytes = new Uint8Array(payloadOffset + 3);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, 0x53455241, true);
  view.setUint32(4, 1, true);
  view.setUint32(8, 1, true);
  view.setUint32(12, names.byteLength, true);
  view.setUint32(16, payloadOffset, true);
  view.setUint32(20, 3 | (6 << 23), true);
  view.setUint32(24, 0, true);
  bytes.set(names, 28);
  bytes.set([1, 2, 3], payloadOffset);
  return bytes;
}

input.addEventListener('change', () => inspect(input.files[0]));
selfTest.addEventListener('click', () => inspectBytes('Built-in self-test', syntheticArchive()));
drop.addEventListener('dragover', (event) => {
  event.preventDefault();
  drop.dataset.dragging = 'true';
});
drop.addEventListener('dragleave', () => delete drop.dataset.dragging);
drop.addEventListener('drop', (event) => {
  event.preventDefault();
  delete drop.dataset.dragging;
  inspect(event.dataTransfer.files[0]);
});
