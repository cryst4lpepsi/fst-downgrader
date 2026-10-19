// Builds small .fst presets from scratch for the tests, so the repo ships no one else's presets.
// Layouts follow what FL Studio writes; see the README for the event format.

function preset({ format, version, build, events }) {
  const body = [];
  const ev = (id, v) => {
    if (id < 64) body.push(id, v);
    else if (id < 128) body.push(id, v & 255, v >> 8);
    else if (id < 192) body.push(id, v & 255, (v >> 8) & 255, (v >> 16) & 255, v >>> 24);
    else { body.push(id); let n = v.length; do { body.push((n & 127) | (n > 127 ? 128 : 0)); n >>= 7; } while (n); body.push(...v); }
  };
  ev(199, new TextEncoder().encode(version + '\0'));
  ev(159, build);
  for (const [id, v] of events) ev(id, v);
  const head = Buffer.alloc(22);
  head.write('FLhd', 0); head.writeUInt32LE(6, 4); head.writeInt16LE(format, 8); head.writeUInt16LE(1, 10); head.writeUInt16LE(96, 12);
  head.write('FLdt', 14); head.writeUInt32LE(body.length, 18);
  return new Uint8Array(Buffer.concat([head, Buffer.from(body)]));
}

const utf16 = (s) => new Uint8Array(Buffer.from(s + '\0', 'utf16le'));
const ints = (...xs) => { const b = Buffer.alloc(xs.length * 4); xs.forEach((x, i) => b.writeInt32LE(x, i * 4)); return new Uint8Array(b); };

// Parametric EQ 2 settings: 354 bytes in both v7 (FL 21) and v8 (FL 24+).
// 7 gains, 7 frequencies, 7 widths, 7 band shapes, then the same for the compare slot, then options.
function eq2State(version, gains) {
  const freqs = [10923, 18204, 25486, 32768, 40050, 47332, 54613];
  const widths = [40124, 25412, 25412, 25412, 25412, 25412, 40124];
  const shapes = [5, 6, 6, 6, 6, 6, 7];
  const zeros = (n) => new Array(n).fill(0);
  const head = ints(version, ...gains, ...freqs, ...widths, ...shapes, ...zeros(15), ...freqs, ...widths, ...shapes, ...zeros(7));
  const options = Buffer.from('0000000001000000000000000102000000000000000200000000000000607f0000000100000000000000030000000100000002000000020000000200000000000000', 'hex');
  const out = new Uint8Array(Buffer.concat([head, options]));
  if (out.length !== 354) throw new Error('EQ2 state should be 354 bytes, got ' + out.length);
  return out;
}

// Soundgoodizer settings: version 3, mode (0 = A), amount.
const soundgoodizerState = () => ints(3, 0, 400);

// Mixer slot info (event 212): version, slot index, then window layout we don't care about.
const slotInfo = (slot) => ints(2, slot, 2, 0, 0x160, 0, 0, 0, 0, 0, 0, 0, 0);

function mixerSlot(slot, internal, state) {
  return [[201, utf16(internal)], [212, slotInfo(slot)], [155, 0], [128, 5656904], [41, 0], [213, state], [98, slot]];
}

// "Basic EQ2 + Soundgoodizer" mixer preset: EQ2 in slot 1 (low cut, small 2 kHz boost), Soundgoodizer in slot 2.
// fl: 25 for an FL 25.1.6 save, 21 for what FL 21.2.3 would write for the same chain.
function basicChain(fl, { eq2Version } = {}) {
  const v25 = fl === 25;
  return preset({
    format: 64,
    version: v25 ? '25.1.6.4997' : '21.2.3.4004',
    build: v25 ? 4997 : 4004,
    events: [
      ...(v25 ? [[169, 7]] : []),
      [28, 1], [37, 1], [42, 1], [95, 2],
      [204, utf16('Basic EQ2 + Soundgoodizer')],
      [236, ints(0, 0x4c, 0)],
      ...mixerSlot(0, 'Fruity Parametric EQ 2', eq2State(eq2Version || (v25 ? 8 : 7), [-1500, 0, 0, 120, 0, 0, 0])),
      ...mixerSlot(1, 'Soundgoodizer', soundgoodizerState()),
    ],
  });
}

// Fruity Wrapper (VST) settings: version, then chunks of (u32 id, u64 size, bytes).
function wrapperState(version, chunkIds) {
  const parts = [ints(version)];
  for (const id of chunkIds) { const c = Buffer.alloc(16); c.writeUInt32LE(id, 0); c.writeUInt32LE(4, 4); c.writeUInt32LE(1, 12); parts.push(c); }
  return new Uint8Array(Buffer.concat(parts));
}

function vstChain(wrapperVersion, chunkIds) {
  return preset({
    format: 64, version: '25.1.6.4997', build: 4997,
    events: [[169, 7], [201, utf16('Fruity Wrapper')], [212, slotInfo(0)], [203, utf16('Some VST')], [213, wrapperState(wrapperVersion, chunkIds)], [98, 0]],
  });
}

module.exports = { preset, utf16, eq2State, basicChain, vstChain };
