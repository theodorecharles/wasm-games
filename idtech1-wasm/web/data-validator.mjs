const HEADER_BYTES = 12;
const DIRECTORY_ENTRY_BYTES = 16;
const DEFAULT_MAX_LUMPS = 65536;

const FAMILY_RULES = Object.freeze({
  doom: Object.freeze({
    required: Object.freeze(['POSSA1', 'E1M1', 'E3M1']),
    forbidden: Object.freeze([]),
    signals: Object.freeze(['E4M1'])
  }),
  doom2: Object.freeze({
    required: Object.freeze(['POSSA1', 'MAP01', 'MAP30', 'MAP31', 'MAP32', 'D_RUNNIN']),
    forbidden: Object.freeze(['DOTNTDR', 'BTNTCRAT', 'CAMO1', 'MC1']),
    signals: Object.freeze([])
  }),
  tnt: Object.freeze({
    required: Object.freeze(['MAP01', 'MAP30', 'MAP31', 'MAP32', 'DOTNTDR', 'BTNTCRAT']),
    forbidden: Object.freeze([]),
    signals: Object.freeze([])
  }),
  plutonia: Object.freeze({
    required: Object.freeze(['MAP01', 'MAP30', 'MAP31', 'MAP32', 'CAMO1', 'MC1']),
    forbidden: Object.freeze([]),
    signals: Object.freeze([])
  }),
  heretic: Object.freeze({
    required: Object.freeze(['IMPXA1', 'E1M1', 'E2M1', 'E3M1']),
    forbidden: Object.freeze([]),
    signals: Object.freeze(['EXTENDED'])
  }),
  hexen: Object.freeze({
    required: Object.freeze(['ETTNA1', 'MAP01', 'SKY1', 'CLUS1MSG', 'BEHAVIOR']),
    forbidden: Object.freeze([]),
    signals: Object.freeze([])
  }),
  chex: Object.freeze({
    required: Object.freeze(['E1M1', 'POSSH0M0', 'SARGE2E8']),
    forbidden: Object.freeze(['MAP01']),
    signals: Object.freeze([])
  })
});

const KNOWN_RELEASES = Object.freeze({
  '6fdf361847b46228cfebd9f3af09cd844282ac75f3edbb61ca4cb27103ce2e7f': 'ultimate-doom-classic',
  '03103e82064a960b548a98eb9656f1f30545458eb437d99475a962053b1f8fcd': 'ultimate-doom-rerelease',
  '76a22247d76ee9710595f7ee2d8dded2ce9785fb49287a9ac6348544b858e6f9': 'doom-eternal-classic',
  '10d67824b11025ddd9198e8cfc87ca335ee6e2d3e63af4180fa9b8a471893255': 'doom2-classic',
  '31740ef23994b3959800134b41aaf86b04a2847336d328af8c4ae890450630ab': 'doom2-rerelease',
  '059172c3d48cda43341864eb6d8d931e4b29becd91e5635ac00ba8b2a6862504': 'doom2-rerelease-streaming-assets',
  'c0a9c29d023af2737953663d0e03177d9b7b7b64146c158dcc2a07f9ec18f353': 'tnt-classic',
  '83c9457676380b2366e7a9f25c728a63c0688389fc3d98e8182ddfa695bb20d8': 'tnt-rerelease',
  'a83b00c636fa3308286e76b1b3153fc14507caf994b0450770421260b08efed8': 'plutonia-classic',
  'ff2bf34e2f2ec2a85e151bce0575ecb4146082b23ee6f872943aecd517a39c5a': 'plutonia-rerelease',
  '12541f82e1d326b456b89411f8c54b895e775a611580f66b78558e898b2eaafa': 'heretic-shadow-of-the-serpent-riders',
  '9a136f16c2be06c3efd8b2b974f2c3a2a34e551bdd683a64c88a33f5e31c129d': 'heretic-enhanced',
  'f74b857076b3ffe2597d0e05bdecc687496e6e8a9582d7a47db681e0e78e4001': 'hexen-classic',
  'ae63eff70f5951072d67f4e021553b3ae58263fe459bc601d379801c961b1217': 'hexen-enhanced',
  'd8eb5277918883f490fb1a4be3c9a8588df2dbaee6dc4beb8df4929148bbffb1': 'chex-quest'
});

function ascii(bytes) {
  return String.fromCharCode(...bytes);
}

function lumpName(bytes) {
  let end = bytes.indexOf(0);
  if (end < 0) end = bytes.length;
  return ascii(bytes.subarray(0, end)).toUpperCase();
}

function uint32(bytes, offset) {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(offset, true);
}

function reject(error) {
  return Object.freeze({ accepted: false, error });
}

function allowedIdentifications(policy) {
  const values = Array.isArray(policy.identifications)
    ? policy.identifications
    : policy.identification ? [policy.identification] : [];
  const normalized = [...new Set(values.map(value => String(value).toUpperCase()))];
  return normalized.every(value => value === 'IWAD' || value === 'PWAD') ? normalized : [];
}

function describeIdentification(value, bytes) {
  return /^[\x20-\x7e]{4}$/.test(value)
    ? value
    : Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
}

export async function validateIdTech1Data({ size, policy, read, digest }) {
  const family = String(policy.family || '').toLowerCase();
  const familyRule = FAMILY_RULES[family];
  if (!familyRule) return reject('unsupported id Tech 1 data family');

  const identifications = allowedIdentifications(policy);
  if (!identifications.length) return reject('validator policy has no valid WAD identification');
  if (!Number.isSafeInteger(size) || size < HEADER_BYTES) return reject('file is too small for a WAD header');

  const maxLumps = policy.maxLumps === undefined ? DEFAULT_MAX_LUMPS : Number(policy.maxLumps);
  if (!Number.isSafeInteger(maxLumps) || maxLumps < 1 || maxLumps > DEFAULT_MAX_LUMPS) {
    return reject('validator policy has an invalid lump limit');
  }

  const header = await read(0, HEADER_BYTES);
  const identification = ascii(header.subarray(0, 4));
  if (!identifications.includes(identification)) {
    return reject(`expected ${identifications.join(' or ')}, found ${describeIdentification(identification, header.subarray(0, 4))}`);
  }

  const lumpCount = uint32(header, 4);
  const directoryOffset = uint32(header, 8);
  if (lumpCount < 1 || lumpCount > maxLumps) return reject(`WAD lump count exceeds the ${maxLumps} entry limit`);
  const directoryBytes = lumpCount * DIRECTORY_ENTRY_BYTES;
  if (!Number.isSafeInteger(directoryBytes) || directoryOffset < HEADER_BYTES ||
      directoryOffset > size || directoryBytes > size - directoryOffset) {
    return reject('WAD directory is outside the file bounds');
  }

  const directory = await read(directoryOffset, directoryBytes);
  const names = new Set();
  const nameCounts = new Map();
  let duplicateNameCount = 0;
  let zeroLengthLumps = 0;
  for (let index = 0; index < lumpCount; index += 1) {
    const offset = index * DIRECTORY_ENTRY_BYTES;
    const filePosition = uint32(directory, offset);
    const lumpSize = uint32(directory, offset + 4);
    if (filePosition > size || lumpSize > size - filePosition) {
      return reject(`WAD lump ${index} is outside the file bounds`);
    }
    if (lumpSize === 0) zeroLengthLumps += 1;
    const name = lumpName(directory.subarray(offset + 8, offset + 16));
    const count = (nameCounts.get(name) || 0) + 1;
    nameCounts.set(name, count);
    if (count === 2) duplicateNameCount += 1;
    names.add(name);
  }

  const missing = familyRule.required.filter(name => !names.has(name));
  if (missing.length) return reject(`WAD is missing required ${family} lumps: ${missing.join(', ')}`);
  const forbidden = familyRule.forbidden.filter(name => names.has(name));
  if (forbidden.length) return reject(`WAD contains lumps from a different game family: ${forbidden.join(', ')}`);

  const fingerprint = await digest('SHA-256');
  const knownRelease = KNOWN_RELEASES[fingerprint] || null;
  const signals = Object.fromEntries(familyRule.signals.map(name => [name.toLowerCase(), names.has(name)]));
  let version = knownRelease || 'structurally-compatible';
  if (!knownRelease && family === 'doom') version = names.has('E4M1') ? 'ultimate-compatible' : 'registered-compatible';
  if (!knownRelease && family === 'heretic') version = names.has('EXTENDED') ? 'extended-compatible' : 'registered-compatible';

  return Object.freeze({
    accepted: true,
    identity: family,
    version,
    fingerprint,
    metadata: Object.freeze({
      identification,
      lumpCount,
      duplicateNameCount,
      zeroLengthLumps,
      knownRelease,
      signals: Object.freeze(signals)
    })
  });
}

export default validateIdTech1Data;
