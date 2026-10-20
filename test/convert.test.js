// Run: npm test
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const FST = require('../src/fst-core.js');

const { preset, utf16, basicChain, vstChain } = require('./presets.js');

const fl25 = basicChain(25);
const fl21 = basicChain(21);
const fx = (name) => new Uint8Array(fs.readFileSync(path.join(__dirname, 'fixtures', name)));

test('sample preset in fixtures matches the generator', () => {
  assert.deepStrictEqual(Buffer.from(fx('fl25-eq2-soundgoodizer.fst')), Buffer.from(fl25));
});

test('FL25 mixer preset converts to exactly what FL 21 would write', () => {
  const r = FST.convert(fl25);
  assert.strictEqual(r.status, 'converted');
  assert.strictEqual(r.fromVersion, '25.1.6.4997');
  assert.strictEqual(r.toVersion, '21.2.3.4004');
  assert.deepStrictEqual(Buffer.from(r.output), Buffer.from(fl21));
});

test('reports the plugin chain by mixer slot', () => {
  const r = FST.convert(fl25);
  assert.strictEqual(r.kind, 'mixer');
  assert.deepStrictEqual(r.plugins.map((p) => `${p.slot}:${p.name}`), ['1:Fruity Parametric EQ 2', '2:Soundgoodizer']);
});

test('relabels Parametric EQ 2 v8 settings as v7, which FL 21 loads without crashing', () => {
  const r = FST.convert(fl25);
  const eq = r.plugins.find((p) => p.internal === 'Fruity Parametric EQ 2');
  assert.deepStrictEqual([eq.status, eq.relabelTo], ['ok', 7]);
  assert.strictEqual(r.settingsFixed, 1);
  assert.ok(r.plugins.every((p) => p.status === 'ok'));
});

test('re-converts a file an earlier version of this tool left with EQ2 at v8', () => {
  const r = FST.convert(basicChain(21, { eq2Version: 8 }));
  assert.strictEqual(r.status, 'converted');
  assert.strictEqual(r.settingsFixed, 1);
  assert.deepStrictEqual(Buffer.from(r.output), Buffer.from(fl21));
});

test('notes the removed FL 24+ field', () => {
  assert.deepStrictEqual(FST.convert(fl25).removedIds, [169]);
});

test('options can switch each fix off', () => {
  const keep = FST.convert(fl25, { removeUnknown: false, fixWrapper: false });
  // only the 8 version bytes and the EQ2 version byte (always fixed) differ from the original
  assert.strictEqual(keep.output.length, fl25.length);
  let diff = 0;
  for (let i = 0; i < fl25.length; i++) if (fl25[i] !== keep.output[i]) diff++;
  assert.strictEqual(diff, 9);
});

test('VST wrapper settings v12 are relabelled v10 when every chunk is one FL 21 knows', () => {
  const r = FST.convert(vstChain(12, [1, 2, 30, 31, 32, 50, 53]));
  assert.strictEqual(r.wrappersFixed, 1);
  const unknown = FST.convert(vstChain(12, [1, 2, 99]));
  assert.strictEqual(unknown.wrappersFixed, 0);
});

test('flags newer settings formats for plugins that pack the version as (version << 16) | 3', () => {
  const grossBeat = (header) => FST.convert(preset({ format: 48, version: '25.1.6.4997', build: 4997, events: [
    [201, utf16('Gross Beat')], [213, new Uint8Array(new Uint32Array([header, 0]).buffer)],
  ] })).plugins[0];
  assert.strictEqual(grossBeat(0x80003).status, 'ok');
  const newer = grossBeat(0x90003);
  assert.strictEqual(newer.status, 'warn');
  assert.match(newer.note, /\(v9; FL 21 uses v8\)/);
});

test('FL21 preset is left alone', () => {
  const r = FST.convert(fl21);
  assert.strictEqual(r.status, 'compatible');
  assert.deepStrictEqual(Buffer.from(r.output), Buffer.from(fl21));
});

test('FL24 plugin preset for a plugin FL21 lacks converts with a warning', () => {
  // Same shape as FL 2024's Transporter preset: format 48, event 169, a plugin FL 21 doesn't have.
  const r = FST.convert(preset({ format: 48, version: '24.1.2.4408', build: 4408, events: [
    [169, 1], [201, utf16('Transporter')], [213, Uint8Array.from([3, 0, 0, 0, 0x32, 0, 0, 0])],
  ] }));
  assert.strictEqual(r.status, 'converted');
  assert.strictEqual(r.kind, 'plugin');
  assert.strictEqual(r.plugins[0].status, 'missing');
  // output must re-parse cleanly as FL21
  const again = FST.convert(r.output);
  assert.strictEqual(again.status, 'compatible');
});

test('rejects files that are not FL presets', () => {
  assert.throws(() => FST.convert(new TextEncoder().encode('hello world, not a preset')), /isn't an FL Studio preset/);
  const cut = fl25.slice(0, 300);
  assert.throws(() => FST.convert(cut), /incomplete/);
});

test('zip writer produces an archive that unzips to the same bytes', () => {
  const a = fl25;
  const b = fl21;
  const zip = FST.zip([{ name: 'a b.fst', data: a }, { name: 'ünï.fst', data: b }]);
  const entries = readStoredZip(Buffer.from(zip));
  assert.deepStrictEqual(entries.map((e) => e.name), ['a b.fst', 'ünï.fst']);
  assert.deepStrictEqual(entries[0].data, Buffer.from(a));
  assert.deepStrictEqual(entries[1].data, Buffer.from(b));
  for (const e of entries) assert.strictEqual(e.crc, crc32(e.data));
});

// Bit-by-bit CRC-32, written independently of the converter's table version (zlib.crc32 needs Node 20.15+).
function crc32(data) {
  let c = 0xffffffff;
  for (const byte of data) { c ^= byte; for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1)); }
  return (c ^ 0xffffffff) >>> 0;
}

function readStoredZip(buf) {
  const eocd = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  const count = buf.readUInt16LE(eocd + 10);
  let off = buf.readUInt32LE(eocd + 16);
  const out = [];
  for (let i = 0; i < count; i++) {
    assert.strictEqual(buf.readUInt32LE(off), 0x02014b50);
    const crc = buf.readUInt32LE(off + 16);
    const size = buf.readUInt32LE(off + 20);
    const nlen = buf.readUInt16LE(off + 28);
    const elen = buf.readUInt16LE(off + 30);
    const clen = buf.readUInt16LE(off + 32);
    const local = buf.readUInt32LE(off + 42);
    const name = buf.slice(off + 46, off + 46 + nlen).toString('utf8');
    const lnl = buf.readUInt16LE(local + 26);
    const lel = buf.readUInt16LE(local + 28);
    const data = buf.slice(local + 30 + lnl + lel, local + 30 + lnl + lel + size);
    out.push({ name, data, crc });
    off += 46 + nlen + elen + clen;
  }
  return out;
}
